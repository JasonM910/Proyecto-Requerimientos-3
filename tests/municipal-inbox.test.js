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
import { DEMO_CITIZEN_ACCOUNTS } from '../server/demoData.js'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_PATH = path.join(ROOT_DIR, 'server', 'index.js')
const DATABASE_PATH = path.join(
  tmpdir(),
  `reporte-ciudadano-inbox-${process.pid}.json`,
)
const MUNICIPAL = {
  email: 'municipal@reporteciudadano.cr',
  password: 'Municipal2026!',
}
const INBOX = '/api/municipal/reports'
const SUMMARY_FIELDS = [
  'category',
  'community',
  'createdAt',
  'id',
  'locationReference',
  'status',
]

let server

async function findAvailablePort() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = probe.address()
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

async function startServer({ demoData = 'on' } = {}) {
  const port = await findAvailablePort()
  const url = `http://127.0.0.1:${port}`
  let output = ''
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      REPORTE_CIUDADANO_DATABASE_PATH: DATABASE_PATH,
      REPORTE_CIUDADANO_DEMO_DATA: demoData,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`El servidor terminó antes de iniciar:\n${output}`)
    }
    try {
      const response = await fetch(`${url}/api/auth/session`)
      if (response.ok && response.headers.get('content-type')?.includes('json')) {
        return {
          url,
          async stop() {
            if (child.exitCode === null) {
              const exited = once(child, 'exit')
              child.kill()
              await exited
            }
          },
        }
      }
    } catch {
      await delay(50)
    }
  }
  throw new Error(`El servidor no inició a tiempo:\n${output}`)
}

function createClient() {
  let cookie = ''
  return {
    async request(pathname, { body, headers = {}, method = 'GET' } = {}) {
      const requestHeaders = { ...headers }
      if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
      if (cookie) requestHeaders.Cookie = cookie
      const response = await fetch(`${server.url}${pathname}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]
      return { status: response.status, body: await response.json() }
    },
  }
}

async function signInMunicipal() {
  const client = createClient()
  const login = await client.request('/api/auth/login', {
    method: 'POST',
    body: MUNICIPAL,
  })
  assert.equal(login.status, 200)
  return client
}

async function signInCitizen(name, email) {
  const client = createClient()
  const password = 'Ciudadano-2026'
  const registration = await client.request('/api/auth/register', {
    method: 'POST',
    body: { name, email, password, confirmation: password },
  })
  assert.equal(registration.status, 201)
  const login = await client.request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  assert.equal(login.status, 200)
  return client
}

function query(filters) {
  const params = new URLSearchParams(filters)
  return `${INBOX}?${params}`
}

before(async () => {
  server = await startServer()
})

after(async () => {
  await server.stop()
  await rm(DATABASE_PATH, { force: true })
})

test('HU-09 la bandeja muestra identificador, categoría, ubicación, fecha y estado de datos ficticios', async () => {
  const municipal = await signInMunicipal()
  const response = await municipal.request(INBOX)

  assert.equal(response.status, 200)
  assert.equal(response.body.total, 12)
  assert.equal(response.body.reports.length, 12)
  for (const report of response.body.reports) {
    assert.deepEqual(Object.keys(report).sort(), SUMMARY_FIELDS)
    assert.match(report.id, /^RC-\d{8}-[0-9A-F]{8}$/)
    assert.ok(report.locationReference)
    assert.ok(!Number.isNaN(Date.parse(report.createdAt)))
  }
  // Más reciente primero.
  const dates = response.body.reports.map((report) => report.createdAt)
  assert.deepEqual(dates, [...dates].sort().reverse())
})

test('HU-09 los filtros de categoría y estado funcionan solos, combinados y vacíos', async () => {
  const municipal = await signInMunicipal()
  const all = (await municipal.request(INBOX)).body.reports

  const byCategory = await municipal.request(query({ category: 'Limpieza' }))
  assert.equal(byCategory.status, 200)
  assert.deepEqual(
    byCategory.body.reports.map((report) => report.id),
    all.filter((report) => report.category === 'Limpieza').map((report) => report.id),
  )
  assert.ok(byCategory.body.reports.length > 0)
  assert.equal(byCategory.body.total, all.length)

  const byStatus = await municipal.request(query({ status: 'Recibido' }))
  assert.ok(byStatus.body.reports.length > 0)
  assert.ok(byStatus.body.reports.every((report) => report.status === 'Recibido'))

  const combined = await municipal.request(
    query({ category: 'Infraestructura', status: 'Recibido' }),
  )
  assert.deepEqual(
    combined.body.reports.map((report) => report.id),
    all
      .filter((report) => report.category === 'Infraestructura' && report.status === 'Recibido')
      .map((report) => report.id),
  )

  // Filtros vacíos equivalen a «limpiar filtros».
  const cleared = await municipal.request(query({ category: '', status: '' }))
  assert.deepEqual(cleared.body.reports, all)

  // Cada estado del ciclo de vida se puede filtrar.
  for (const status of ['Recibido', 'En revisión', 'En proceso', 'Resuelto']) {
    const response = await municipal.request(query({ status }))
    assert.equal(response.status, 200, status)
    assert.ok(response.body.reports.every((report) => report.status === status))
  }
})

test('HU-09 informa sin error cuando no hay coincidencias y rechaza filtros inválidos', async () => {
  const municipal = await signInMunicipal()

  const noMatches = await municipal.request(
    query({ category: 'Espacios públicos', status: 'Resuelto' }),
  )
  assert.equal(noMatches.status, 200)
  assert.deepEqual(noMatches.body.reports, [])
  assert.equal(noMatches.body.total, 12, 'el total permite distinguir «sin coincidencias»')

  assert.equal((await municipal.request(query({ category: 'Ruido' }))).status, 400)
  assert.equal((await municipal.request(query({ status: 'Archivado' }))).status, 400)
  assert.equal(
    (await municipal.request(`${INBOX}?category=Limpieza&category=Infraestructura`)).status,
    400,
  )
})

test('HU-09 una cuenta ciudadana o sin sesión no puede usar la bandeja', async () => {
  const anonymous = createClient()
  assert.equal((await anonymous.request(INBOX)).status, 401)

  const citizen = await signInCitizen('Ana Ciudadana', 'ana-inbox@example.cr')
  const denied = await citizen.request(INBOX)
  assert.equal(denied.status, 403)
  assert.equal(denied.body.reports, undefined)
  assert.equal((await citizen.request(query({ status: 'Recibido' }))).status, 403)

  // La ruta ciudadana existente no se vio afectada.
  const own = await citizen.request('/api/reports')
  assert.equal(own.status, 200)
  assert.deepEqual(own.body.reports, [])
})

test('HU-09 un reporte nuevo aparece en la bandeja como Recibido sin exponer descripción ni fotos', async () => {
  const citizen = await signInCitizen('Luis Reporta', 'luis-inbox@example.cr')
  const created = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'inbox-submission-0000001' },
    body: {
      description: 'Descripción privada del problema.',
      category: 'Espacios públicos',
      community: 'Comunidad de prueba',
      locationReference: 'Junto al kiosco',
    },
  })
  assert.equal(created.status, 201)

  const municipal = await signInMunicipal()
  const inbox = await municipal.request(
    query({ category: 'Espacios públicos', status: 'Recibido' }),
  )
  const entry = inbox.body.reports.find((report) => report.id === created.body.report.id)
  assert.ok(entry, 'el reporte real se lista junto a los datos ficticios')
  assert.equal(entry.status, 'Recibido')
  assert.equal(entry.locationReference, 'Junto al kiosco')
  assert.equal(entry.description, undefined)
  assert.equal(entry.photos, undefined)
  assert.equal(inbox.body.total, 13)
})

test('HU-09 los datos de ejemplo se siembran una vez y pertenecen solo a cuentas de ejemplo', async () => {
  await server.stop()
  server = await startServer()
  const database = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  const demo = database.reports.filter((report) => report.demo === true)
  assert.equal(demo.length, 12, 'reiniciar no duplica los datos de demostración')
  assert.ok(
    demo.every((report) => database.accounts.some((account) => account.id === report.citizenId && account.demo === true && account.role === 'citizen')),
  )

  const citizen = createClient()
  await citizen.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana-inbox@example.cr', password: 'Ciudadano-2026' },
  })
  const own = await citizen.request('/api/reports')
  assert.ok(own.body.reports.every((report) => !report.id.includes('-D000')))
})

async function fixturePhoto(name, type) {
  const bytes = await readFile(path.join(ROOT_DIR, 'tests', 'fixtures', name))
  return { name, type, data: bytes.toString('base64') }
}

function detailPath(id) {
  return `${INBOX}/${encodeURIComponent(id)}`
}

test('HU-10 el detalle municipal muestra descripción, categoría, ubicación, fotos, fecha, estado e historial del caso', async () => {
  const email = 'carla-detalle@example.cr'
  const citizen = await signInCitizen('Carla Detalle', email)
  const photos = [
    await fixturePhoto('evidence-1.png', 'image/png'),
    await fixturePhoto('evidence-2.jpg', 'image/jpeg'),
  ]
  const created = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'detail-submission-00000001' },
    body: {
      description: 'Poste de luz caído sobre la acera.',
      category: 'Infraestructura',
      community: 'Comunidad de detalle',
      locationReference: 'Frente al parque',
      photos,
    },
  })
  assert.equal(created.status, 201)
  const reportId = created.body.report.id

  const municipal = await signInMunicipal()
  const response = await municipal.request(detailPath(reportId))
  assert.equal(response.status, 200)

  const { report } = response.body
  assert.equal(report.id, reportId)
  assert.equal(report.description, 'Poste de luz caído sobre la acera.')
  assert.equal(report.category, 'Infraestructura')
  assert.equal(report.community, 'Comunidad de detalle')
  assert.equal(report.locationReference, 'Frente al parque')
  assert.equal(report.status, 'Recibido')
  assert.equal(report.createdAt, created.body.report.createdAt)
  assert.equal(report.photos.length, 2)
  assert.equal(report.history.length, 1)
  assert.equal(report.history[0].status, 'Recibido')
  assert.equal(report.history[0].at, report.createdAt)

  // No se exponen credenciales ni datos de la cuenta ciudadana.
  const serialized = JSON.stringify(response.body).toLowerCase()
  for (const secret of [email, 'password', 'hash', 'salt', 'idempotency', 'citizenid']) {
    assert.ok(!serialized.includes(secret), `la respuesta no debe incluir «${secret}»`)
  }
  assert.equal(report.citizenId, undefined)
  assert.equal(report.data, undefined)
  assert.ok(report.photos.every((photo) => photo.data === undefined))

  // El personal municipal puede abrir cada evidencia.
  for (const photo of report.photos) {
    const image = await fetch(`${server.url}${photo.url}`, {
      headers: { Cookie: await municipalCookie() },
    })
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), photo.type)
  }
})

async function municipalCookie() {
  const login = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MUNICIPAL),
  })
  return login.headers.get('set-cookie').split(';')[0]
}

test('HU-10 el detalle de cada reporte de la bandeja corresponde al mismo caso', async () => {
  const municipal = await signInMunicipal()
  const inbox = (await municipal.request(INBOX)).body.reports
  assert.ok(inbox.length >= 12)

  for (const summary of inbox) {
    const { status, body } = await municipal.request(detailPath(summary.id))
    assert.equal(status, 200, summary.id)
    assert.equal(body.report.id, summary.id)
    for (const field of SUMMARY_FIELDS) {
      assert.equal(body.report[field], summary[field], `${summary.id}.${field}`)
    }
    assert.ok(body.report.description, `${summary.id} tiene descripción`)
    assert.ok(Array.isArray(body.report.photos))
    assert.equal(body.report.history[0].id, 'created')
  }

  // Un caso sin fotografías devuelve una lista vacía.
  const demo = await municipal.request(detailPath('RC-20261105-D0000005'))
  assert.deepEqual(demo.body.report.photos, [])
  assert.equal(demo.body.report.status, 'En revisión')
})

test('HU-10 el detalle exige cuenta municipal y responde 404 ante identificadores inexistentes', async () => {
  const anonymous = createClient()
  assert.equal((await anonymous.request(detailPath('RC-20261105-D0000005'))).status, 401)

  const citizen = await signInCitizen('Dani Denegado', 'dani-detalle@example.cr')
  const ownReport = await citizen.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'detail-denied-submission-01' },
    body: {
      description: 'Reporte propio.',
      category: 'Limpieza',
      community: 'Comunidad propia',
      locationReference: 'Esquina norte',
    },
  })
  assert.equal(ownReport.status, 201)
  const denied = await citizen.request(detailPath(ownReport.body.report.id))
  assert.equal(denied.status, 403)
  assert.equal(denied.body.report, undefined)
  // La ciudadanía conserva su propio detalle.
  assert.equal((await citizen.request(`/api/reports/${ownReport.body.report.id}`)).status, 200)

  const municipal = await signInMunicipal()
  assert.equal((await municipal.request(detailPath('RC-20000101-00000000'))).status, 404)
  assert.equal((await municipal.request(`${INBOX}/%E0%A4%A`)).status, 404)
  assert.equal((await municipal.request(`${INBOX}/uno/dos`)).status, 404)
})

test('datos compartidos: tres cuentas de ejemplo pueden consultar solo sus cuatro casos y avisos', async () => {
  const identifiers = new Set()
  let previous
  for (const sample of DEMO_CITIZEN_ACCOUNTS) {
    const owner = createClient()
    const login = await owner.request('/api/auth/login', { method: 'POST', body: { email: sample.email, password: sample.password } })
    assert.equal(login.status, 200)
    assert.equal(login.body.user.id, sample.id)
    const reports = (await owner.request('/api/reports')).body.reports
    assert.equal(reports.length, 4)
    const notices = (await owner.request('/api/notifications')).body.notifications
    assert.ok(notices.length >= 4)
    for (const report of reports) {
      assert.ok(!identifiers.has(report.id))
      identifiers.add(report.id)
      assert.equal(notices.filter((notice) => notice.reportId === report.id).length, report.history.length)
      assert.ok(notices.some((notice) => notice.reportId === report.id && notice.eventId === 'created'))
    }
    assert.ok(notices.every((notice) => reports.some((report) => report.id === notice.reportId)))
    if (previous) {
      assert.equal((await owner.request(`/api/reports/${previous.reportId}`)).status, 404)
      assert.equal((await owner.request(`/api/notifications/${previous.noticeId}/read`, { method: 'PATCH' })).status, 404)
    }
    previous = { reportId: reports[0].id, noticeId: notices[0].id }
  }
  assert.equal(identifiers.size, 12)
})

test('datos compartidos: reiniciar conserva cuentas, lecturas y modificaciones municipales de los ejemplos', async () => {
  const sample = DEMO_CITIZEN_ACCOUNTS[0]
  const owner = createClient()
  await owner.request('/api/auth/login', { method: 'POST', body: { email: sample.email, password: sample.password } })
  const report = (await owner.request('/api/reports')).body.reports[0]
  const municipal = await signInMunicipal()
  const category = report.category === 'Limpieza' ? 'Infraestructura' : 'Limpieza'
  const update = await municipal.request(`${INBOX}/${report.id}/category`, {
    method: 'PATCH', headers: { 'Idempotency-Key': 'sample-preserve-category-0001' },
    body: { category, expectedCategory: report.category },
  })
  assert.equal(update.status, 200)
  const notice = (await owner.request('/api/notifications')).body.notifications[0]
  assert.equal((await owner.request(`/api/notifications/${notice.id}/read`, { method: 'PATCH' })).status, 200)
  const original = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  await server.stop()
  server = await startServer()
  const stored = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  assert.deepEqual(stored.accounts, original.accounts)
  assert.deepEqual(stored.reports, original.reports)
  assert.deepEqual(stored.notifications, original.notifications)
  assert.equal(stored.accounts.filter((account) => account.demo === true).length, 3)
})

test('datos compartidos: migra autores ficticios anteriores sin duplicar casos ni alterar datos personales', async () => {
  const legacy = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  const sampleIds = new Set(DEMO_CITIZEN_ACCOUNTS.map((sample) => sample.id))
  const originalOwners = new Map(legacy.reports.filter((report) => report.demo).map((report) => [report.id, report.citizenId]))
  legacy.accounts = legacy.accounts.filter((account) => !sampleIds.has(account.id))
  const personalAccounts = structuredClone(legacy.accounts)
  for (const report of legacy.reports) if (originalOwners.has(report.id)) report.citizenId = 'demo-seed'
  for (const notice of legacy.notifications) if (originalOwners.has(notice.reportId)) notice.citizenId = 'demo-seed'
  await server.stop()
  await writeFile(DATABASE_PATH, JSON.stringify(legacy), 'utf8')
  server = await startServer()
  const migrated = JSON.parse(await readFile(DATABASE_PATH, 'utf8'))
  assert.deepEqual(migrated.accounts.filter((account) => !sampleIds.has(account.id)), personalAccounts)
  assert.equal(migrated.accounts.filter((account) => sampleIds.has(account.id)).length, 3)
  assert.deepEqual(migrated.reports, legacy.reports.map((report) => originalOwners.has(report.id) ? { ...report, citizenId: originalOwners.get(report.id) } : report))
  assert.deepEqual(migrated.notifications, legacy.notifications.map((notice) => originalOwners.has(notice.reportId) ? { ...notice, citizenId: originalOwners.get(notice.reportId) } : notice))
})
