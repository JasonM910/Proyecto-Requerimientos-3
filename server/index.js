import { randomBytes, pbkdf2, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES, photoValidationError } from '../shared/photoRules.js'
import { REPORT_CATEGORIES as CATEGORY_LIST, REPORT_STATUSES } from '../shared/reportRules.js'
import { createDemoReports, createDemoStatusEvents } from './demoData.js'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DATABASE_PATH = path.resolve(
  process.env.REPORTE_CIUDADANO_DATABASE_PATH ??
    path.join(DATA_DIR, 'database.json'),
)
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const SESSION_COOKIE = 'reporte_ciudadano_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const PASSWORD_ITERATIONS = 120_000
const PASSWORD_BYTES = 32
const MAX_REQUEST_BYTES = 16 * 1024
// Tres imágenes de 5 MiB codificadas en base64, más los campos del reporte.
const MAX_REPORT_REQUEST_BYTES = MAX_PHOTOS * Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + MAX_REQUEST_BYTES
const DATABASE_VERSION = 3
const REPORT_CATEGORIES = new Set(CATEGORY_LIST)
const REPORT_STATUS_SET = new Set(REPORT_STATUSES)
// Los datos ficticios de la bandeja municipal se pueden desactivar con =off.
const DEMO_DATA_ENABLED = process.env.REPORTE_CIUDADANO_DEMO_DATA !== 'off'
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
    version: DATABASE_VERSION,
    accounts: [],
    sessions: [],
    reports: [],
    notifications: [],
  }
}

function validateDatabase(database) {
  if (
    !database ||
    ![1, 2, DATABASE_VERSION].includes(database.version) ||
    !Array.isArray(database.accounts) ||
    !Array.isArray(database.sessions) ||
    (database.reports !== undefined && !Array.isArray(database.reports)) ||
    (database.version >= 2 &&
      !Array.isArray(database.reports)) ||
    (database.notifications !== undefined && !Array.isArray(database.notifications)) ||
    (database.version === DATABASE_VERSION && !Array.isArray(database.notifications))
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
      try {
        await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        })
        await rename(temporaryPath, DATABASE_PATH)
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {})
        throw error
      }
    }

    return result?.value
  })

  writeQueue = operation.catch(() => {})
  return operation
}

async function initializeDatabase() {
  await mkdir(path.dirname(DATABASE_PATH), { recursive: true })

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
    const needsMigration =
      database.version !== DATABASE_VERSION ||
      !Array.isArray(database.reports) ||
      !Array.isArray(database.notifications)
    database.version = DATABASE_VERSION
    database.reports ??= []
    database.notifications ??= []

    const existing = database.accounts.find(
      (account) => account.email === DEMO_MUNICIPAL_ACCOUNT.email,
    )
    const needsDemoReports =
      DEMO_DATA_ENABLED && !database.reports.some((report) => report.demo === true)
    if (needsDemoReports) {
      database.reports.push(...createDemoReports())
    }
    // HU-13: los reportes ficticios sembrados antes del historial reciben los
    // cambios de estado que explican su estado actual.
    let needsDemoHistory = false
    for (const report of database.reports) {
      if (report.demo === true && !Array.isArray(report.statusEvents)) {
        report.statusEvents = createDemoStatusEvents(report)
        needsDemoHistory = true
      }
    }
    if (existing && !needsMigration && !needsDemoReports && !needsDemoHistory) {
      return { changed: false }
    }

    if (!existing) {
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
    }

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

async function readJsonBody(request, maxBytes = MAX_REQUEST_BYTES) {
  let size = 0
  const chunks = []

  for await (const chunk of request) {
    size += chunk.length
    if (size <= maxBytes) {
      chunks.push(chunk)
    }
  }
  if (size > maxBytes) {
    throw new HttpError(413, 'La solicitud excede el tamaño permitido.')
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

function publicReport(report) {
  return {
    id: report.id,
    description: report.description,
    category: report.category,
    community: report.community,
    locationReference: report.locationReference,
    createdAt: report.createdAt,
    status: report.status,
    photos: (report.photos ?? []).map((photo) => publicPhoto(report.id, photo)),
    history: reportHistory(report),
  }
}

function publicPhoto(reportId, photo) {
  return {
    id: photo.id,
    name: photo.name,
    type: photo.type,
    size: photo.size,
    url: `/api/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(photo.id)}`,
  }
}

function validatePhotos(value = []) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'Las fotografías deben enviarse como una lista.')
  }
  if (value.length > MAX_PHOTOS) {
    throw new HttpError(400, 'Podés adjuntar un máximo de tres fotografías.')
  }

  const seen = new Set()
  const photos = []
  for (const photo of value) {
    if (!photo || typeof photo.name !== 'string' || !photo.name.trim() || photo.name.length > 255) {
      throw new HttpError(400, 'Cada fotografía debe tener un nombre válido de hasta 255 caracteres.')
    }
    if (!PHOTO_TYPES.includes(photo.type)) {
      throw new HttpError(400, `${photo.name}: solo se admiten fotografías JPEG y PNG.`)
    }
    if (typeof photo.data !== 'string' || !photo.data.length) {
      throw new HttpError(400, `${photo.name}: el archivo está vacío o no contiene una fotografía válida.`)
    }
    if (photo.data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) {
      throw new HttpError(400, `${photo.name}: la fotografía supera el máximo de 5 MB.`)
    }
    const bytes = Buffer.from(photo.data, 'base64')
    if (bytes.toString('base64') !== photo.data) {
      throw new HttpError(400, `${photo.name}: la fotografía no tiene una codificación válida.`)
    }
    const validationError = photoValidationError({ type: photo.type, size: bytes.length })
    if (validationError) throw new HttpError(400, `${photo.name}: ${validationError}`)

    const isPng = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if ((photo.type === 'image/png' && !isPng) || (photo.type === 'image/jpeg' && !isJpeg)) {
      throw new HttpError(400, `${photo.name}: el contenido no corresponde a una fotografía JPEG o PNG válida.`)
    }
    if (seen.has(photo.data)) continue
    seen.add(photo.data)
    photos.push({
      id: randomBytes(16).toString('hex'),
      name: photo.name.trim(),
      type: photo.type,
      size: bytes.length,
      data: photo.data,
    })
  }
  return photos
}

async function findAccessibleReport(request, reportId) {
  const account = await findCurrentAccount(request)
  if (!account) throw new HttpError(401, 'Iniciá sesión para continuar.')
  const report = await updateDatabase((database) => ({
    changed: false,
    value: database.reports.find((item) =>
      item.id === reportId && (
        (account.role === 'citizen' && item.citizenId === account.id) ||
        account.role === 'municipal'
      ),
    ) ?? null,
  }))
  if (!report) throw new HttpError(404, 'No se encontró ese reporte.')
  return report
}

async function requireCitizen(request) {
  const account = await findCurrentAccount(request)
  if (!account) {
    throw new HttpError(401, 'Iniciá sesión para continuar.')
  }
  if (account.role !== 'citizen') {
    throw new HttpError(
      403,
      'Esta operación está disponible únicamente para cuentas ciudadanas.',
    )
  }

  return account
}

async function requireMunicipal(request) {
  const account = await findCurrentAccount(request)
  if (!account) {
    throw new HttpError(401, 'Iniciá sesión para continuar.')
  }
  if (account.role !== 'municipal') {
    throw new HttpError(
      403,
      'Esta operación está disponible únicamente para el personal municipal.',
    )
  }

  return account
}

function municipalReportSummary(report) {
  return {
    id: report.id,
    category: report.category,
    community: report.community,
    locationReference: report.locationReference,
    createdAt: report.createdAt,
    status: report.status,
  }
}

// HU-13 / RF-14: historial cronológico (del más antiguo al más reciente) que se
// deriva del registro inicial y de los cambios confirmados en `statusEvents`.
// Los eventos no se modifican ni se eliminan: cada cambio nuevo solo agrega uno.
function reportHistory(report) {
  const changes = (report.statusEvents ?? [])
    .map((event, order) => ({ event, order }))
    .sort(
      (left, right) =>
        left.event.createdAt.localeCompare(right.event.createdAt) ||
        left.order - right.order,
    )
    .map(({ event }) => ({
      id: event.id,
      reportId: event.reportId,
      type: 'status-change',
      at: event.createdAt,
      previousStatus: event.previousStatus,
      status: event.newStatus,
    }))

  return [
    {
      id: 'created',
      reportId: report.id,
      type: 'created',
      at: report.createdAt,
      previousStatus: null,
      status: 'Recibido',
    },
    ...changes,
  ]
}

// HU-10 / RF-19: detalle para revisión. Nunca incluye citizenId, la clave de
// idempotencia ni datos de la cuenta que registró el reporte.
function municipalReportDetail(report) {
  return {
    id: report.id,
    description: report.description,
    category: report.category,
    community: report.community,
    locationReference: report.locationReference,
    createdAt: report.createdAt,
    status: report.status,
    photos: (report.photos ?? []).map((photo) => publicPhoto(report.id, photo)),
    history: reportHistory(report),
  }
}

function applyMunicipalUpdate(database, report, field, value, expected, account, key) {
  const previous = (report.municipalOperations ?? []).find(
    (operation) => operation.key === key && operation.accountId === account.id,
  )
  if (previous) {
    if (previous.field !== field || previous.value !== value) {
      throw new HttpError(409, 'Ese envío ya se utilizó para otro cambio. Volvé a abrir la edición.')
    }
    return { changed: false, value: { report: municipalReportDetail(report), changed: false, repeated: true } }
  }
  if (report[field] === value) {
    return { changed: false, value: { report: municipalReportDetail(report), changed: false, repeated: false } }
  }
  if (report[field] !== expected) {
    throw new HttpError(409, 'Otra operación modificó este dato. Se debe volver a consultar el reporte antes de editarlo.')
  }

  const createdAt = new Date().toISOString()
  if (field === 'status') {
    const event = {
      id: randomBytes(16).toString('hex'),
      reportId: report.id,
      previousStatus: report.status,
      newStatus: value,
      createdAt,
    }
    report.statusEvents ??= []
    report.statusEvents.push(event)
    database.notifications.push({
      id: randomBytes(16).toString('hex'),
      citizenId: report.citizenId,
      reportId: report.id,
      eventId: event.id,
      newStatus: value,
      createdAt,
      url: `/ciudadano/reportes/${encodeURIComponent(report.id)}`,
      readAt: null,
    })
  }
  report[field] = value
  report.municipalOperations ??= []
  report.municipalOperations.push({ key, accountId: account.id, field, value })
  return { changed: true, value: { report: municipalReportDetail(report), changed: true, repeated: false } }
}

function readInboxFilter(searchParams, name, validValues, label) {
  const values = searchParams.getAll(name)
  if (values.length > 1) {
    throw new HttpError(400, `Indicá un solo valor para el filtro de ${label}.`)
  }
  const value = (values[0] ?? '').trim()
  if (value && !validValues.has(value)) {
    throw new HttpError(400, `El filtro de ${label} no es válido.`)
  }

  return value
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
  if (pathname === '/api/auth/accounts' && request.method === 'GET') {
    const database = await readDatabase()
    const accounts = database.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      ...(account.demoPassword
        ? { password: account.demoPassword }
        : account.id === DEMO_MUNICIPAL_ACCOUNT.id
        ? { password: DEMO_MUNICIPAL_ACCOUNT.password }
        : {}),
    }))
    sendJson(response, 200, { accounts })
    return
  }

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
      demoPassword: password,
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

    if (account.role === 'citizen' && account.demoPassword !== password) {
      await updateDatabase((currentDatabase) => {
        const currentAccount = currentDatabase.accounts.find(
          (item) => item.id === account.id,
        )
        if (!currentAccount || currentAccount.demoPassword === password) {
          return { changed: false }
        }
        currentAccount.demoPassword = password
        return { changed: true }
      })
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

  if (pathname === '/api/reports' && request.method === 'POST') {
    const account = await requireCitizen(request)
    const body = await readJsonBody(request, MAX_REPORT_REQUEST_BYTES)
    const description =
      typeof body.description === 'string' ? body.description.trim() : ''
    const category = typeof body.category === 'string' ? body.category : ''
    const community =
      typeof body.community === 'string' ? body.community.trim() : ''
    const locationReference =
      typeof body.locationReference === 'string'
        ? body.locationReference.trim()
        : ''
    const idempotencyKey = request.headers['idempotency-key']

    if (!description) {
      throw new HttpError(400, 'Escribí una descripción del problema.')
    }
    if (!REPORT_CATEGORIES.has(category)) {
      throw new HttpError(400, 'Seleccioná una categoría para el reporte.')
    }
    if (!community) {
      throw new HttpError(400, 'Ingresá la comunidad o localidad.')
    }
    if (!locationReference) {
      throw new HttpError(400, 'Ingresá una referencia para ubicar el problema.')
    }
    if (
      typeof idempotencyKey !== 'string' ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)
    ) {
      throw new HttpError(
        400,
        'No se pudo identificar el envío. Volvé a intentarlo.',
      )
    }

    const photos = validatePhotos(body.photos)
    const result = await updateDatabase((database) => {
      const existing = database.reports.find(
        (report) =>
          report.citizenId === account.id &&
          report.idempotencyKey === idempotencyKey,
      )
      if (existing) {
        return {
          changed: false,
          value: { report: publicReport(existing), created: false },
        }
      }

      const now = new Date()
      const datePart = now.toISOString().slice(0, 10).replaceAll('-', '')
      let id
      do {
        id = `RC-${datePart}-${randomBytes(4).toString('hex').toUpperCase()}`
      } while (database.reports.some((report) => report.id === id))

      const report = {
        id,
        citizenId: account.id,
        idempotencyKey,
        description,
        category,
        community,
        locationReference,
        createdAt: now.toISOString(),
        status: 'Recibido',
        photos,
      }
      database.reports.push(report)

      return {
        changed: true,
        value: { report: publicReport(report), created: true },
      }
    })

    sendJson(response, result.created ? 201 : 200, result)
    return
  }

  if (pathname === '/api/reports' && request.method === 'GET') {
    const account = await requireCitizen(request)
    const reports = await updateDatabase((database) => ({
      changed: false,
      value: database.reports
        .filter((report) => report.citizenId === account.id)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        )
        .map(publicReport),
    }))

    sendJson(response, 200, { reports })
    return
  }

  // HU-09 / RF-18: bandeja municipal de solo lectura, con filtros opcionales.
  if (pathname === '/api/municipal/reports' && request.method === 'GET') {
    await requireMunicipal(request)
    const { searchParams } = new URL(request.url, 'http://localhost')
    const category = readInboxFilter(
      searchParams,
      'category',
      REPORT_CATEGORIES,
      'categoría',
    )
    const status = readInboxFilter(searchParams, 'status', REPORT_STATUS_SET, 'estado')

    const result = await updateDatabase((database) => {
      const matches = database.reports
        .filter(
          (report) =>
            (!category || report.category === category) &&
            (!status || report.status === status),
        )
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        )
        .map(municipalReportSummary)

      return {
        changed: false,
        value: { reports: matches, total: database.reports.length },
      }
    })

    sendJson(response, 200, result)
    return
  }

  // HU-11/HU-12: el guardado, evento y aviso comparten la transacción del JSON.
  const municipalUpdateMatch = pathname.match(/^\/api\/municipal\/reports\/([^/]+)\/(category|status)$/)
  if (municipalUpdateMatch && request.method === 'PATCH') {
    const account = await requireMunicipal(request)
    let reportId
    try {
      reportId = decodeURIComponent(municipalUpdateMatch[1])
    } catch {
      throw new HttpError(404, 'No se encontró ese reporte.')
    }
    const field = municipalUpdateMatch[2]
    const expectedField = field === 'category' ? 'expectedCategory' : 'expectedStatus'
    const body = await readJsonBody(request)
    const allowedValues = field === 'category' ? REPORT_CATEGORIES : REPORT_STATUS_SET
    if (Object.keys(body).some((name) => ![field, expectedField].includes(name))) {
      throw new HttpError(400, 'La operación solo permite modificar el dato seleccionado.')
    }
    if (!allowedValues.has(body[field]) || !allowedValues.has(body[expectedField])) {
      throw new HttpError(400, field === 'category'
        ? 'Seleccioná una categoría válida e indicá la categoría original.'
        : 'Seleccioná un estado válido e indicá el estado original.')
    }
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) {
      throw new HttpError(400, 'No se pudo identificar el cambio. Volvé a abrir la edición.')
    }
    const result = await updateDatabase((database) => {
      const report = database.reports.find((item) => item.id === reportId)
      if (!report) throw new HttpError(404, 'No se encontró ese reporte.')
      return applyMunicipalUpdate(database, report, field, body[field], body[expectedField], account, key)
    })
    sendJson(response, 200, result)
    return
  }

  // HU-10 / RF-19: detalle municipal de un reporte.
  const municipalDetailMatch = pathname.match(/^\/api\/municipal\/reports\/([^/]+)$/)
  if (municipalDetailMatch && request.method === 'GET') {
    await requireMunicipal(request)
    let reportId
    try {
      reportId = decodeURIComponent(municipalDetailMatch[1])
    } catch {
      throw new HttpError(404, 'No se encontró ese reporte.')
    }

    const report = await updateDatabase((database) => ({
      changed: false,
      value: database.reports.find((item) => item.id === reportId) ?? null,
    }))
    if (!report) {
      throw new HttpError(404, 'No se encontró ese reporte.')
    }

    sendJson(response, 200, { report: municipalReportDetail(report) })
    return
  }

  // Mecanismos para HU-13/HU-14, sin implementar sus pantallas.
  if (pathname === '/api/notifications' && request.method === 'GET') {
    const account = await requireCitizen(request)
    const notifications = await updateDatabase((database) => ({
      changed: false,
      value: database.notifications
        .filter((notification) => notification.citizenId === account.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((notification) => ({
          id: notification.id,
          reportId: notification.reportId,
          eventId: notification.eventId,
          newStatus: notification.newStatus,
          createdAt: notification.createdAt,
          url: notification.url,
          readAt: notification.readAt,
        })),
    }))
    sendJson(response, 200, { notifications })
    return
  }

  const eventsMatch = pathname.match(/^\/api\/reports\/([^/]+)\/status-events$/)
  if (eventsMatch && request.method === 'GET') {
    let reportId
    try {
      reportId = decodeURIComponent(eventsMatch[1])
    } catch {
      throw new HttpError(404, 'No se encontró ese reporte.')
    }
    const report = await findAccessibleReport(request, reportId)
    sendJson(response, 200, { events: report.statusEvents ?? [] })
    return
  }

  // Evidencias: las fotografías las pueden consultar su dueño y el personal municipal.
  const photosMatch = pathname.match(/^\/api\/reports\/([^/]+)\/photos(?:\/([^/]+))?$/)
  if (photosMatch && request.method === 'GET') {
    let reportId
    let photoId
    try {
      reportId = decodeURIComponent(photosMatch[1])
      photoId = photosMatch[2] ? decodeURIComponent(photosMatch[2]) : null
    } catch {
      throw new HttpError(404, 'No se encontró esa fotografía.')
    }
    const report = await findAccessibleReport(request, reportId)
    if (!photoId) {
      sendJson(response, 200, { photos: (report.photos ?? []).map((photo) => publicPhoto(report.id, photo)) })
      return
    }
    const photo = (report.photos ?? []).find((item) => item.id === photoId)
    if (!photo) throw new HttpError(404, 'No se encontró esa fotografía.')
    const bytes = Buffer.from(photo.data, 'base64')
    response.writeHead(200, {
      'Content-Type': photo.type,
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    })
    response.end(bytes)
    return
  }

  const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/)
  if (reportMatch && request.method === 'GET') {
    const account = await requireCitizen(request)
    let reportId
    try {
      reportId = decodeURIComponent(reportMatch[1])
    } catch {
      throw new HttpError(404, 'No se encontró ese reporte.')
    }

    const report = await updateDatabase((database) => ({
      changed: false,
      value:
        database.reports.find(
          (item) =>
            item.id === reportId && item.citizenId === account.id,
        ) ?? null,
    }))

    if (!report) {
      throw new HttpError(404, 'No se encontró ese reporte.')
    }

    sendJson(response, 200, { report: publicReport(report) })
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
        // La base contiene sesiones y evidencias privadas; Vite no debe servirla.
        fs: {
          deny: [
            '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}',
            '.npmrc', '.yarnrc.yml', '**/.git/**', '**/data/**',
            DATABASE_PATH.replaceAll('\\', '/'),
            `${DATABASE_PATH.replaceAll('\\', '/')}.tmp-*`,
          ],
        },
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