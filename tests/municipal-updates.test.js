import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MUNICIPAL = { email: 'municipal@reporteciudadano.cr', password: 'Municipal2026!' }
let directory, databasePath, faultPath, loaderPath, server, municipal
let sequence = 0

async function startServer() {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(process.execPath, ['--import', pathToFileURL(loaderPath).href, 'server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      REPORTE_CIUDADANO_DATABASE_PATH: databasePath,
      REPORTE_CIUDADANO_DEMO_DATA: 'off',
      TEST_STORAGE_FAULT_PATH: faultPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const url = `http://127.0.0.1:${port}`
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(output)
    try {
      if ((await fetch(`${url}/api/auth/session`)).ok) {
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
    } catch { /* El servidor está iniciando. */ }
    await delay(50)
  }
  child.kill()
  throw new Error(`El servidor no inició: ${output}`)
}

function client() {
  let cookie = ''
  return {
    async request(url, { method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(`${server.url}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
      return { status: response.status, body: await response.json() }
    },
  }
}

async function signIn(account = MUNICIPAL) {
  const connection = client()
  assert.equal((await connection.request('/api/auth/login', { method: 'POST', body: account })).status, 200)
  return connection
}

async function createCase() {
  const number = ++sequence
  const credentials = { email: `updates-${number}@example.cr`, password: 'Ciudadano-2026' }
  const owner = client()
  const registration = await owner.request('/api/auth/register', {
    method: 'POST', body: { ...credentials, confirmation: credentials.password, name: `Ciudadano ${number}` },
  })
  assert.equal(registration.status, 201)
  await owner.request('/api/auth/login', { method: 'POST', body: credentials })
  const png = await readFile(path.join(ROOT, 'tests/fixtures/evidence-1.png'))
  const creation = await owner.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': `municipal-case-submission-${number}` },
    body: {
      description: 'Bache que necesita atención municipal.',
      category: 'Infraestructura',
      community: 'Cartago',
      locationReference: 'Frente a la escuela',
      photos: [{ name: 'evidence.png', type: 'image/png', data: png.toString('base64') }],
    },
  })
  assert.equal(creation.status, 201)
  return { owner, credentials, report: creation.body.report, accountId: registration.body.user.id }
}

async function database() {
  return JSON.parse(await readFile(databasePath, 'utf8'))
}

function update(reportId, field, value, expected, { connection = municipal, key = `municipal-update-${++sequence}-key` } = {}) {
  return connection.request(`/api/municipal/reports/${reportId}/${field}`, {
    method: 'PATCH',
    headers: { 'Idempotency-Key': key },
    body: { [field]: value, [field === 'category' ? 'expectedCategory' : 'expectedStatus']: expected },
  })
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'reporte-ciudadano-updates-'))
  databasePath = path.join(directory, 'database.json')
  faultPath = path.join(directory, 'fail-rename')
  loaderPath = path.join(directory, 'storage-fault.mjs')
  // Inyección solo en el proceso de pruebas: falla el reemplazo del archivo.
  // El servidor de la aplicación no contiene interruptores de fallo artificial.
  await writeFile(loaderPath, `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const rename = fs.promises.rename
    fs.promises.rename = async (from, to) => {
      if (to === process.env.REPORTE_CIUDADANO_DATABASE_PATH && fs.existsSync(process.env.TEST_STORAGE_FAULT_PATH)) {
        throw Object.assign(new Error('Fallo de almacenamiento simulado'), { code: 'EACCES' })
      }
      return rename(from, to)
    }
    syncBuiltinESMExports()
  `)
  await writeFile(databasePath, JSON.stringify({ version: 2, accounts: [], sessions: [], reports: [] }))
  server = await startServer()
  municipal = await signIn()
})

after(async () => {
  await server?.stop()
  if (directory) {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('reporte-ciudadano-updates-'))
    await rm(directory, { recursive: true, force: true })
  }
})

test('HU-11/HU-12 migra una base de versión 2 y prepara los avisos', async () => {
  const stored = await database()
  assert.equal(stored.version, 3)
  assert.deepEqual(stored.notifications, [])
  assert.deepEqual(stored.reports, [])
})

test('HU-11 confirma categoría, sincroniza filtros y detalle ciudadano, y conserva los demás datos', async () => {
  const { owner, report } = await createCase()
  const original = (await database()).reports.find((item) => item.id === report.id)
  const result = await update(report.id, 'category', 'Limpieza', 'Infraestructura')
  assert.equal(result.status, 200)
  assert.equal(result.body.changed, true)
  assert.equal(result.body.report.category, 'Limpieza')
  const after = (await database()).reports.find((item) => item.id === report.id)
  const { municipalOperations, ...preserved } = after
  assert.equal(municipalOperations.length, 1)
  assert.deepEqual(preserved, { ...original, category: 'Limpieza' })
  assert.equal((await owner.request(`/api/reports/${report.id}`)).body.report.category, 'Limpieza')
  const oldFilter = await municipal.request('/api/municipal/reports?category=Infraestructura')
  assert.ok(oldFilter.body.reports.every((item) => item.id !== report.id))
  const newFilter = await municipal.request('/api/municipal/reports?category=Limpieza&status=Recibido')
  assert.ok(newFilter.body.reports.some((item) => item.id === report.id))
  assert.deepEqual((await owner.request(`/api/reports/${report.id}/status-events`)).body.events, [])
  assert.deepEqual((await owner.request('/api/notifications')).body.notifications, [])
})

test('HU-11/HU-12 validan categorías, estados, campos y permisos en el servidor', async () => {
  const { owner, report } = await createCase()
  const original = await readFile(databasePath, 'utf8')
  for (const connection of [client(), owner]) {
    for (const [field, value] of [['category', 'Limpieza'], ['status', 'Resuelto']]) {
      const response = await update(report.id, field, value, report[field], { connection })
      assert.equal(response.status, connection === owner ? 403 : 401)
    }
  }
  for (const [field, value] of [['category', 'Otra'], ['status', 'Archivado']]) {
    assert.equal((await update(report.id, field, value, report[field])).status, 400)
  }
  const base = `/api/municipal/reports/${report.id}/category`
  assert.equal((await municipal.request(base, { method: 'PATCH', body: { category: 'Limpieza', expectedCategory: report.category } })).status, 400)
  assert.equal((await municipal.request(base, {
    method: 'PATCH', headers: { 'Idempotency-Key': 'unexpected-property-key-0001' },
    body: { category: 'Limpieza', expectedCategory: report.category, citizenId: 'otra-cuenta' },
  })).status, 400)
  assert.equal((await update('inexistente', 'status', 'Resuelto', 'Recibido')).status, 404)
  assert.equal((await update(report.id, 'status', 'En proceso', 'En revisión')).status, 409)
  assert.equal(await readFile(databasePath, 'utf8'), original)
})

test('HU-12 cada estado efectivo genera exactamente un evento y aviso dirigidos al autor', async () => {
  const { owner, report, accountId } = await createCase()
  const other = await createCase()
  const original = (await database()).reports.find((item) => item.id === report.id)
  let previous = 'Recibido'
  const states = ['En revisión', 'En proceso', 'Resuelto', 'Recibido']
  for (const value of states) {
    const changed = await update(report.id, 'status', value, previous)
    assert.equal(changed.status, 200)
    assert.equal(changed.body.changed, true)
    assert.equal((await owner.request(`/api/reports/${report.id}`)).body.report.status, value)
    previous = value
  }
  const stored = await database()
  const after = stored.reports.find((item) => item.id === report.id)
  const { statusEvents, municipalOperations, ...preserved } = after
  assert.deepEqual(preserved, original)
  assert.equal(statusEvents.length, 4)
  assert.equal(municipalOperations.length, 4)
  const notices = (await owner.request('/api/notifications')).body.notifications
  assert.equal(notices.length, 4)
  statusEvents.forEach((event, index) => {
    assert.equal(event.reportId, report.id)
    assert.equal(event.previousStatus, index === 0 ? 'Recibido' : states[index - 1])
    assert.equal(event.newStatus, states[index])
    assert.ok(Number.isFinite(Date.parse(event.createdAt)))
    const notice = stored.notifications.find((item) => item.eventId === event.id)
    assert.equal(notice.citizenId, accountId)
    assert.equal(notice.reportId, report.id)
    assert.equal(notice.newStatus, event.newStatus)
    assert.equal(notice.createdAt, event.createdAt)
    assert.equal(notice.url, `/ciudadano/reportes/${report.id}`)
    assert.ok(notices.some((item) => item.id === notice.id && !('citizenId' in item)))
  })
  assert.deepEqual((await other.owner.request(`/api/notifications?citizenId=${accountId}`)).body.notifications, [])
  assert.equal((await other.owner.request(`/api/reports/${report.id}/status-events`)).status, 404)
  assert.equal((await client().request('/api/notifications')).status, 401)
  assert.equal((await municipal.request('/api/notifications')).status, 403)
  assert.deepEqual((await municipal.request(`/api/reports/${report.id}/status-events`)).body.events, statusEvents)
})

test('HU-12 guardar el mismo estado o categoría no escribe datos ni crea eventos o avisos', async () => {
  const { report } = await createCase()
  const original = await readFile(databasePath, 'utf8')
  for (const field of ['category', 'status']) {
    const response = await update(report.id, field, report[field], report[field])
    assert.equal(response.status, 200)
    assert.equal(response.body.changed, false)
  }
  assert.equal(await readFile(databasePath, 'utf8'), original)
})

test('HU-11/HU-12 los envíos concurrentes y los reintentos tardíos son idempotentes', async () => {
  const { owner, report } = await createCase()
  const key = 'concurrent-status-key-0001'
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => update(report.id, 'status', 'En revisión', 'Recibido', { key })))
  assert.ok(concurrent.every((response) => response.status === 200))
  assert.equal(concurrent.filter((response) => response.body.changed).length, 1)
  const sameValue = await update(report.id, 'status', 'En revisión', 'Recibido')
  assert.equal(sameValue.body.changed, false, 'otra clave con el mismo estado tampoco duplica el cambio')
  await update(report.id, 'status', 'En proceso', 'En revisión')
  const replay = await update(report.id, 'status', 'En revisión', 'Recibido', { key })
  assert.equal(replay.body.repeated, true)
  assert.equal(replay.body.report.status, 'En proceso', 'un reintento tardío no revierte un cambio posterior')
  assert.equal((await update(report.id, 'status', 'Resuelto', 'En proceso', { key })).status, 409)
  assert.equal((await owner.request(`/api/reports/${report.id}/status-events`)).body.events.length, 2)
  assert.equal((await owner.request('/api/notifications')).body.notifications.length, 2)
  const categoryKey = 'concurrent-category-key-0001'
  const categories = await Promise.all(Array.from({ length: 3 }, () => update(report.id, 'category', 'Limpieza', 'Infraestructura', { key: categoryKey })))
  assert.equal(categories.filter((response) => response.body.changed).length, 1)
  await update(report.id, 'category', 'Espacios públicos', 'Limpieza')
  assert.equal((await update(report.id, 'category', 'Limpieza', 'Infraestructura', { key: categoryKey })).body.report.category, 'Espacios públicos')
})

test('HU-12 confirma actualización y aviso dentro de dos segundos en la base de demostración', async (context) => {
  const { owner, report } = await createCase()
  const start = performance.now()
  const response = await update(report.id, 'status', 'En revisión', 'Recibido')
  assert.equal(response.status, 200)
  const notifications = await owner.request('/api/notifications')
  assert.equal(notifications.body.notifications.length, 1)
  assert.equal((await owner.request(`/api/reports/${report.id}`)).body.report.status, 'En revisión')
  const elapsed = performance.now() - start
  context.diagnostic(`Cambio confirmado, aviso y consulta ciudadana disponibles en ${elapsed.toFixed(1)} ms`)
  assert.ok(elapsed < 2000, `La operación tardó ${elapsed.toFixed(1)} ms`)
})

test('HU-11/HU-12 un fallo al reemplazar el archivo revierte todos los datos y permite reintentar', async () => {
  const { owner, report } = await createCase()
  for (const [field, value] of [['category', 'Limpieza'], ['status', 'En revisión']]) {
    const original = await readFile(databasePath, 'utf8')
    const key = `storage-fault-${field}-0001`
    await writeFile(faultPath, 'fail')
    try {
      const failed = await update(report.id, field, value, report[field], { key })
      assert.equal(failed.status, 500)
      assert.equal(await readFile(databasePath, 'utf8'), original)
      assert.ok((await readdir(directory)).every((name) => !name.includes('.tmp-')))
    } finally {
      await rm(faultPath, { force: true })
    }
    assert.equal((await update(report.id, field, value, report[field], { key })).status, 200)
  }
  assert.equal((await owner.request('/api/notifications')).body.notifications.length, 1)
  assert.equal((await owner.request(`/api/reports/${report.id}/status-events`)).body.events.length, 1)
})

test('HU-11/HU-12 conserva cambios, eventos, avisos y evidencias tras reiniciar y volver a ingresar', async () => {
  const { owner, credentials, report } = await createCase()
  await update(report.id, 'category', 'Espacios públicos', 'Infraestructura')
  await update(report.id, 'status', 'Resuelto', 'Recibido')
  const original = await database()
  await owner.request('/api/auth/logout', { method: 'POST' })
  await server.stop()
  server = await startServer()
  municipal = await signIn()
  const reentered = await signIn(credentials)
  const detail = await reentered.request(`/api/reports/${report.id}`)
  assert.equal(detail.body.report.category, 'Espacios públicos')
  assert.equal(detail.body.report.status, 'Resuelto')
  assert.deepEqual(detail.body.report.photos, report.photos)
  assert.equal((await reentered.request('/api/notifications')).body.notifications.length, 1)
  assert.equal((await reentered.request(`/api/reports/${report.id}/status-events`)).body.events.length, 1)
  const stored = await database()
  assert.deepEqual(stored.reports, original.reports)
  assert.deepEqual(stored.notifications, original.notifications)
})
