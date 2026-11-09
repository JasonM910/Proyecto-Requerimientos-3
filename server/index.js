import { randomBytes, pbkdf2, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DATABASE_PATH = path.join(DATA_DIR, 'database.json')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const SESSION_COOKIE = 'reporte_ciudadano_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const PASSWORD_ITERATIONS = 120_000
const PASSWORD_BYTES = 32
const MAX_REQUEST_BYTES = 16 * 1024
const PORT = Number(process.env.PORT) || 5173
const IS_PRODUCTION = process.argv.includes('--production')

export const DEMO_MUNICIPAL_ACCOUNT = Object.freeze({
  id: 'demo-municipal',
  name: 'Personal municipal',
  email: 'municipal@reporteciudadano.cr',
  password: 'Municipal2026!',
  role: 'municipal',
})

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let writeQueue = Promise.resolve()
let vite

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function derivePasswordHash(password, salt) {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, PASSWORD_ITERATIONS, PASSWORD_BYTES, 'sha256', (error, hash) => {
      if (error) {
        reject(error)
        return
      }

      resolve(hash)
    })
  })
}

function createEmptyDatabase() {
  return {
    version: 1,
    accounts: [],
    sessions: [],
  }
}

function validateDatabase(database) {
  if (
    !database ||
    database.version !== 1 ||
    !Array.isArray(database.accounts) ||
    !Array.isArray(database.sessions)
  ) {
    throw new Error('El archivo JSON de la base de datos no tiene un formato válido.')
  }

  return database
}

async function readDatabase() {
  let content
  try {
    content = await readFile(DATABASE_PATH, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'No se encontró data/database.json. Reiniciá el servidor para crear la base de datos.',
        { cause: error },
      )
    }

    throw error
  }

  try {
    return validateDatabase(JSON.parse(content))
  } catch (error) {
    throw new Error(`No se pudo leer data/database.json: ${error.message}`, {
      cause: error,
    })
  }
}

function updateDatabase(update) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase()
    const result = await update(database)
    if (result?.changed) {
      const temporaryPath = `${DATABASE_PATH}.tmp-${randomBytes(6).toString('hex')}`
      await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      })
      await rename(temporaryPath, DATABASE_PATH)
    }

    return result?.value
  })

  writeQueue = operation.catch(() => {})
  return operation
}

async function initializeDatabase() {
  await mkdir(DATA_DIR, { recursive: true })

  try {
    await readDatabase()
  } catch (error) {
    if (!error.message.startsWith('No se encontró data/database.json.')) {
      throw error
    }

    await writeFile(
      DATABASE_PATH,
      `${JSON.stringify(createEmptyDatabase(), null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
  }

  await updateDatabase(async (database) => {
    const existing = database.accounts.find(
      (account) => account.email === DEMO_MUNICIPAL_ACCOUNT.email,
    )
    if (existing) {
      return { changed: false }
    }

    const salt = randomBytes(16)
    const passwordHash = await derivePasswordHash(
      DEMO_MUNICIPAL_ACCOUNT.password,
      salt,
    )
    database.accounts.push({
      id: DEMO_MUNICIPAL_ACCOUNT.id,
      name: DEMO_MUNICIPAL_ACCOUNT.name,
      email: DEMO_MUNICIPAL_ACCOUNT.email,
      role: DEMO_MUNICIPAL_ACCOUNT.role,
      salt: salt.toString('hex'),
      passwordHash: passwordHash.toString('hex'),
      createdAt: new Date().toISOString(),
    })

    return { changed: true }
  })
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf('=')
        return [
          item.slice(0, separator),
          decodeURIComponent(item.slice(separator + 1)),
        ]
      }),
  )
}

function setSessionCookie(response, token) {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  )
}

function clearSessionCookie(response) {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
  )
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  response.end(JSON.stringify(value))
}

async function readJsonBody(request) {
  let size = 0
  const chunks = []

  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) {
      throw new HttpError(413, 'La solicitud excede el tamaño permitido.')
    }
    chunks.push(chunk)
  }

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('El cuerpo debe ser un objeto JSON.')
    }

    return body
  } catch {
    throw new HttpError(400, 'La solicitud no contiene un JSON válido.')
  }
}

function publicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
  }
}

async function createSession(account, response) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000

  await updateDatabase((database) => {
    database.sessions = database.sessions.filter(
      (session) => session.expiresAt > Date.now(),
    )
    database.sessions.push({
      token,
      accountId: account.id,
      expiresAt,
    })
    return { changed: true }
  })

  setSessionCookie(response, token)
  return publicAccount(account)
}

async function findCurrentAccount(request) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) {
    return null
  }

  return updateDatabase((database) => {
    const session = database.sessions.find((item) => item.token === token)
    if (!session) {
      return { changed: false, value: null }
    }

    if (session.expiresAt <= Date.now()) {
      database.sessions = database.sessions.filter(
        (item) => item.token !== token,
      )
      return { changed: true, value: null }
    }

    const account = database.accounts.find(
      (item) => item.id === session.accountId,
    )
    return {
      changed: false,
      value: account ? publicAccount(account) : null,
    }
  })
}

async function handleApiRequest(request, response, pathname) {
  if (pathname === '/api/auth/register' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email =
      typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const confirmation =
      typeof body.confirmation === 'string' ? body.confirmation : ''

    if (!name || !email || !password || !confirmation) {
      throw new HttpError(400, 'Completá todos los campos para crear la cuenta.')
    }
    if (!isValidEmail(email)) {
      throw new HttpError(400, 'Ingresá un correo electrónico válido.')
    }
    if (password !== confirmation) {
      throw new HttpError(400, 'Las contraseñas no coinciden.')
    }
    if (email === DEMO_MUNICIPAL_ACCOUNT.email) {
      throw new HttpError(
        400,
        'Ese correo está reservado para la cuenta municipal de demostración.',
      )
    }

    const salt = randomBytes(16)
    const passwordHash = await derivePasswordHash(password, salt)
    const account = {
      id: randomBytes(16).toString('hex'),
      name,
      email,
      role: 'citizen',
      salt: salt.toString('hex'),
      passwordHash: passwordHash.toString('hex'),
      createdAt: new Date().toISOString(),
    }

    await updateDatabase((database) => {
      if (database.accounts.some((item) => item.email === email)) {
        throw new HttpError(
          409,
          'Ya existe una cuenta con ese correo electrónico.',
        )
      }
      database.accounts.push(account)
      return { changed: true }
    })

    sendJson(response, 201, { user: publicAccount(account) })
    return
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const email =
      typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      throw new HttpError(400, 'Ingresá tu correo electrónico y contraseña.')
    }
    if (!isValidEmail(email)) {
      throw new HttpError(400, 'Ingresá un correo electrónico válido.')
    }

    const database = await readDatabase()
    const account = database.accounts.find((item) => item.email === email)
    if (!account || !['citizen', 'municipal'].includes(account.role)) {
      throw new HttpError(
        401,
        'El correo electrónico o la contraseña son incorrectos.',
      )
    }

    const attemptedHash = await derivePasswordHash(
      password,
      Buffer.from(account.salt, 'hex'),
    )
    const storedHash = Buffer.from(account.passwordHash, 'hex')
    if (
      attemptedHash.length !== storedHash.length ||
      !timingSafeEqual(attemptedHash, storedHash)
    ) {
      throw new HttpError(
        401,
        'El correo electrónico o la contraseña son incorrectos.',
      )
    }

    const user = await createSession(account, response)
    sendJson(response, 200, { user })
    return
  }

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const user = await findCurrentAccount(request)
    sendJson(response, 200, { user })
    return
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const token = parseCookies(request)[SESSION_COOKIE]
    if (token) {
      await updateDatabase((database) => {
        const sessions = database.sessions.filter(
          (session) => session.token !== token,
        )
        if (sessions.length === database.sessions.length) {
          return { changed: false }
        }
        database.sessions = sessions
        return { changed: true }
      })
    }

    clearSessionCookie(response)
    sendJson(response, 200, { ok: true })
    return
  }

  sendJson(response, 404, { error: 'No se encontró ese servicio.' })
}

async function serveStaticFile(request, response, pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    response.writeHead(400).end('Ruta no válida')
    return
  }

  const candidate = path.resolve(DIST_DIR, `.${decodedPath}`)
  if (candidate !== DIST_DIR && !candidate.startsWith(`${DIST_DIR}${path.sep}`)) {
    response.writeHead(403).end('Acceso denegado')
    return
  }

  let filePath = candidate
  try {
    const fileInfo = await stat(filePath)
    if (fileInfo.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
    await stat(filePath)
  } catch {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  try {
    const content = await readFile(filePath)
    const contentType =
      MIME_TYPES.get(path.extname(filePath)) ?? 'application/octet-stream'
    response.writeHead(200, {
      'Cache-Control': path.basename(filePath) === 'index.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(content)
  } catch {
    response.writeHead(404).end('No se encontró la página. Ejecutá npm run build.')
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApiRequest(request, response, url.pathname)
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
        return
      }

      console.error('Error al procesar la base de datos JSON:', error)
      sendJson(response, 500, {
        error: 'No se pudo completar la operación. Revisá data/database.json.',
      })
    }
    return
  }

  if (IS_PRODUCTION) {
    await serveStaticFile(request, response, url.pathname)
    return
  }

  vite.middlewares(request, response, (error) => {
    if (error) {
      console.error('Error del servidor de desarrollo:', error)
      if (!response.headersSent) {
        response.writeHead(500).end('No se pudo cargar la aplicación.')
      }
      return
    }

    if (!response.writableEnded) {
      response.writeHead(404).end('No se encontró la página.')
    }
  })
}

async function startServer() {
  await initializeDatabase()
  const server = createServer((request, response) => {
    void handleRequest(request, response)
  })

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
      },
    })
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `Reporte Ciudadano disponible en http://127.0.0.1:${PORT}${IS_PRODUCTION ? '' : ' (desarrollo)'}`,
    )
    console.log(`Base de datos JSON: ${DATABASE_PATH}`)
  })

  const shutdown = async () => {
    await vite?.close()
    server.close(() => process.exit(0))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

startServer().catch((error) => {
  console.error('No se pudo iniciar Reporte Ciudadano:', error)
  process.exitCode = 1
})
