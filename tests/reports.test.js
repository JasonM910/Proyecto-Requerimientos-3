import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_PATH = path.join(ROOT_DIR, 'server', 'index.js')
const DATABASE_PATH = path.join(
  tmpdir(),
  `reporte-ciudadano-test-${process.pid}.json`,
)
const MUNICIPAL_EMAIL = 'municipal@reporteciudadano.cr'
const MUNICIPAL_PASSWORD = 'Municipal2026!'
const CATEGORIES = ['Infraestructura', 'Limpieza', 'Espacios públicos']

let serverProcess
let serverUrl
let serverOutput = ''

async function findAvailablePort() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`El servidor terminó antes de iniciar:\n${serverOutput}`)
    }

    try {
      const response = await fetch(`${serverUrl}/api/auth/session`)
      if (response.ok && response.headers.get('content-type')?.includes('json')) {
        return
      }
    } catch {
      await delay(50)
    }
  }

  throw new Error(`El servidor no inició a tiempo:\n${serverOutput}`)
}

function createClient() {
  let cookie = ''

  return {
    async request(pathname, { body, headers = {}, method = 'GET' } = {}) {
      const requestHeaders = { ...headers }
      if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json'
      }
      if (cookie) {
        requestHeaders.Cookie = cookie
      }

      const response = await fetch(`${serverUrl}${pathname}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) {
        cookie = setCookie.startsWith('reporte_ciudadano_session=;')
          ? ''
          : setCookie.split(';')[0]
      }

      return {
        status: response.status,
        body: await response.json(),
        elapsed: Number(response.headers.get('server-timing-ms') ?? 0),
      }
    },

    clearCookie() {
      cookie = ''
    },
  }
}

async function registerAndSignIn(client, name, email, password) {
  const registration = await client.request('/api/auth/register', {
    method: 'POST',
    body: { name, email, password, confirmation: password },
  })
  assert.equal(registration.status, 201)
  assert.equal(registration.body.user.role, 'citizen')

  const login = await client.request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  assert.equal(login.status, 200)
  return login.body.user
}

before(async () => {
  await writeFile(
    DATABASE_PATH,
    JSON.stringify({
      version: 1,
      accounts: [
        {
          id: 'existing-citizen',
          name: 'Ciudadano existente',
          email: 'existing-citizen@example.cr',
          role: 'citizen',
          salt: 'a'.repeat(32),
          passwordHash: 'b'.repeat(64),
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sessions: [],
    }),
    { encoding: 'utf8', flag: 'wx' },
  )
  const port = await findAvailablePort()
  serverUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      REPORTE_CIUDADANO_DATABASE_PATH: DATABASE_PATH,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProcess.stdout.setEncoding('utf8')
  serverProcess.stderr.setEncoding('utf8')
  serverProcess.stdout.on('data', (chunk) => {
    serverOutput += chunk
  })
  serverProcess.stderr.on('data', (chunk) => {
    serverOutput += chunk
  })

  await waitForServer()
})

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    const exited = once(serverProcess, 'exit')
    serverProcess.kill()
    await exited
  }
  await rm(DATABASE_PATH, { force: true })
})

test('migra la base JSON anterior y agrega reportes sin perder la cuenta municipal', async () => {
  const database = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  assert.equal(database.version, 2)
  assert.deepEqual(database.reports, [])
  assert.ok(
    database.accounts.some(
      (account) => account.email === 'existing-citizen@example.cr',
    ),
  )
  assert.ok(
    database.accounts.some(
      (account) =>
        account.email === MUNICIPAL_EMAIL && account.role === 'municipal',
    ),
  )
})

test('el registro y el inicio de sesión habilitan autocompletar en modo demo', async () => {
  const anonymous = createClient()
  const initialList = await anonymous.request('/api/auth/accounts')
  assert.equal(initialList.status, 200)
  const municipalAccount = initialList.body.accounts.find(
    (account) => account.email === MUNICIPAL_EMAIL,
  )
  assert.ok(municipalAccount)
  assert.equal(municipalAccount.password, MUNICIPAL_PASSWORD)
  assert.equal('passwordHash' in municipalAccount, false)
  assert.equal('salt' in municipalAccount, false)

  const registration = await anonymous.request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Cuenta en la lista',
      email: 'account-list@example.cr',
      password: 'AccountList-2026',
      confirmation: 'AccountList-2026',
    },
  })
  assert.equal(registration.status, 201)

  const refreshedList = await anonymous.request('/api/auth/accounts')
  const citizenAccount = refreshedList.body.accounts.find(
    (account) => account.email === 'account-list@example.cr',
  )
  assert.equal(citizenAccount.name, 'Cuenta en la lista')
  assert.equal(citizenAccount.role, 'citizen')
  assert.equal(citizenAccount.password, 'AccountList-2026')

  const legacyRegistration = await anonymous.request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Cuenta existente',
      email: 'legacy-account@example.cr',
      password: 'LegacyAccount-2026',
      confirmation: 'LegacyAccount-2026',
    },
  })
  assert.equal(legacyRegistration.status, 201)
  const database = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  const legacyAccount = database.accounts.find(
    (account) => account.email === 'legacy-account@example.cr',
  )
  delete legacyAccount.demoPassword
  await writeFile(DATABASE_PATH, JSON.stringify(database), 'utf8')

  const login = await anonymous.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'legacy-account@example.cr',
      password: 'LegacyAccount-2026',
    },
  })
  assert.equal(login.status, 200)

  const legacyAccountAfterLogin = (
    await anonymous.request('/api/auth/accounts')
  ).body.accounts.find((account) => account.email === 'legacy-account@example.cr')
  assert.equal(legacyAccountAfterLogin.password, 'LegacyAccount-2026')
  assert.ok(refreshedList.body.accounts.every((account) =>
    Object.keys(account).every((key) =>
      ['email', 'id', 'name', 'role', 'password'].includes(key),
    ),
  ))
})

test('HU-04 y HU-05 validan y crean un reporte idempotente', async () => {
  const citizen = createClient()
  const citizenAccount = await registerAndSignIn(
    citizen,
    'Ana Prueba',
    'ana-reports@example.cr',
    'AnaDemo-2026',
  )

  const invalidDescription = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'invalid-description-0001' },
    body: {
      description: '   ',
      category: 'Infraestructura',
      community: 'San Rafael',
      locationReference: 'Frente a la escuela',
    },
  })
  assert.equal(invalidDescription.status, 400)
  assert.match(invalidDescription.body.error, /descripción/i)

  const invalidCategory = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'invalid-category-0001' },
    body: {
      description: 'Bache en la calle principal.',
      category: 'Otra',
      community: 'San Rafael',
      locationReference: 'Frente a la escuela',
    },
  })
  assert.equal(invalidCategory.status, 400)
  assert.match(invalidCategory.body.error, /categoría/i)

  const invalidLocation = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'invalid-location-0001' },
    body: {
      description: 'Bache en la calle principal.',
      category: 'Infraestructura',
      community: '   ',
      locationReference: '',
    },
  })
  assert.equal(invalidLocation.status, 400)
  assert.match(invalidLocation.body.error, /comunidad/i)

  const missingReference = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'missing-reference-0001' },
    body: {
      description: 'Bache en la calle principal.',
      category: 'Infraestructura',
      community: 'San Rafael',
      locationReference: '   ',
    },
  })
  assert.equal(missingReference.status, 400)
  assert.match(missingReference.body.error, /referencia/i)
  assert.equal((await citizen.request('/api/reports')).body.reports.length, 0)

  const payload = {
    description: '  Hay un bache grande en la calle principal.  ',
    category: 'Infraestructura',
    community: '  San Rafael  ',
    locationReference: '  Frente a la escuela, 100 m al norte  ',
  }
  const idempotencyKey = 'same-submission-key-0001'
  const createStartedAt = performance.now()
  const [first, repeated] = await Promise.all([
    citizen.request('/api/reports', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: payload,
    }),
    citizen.request('/api/reports', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: payload,
    }),
  ])
  assert.ok(performance.now() - createStartedAt < 2_000)
  assert.ok([200, 201].includes(first.status))
  assert.ok([200, 201].includes(repeated.status))
  assert.equal(first.body.report.id, repeated.body.report.id)

  const report = first.body.report
  assert.match(report.id, /^RC-\d{8}-[A-F0-9]{8}$/)
  assert.equal(report.description, payload.description.trim())
  assert.equal(report.category, payload.category)
  assert.equal(report.community, payload.community.trim())
  assert.equal(report.locationReference, payload.locationReference.trim())
  assert.equal(report.status, 'Recibido')
  assert.ok(Number.isFinite(Date.parse(report.createdAt)))
  assert.equal('citizenId' in report, false)
  assert.equal('idempotencyKey' in report, false)
  assert.equal(
    (await citizen.request('/api/reports')).body.reports.length,
    1,
  )

  const detail = await citizen.request(`/api/reports/${report.id}`)
  assert.equal(detail.status, 200)
  assert.deepEqual(detail.body.report, report)
  assert.equal(citizenAccount.role, 'citizen')
})

test('HU-06 separa propietarios, protege detalles y rechaza rol municipal', async () => {
  const citizenA = createClient()
  const citizenB = createClient()
  await registerAndSignIn(
    citizenA,
    'Ana Separada',
    'ana-separated@example.cr',
    'AnaSeparated-2026',
  )
  const reportAResponse = await citizenA.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'citizen-a-submission-0001' },
    body: {
      description: 'Aceras dañadas en la ruta.',
      category: 'Infraestructura',
      community: 'San Rafael',
      locationReference: 'Costado norte de la plaza',
    },
  })
  assert.equal(reportAResponse.status, 201)
  const reportA = reportAResponse.body.report

  await registerAndSignIn(
    citizenB,
    'Luis Prueba',
    'luis-reports@example.cr',
    'LuisDemo-2026',
  )
  const reportBResponse = await citizenB.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'citizen-b-submission-0001' },
    body: {
      description: 'Basura acumulada en el parque.',
      category: 'Limpieza',
      community: 'San Rafael',
      locationReference: 'Parque central',
    },
  })
  assert.equal(reportBResponse.status, 201)

  const ownList = await citizenB.request('/api/reports')
  assert.deepEqual(
    ownList.body.reports.map((report) => report.id),
    [reportBResponse.body.report.id],
  )
  assert.equal(
    (
      await citizenB.request(`/api/reports/${reportBResponse.body.report.id}`, {
        method: 'PATCH',
        body: { status: 'Resuelto' },
      })
    ).status,
    404,
  )
  assert.equal(
    (
      await citizenB.request(`/api/reports/${reportBResponse.body.report.id}`)
    ).body.report.status,
    'Recibido',
  )
  assert.equal(
    (await citizenB.request(`/api/reports/${reportA.id}`)).status,
    404,
  )

  const municipal = createClient()
  const municipalLogin = await municipal.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: MUNICIPAL_EMAIL,
      password: MUNICIPAL_PASSWORD,
    },
  })
  assert.equal(municipalLogin.status, 200)
  assert.equal((await municipal.request('/api/reports')).status, 403)
  assert.equal(
    (
      await municipal.request(
        `/api/reports/${reportBResponse.body.report.id}`,
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await municipal.request('/api/reports', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'municipal-submit-0001' },
        body: {
          description: 'No autorizado.',
          category: 'Limpieza',
          community: 'San Rafael',
          locationReference: 'Parque',
        },
      })
    ).status,
    403,
  )

  citizenA.clearCookie()
  assert.equal((await citizenA.request('/api/reports')).status, 401)
})

test('HU-06 lista 100 reportes en orden descendente y conserva el detalle', async () => {
  const citizen = createClient()
  const registration = await citizen.request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Cien Reportes',
      email: 'hundred-reports@example.cr',
      password: 'HundredDemo-2026',
      confirmation: 'HundredDemo-2026',
    },
  })
  assert.equal(registration.status, 201)
  const login = await citizen.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'hundred-reports@example.cr',
      password: 'HundredDemo-2026',
    },
  })
  assert.equal(login.status, 200)

  const firstCreatedId = (
    await citizen.request('/api/reports', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'hundred-report-submission-0000' },
      body: {
        description: 'Reporte de prueba 0.',
        category: 'Espacios públicos',
        community: 'Curridabat',
        locationReference: 'Parque número 0',
      },
    })
  ).body.report.id

  for (let index = 1; index < 100; index += 1) {
    const response = await citizen.request('/api/reports', {
      method: 'POST',
      headers: {
        'Idempotency-Key': `hundred-report-submission-${String(index).padStart(4, '0')}`,
      },
      body: {
        description: `Reporte de prueba ${index}.`,
        category: CATEGORIES[index % CATEGORIES.length],
        community: 'Curridabat',
        locationReference: `Parque número ${index}`,
      },
    })
    assert.ok([200, 201].includes(response.status))
  }

  const startedAt = performance.now()
  const list = await citizen.request('/api/reports')
  const elapsedMs = performance.now() - startedAt
  assert.equal(list.status, 200)
  assert.equal(list.body.reports.length, 100)
  assert.ok(elapsedMs < 2_000, `Listar 100 reportes tardó ${elapsedMs} ms`)

  for (let index = 1; index < list.body.reports.length; index += 1) {
    const previous = list.body.reports[index - 1]
    const current = list.body.reports[index]
    assert.ok(previous.createdAt >= current.createdAt)
  }

  const detail = await citizen.request(`/api/reports/${firstCreatedId}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.body.report.description, 'Reporte de prueba 0.')
  assert.equal(detail.body.report.locationReference, 'Parque número 0')
  assert.equal(detail.body.report.status, 'Recibido')
})
