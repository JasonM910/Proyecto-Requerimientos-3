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
const PAYLOAD = { description: 'Basura en el parque.', category: 'Limpieza', community: 'Cartago', locationReference: 'Frente al kiosco' }
let directory, databasePath, loaderPath, faultPath, server
let sequence = 0

async function startServer() {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(process.execPath, ['--import', pathToFileURL(loaderPath).href, 'server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), REPORTE_CIUDADANO_DATABASE_PATH: databasePath, REPORTE_CIUDADANO_DEMO_DATA: 'off', TEST_STORAGE_FAULT_PATH: faultPath },
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
        return { url, async stop() {
          if (child.exitCode === null) {
            const exited = once(child, 'exit')
            child.kill()
            await exited
          }
        } }
      }
    } catch { /* Iniciando el servidor aislado. */ }
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
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
      return { status: response.status, body: await response.json() }
    },
  }
}

async function citizen() {
  const owner = client()
  const credentials = { email: `notices-${++sequence}@example.cr`, password: 'Ciudadano-2026' }
  const registered = await owner.request('/api/auth/register', { method: 'POST', body: { ...credentials, confirmation: credentials.password, name: 'Ciudadana Avisos' } })
  assert.equal(registered.status, 201)
  assert.equal((await owner.request('/api/auth/login', { method: 'POST', body: credentials })).status, 200)
  return { owner, credentials, accountId: registered.body.user.id }
}

function createReport(owner, key = `notifications-submission-${++sequence}`, body = PAYLOAD) {
  return owner.request('/api/reports', { method: 'POST', headers: { 'Idempotency-Key': key }, body })
}
const list = async (owner) => (await owner.request('/api/notifications')).body.notifications
const readUrl = (id) => `/api/notifications/${encodeURIComponent(id)}/read`
const database = async () => JSON.parse(await readFile(databasePath, 'utf8'))

async function changeState(id, status, expectedStatus, key = `notice-state-change-${++sequence}`) {
  const municipal = client()
  await municipal.request('/api/auth/login', { method: 'POST', body: MUNICIPAL })
  return municipal.request(`/api/municipal/reports/${id}/status`, { method: 'PATCH', headers: { 'Idempotency-Key': key }, body: { status, expectedStatus } })
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'reporte-ciudadano-notifications-'))
  databasePath = path.join(directory, 'database.json')
  faultPath = path.join(directory, 'fail-rename')
  loaderPath = path.join(directory, 'storage-fault.mjs')
  await writeFile(loaderPath, `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const rename = fs.promises.rename
    fs.promises.rename = async (from, to) => {
      if (to === process.env.REPORTE_CIUDADANO_DATABASE_PATH && fs.existsSync(process.env.TEST_STORAGE_FAULT_PATH)) throw new Error('Fallo de escritura simulado')
      return rename(from, to)
    }
    syncBuiltinESMExports()
  `)
  server = await startServer()
})

after(async () => {
  await server?.stop()
  if (directory) {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('reporte-ciudadano-notifications-'))
    await rm(directory, { recursive: true, force: true })
  }
})

test('HU-14 exige sesión ciudadana y permite una bandeja vacía', async () => {
  assert.equal((await client().request('/api/notifications')).status, 401)
  const municipal = client()
  await municipal.request('/api/auth/login', { method: 'POST', body: MUNICIPAL })
  assert.equal((await municipal.request('/api/notifications')).status, 403)
  assert.equal((await municipal.request(readUrl('ajeno'), { method: 'PATCH' })).status, 403)
  const { owner } = await citizen()
  assert.deepEqual(await list(owner), [])
})

test('HU-14 registra una sola recepción junto al reporte incluso con envíos concurrentes', async () => {
  const { owner, accountId } = await citizen()
  const key = 'same-notice-report-key-0001'
  const results = await Promise.all(Array.from({ length: 4 }, () => createReport(owner, key)))
  assert.equal(results.filter((response) => response.status === 201).length, 1)
  const report = results[0].body.report
  assert.ok(results.every((response) => response.body.report.id === report.id))
  const notices = await list(owner)
  assert.equal(notices.length, 1)
  assert.deepEqual(notices[0], {
    id: notices[0].id, reportId: report.id, eventId: 'created', type: 'received',
    newStatus: 'Recibido', createdAt: report.createdAt, url: `/ciudadano/reportes/${report.id}`, readAt: null,
  })
  assert.equal((await database()).notifications.find((notice) => notice.id === notices[0].id).citizenId, accountId)
  assert.equal((await owner.request(notices[0].url.replace('/ciudadano/reportes/', '/api/reports/'))).body.report.id, report.id)
  const invalid = await createReport(owner, 'invalid-notice-report-key-0001', { ...PAYLOAD, description: '' })
  assert.equal(invalid.status, 400)
  assert.deepEqual(await list(owner), notices)
})

test('HU-14 mantiene correspondencia con HU-12/HU-13, orden descendente y ausencia de duplicados', async () => {
  const { owner } = await citizen()
  const report = (await createReport(owner)).body.report
  await changeState(report.id, 'En revisión', 'Recibido')
  const key = 'repeat-notice-state-key-0001'
  await changeState(report.id, 'Recibido', 'En revisión', key)
  await changeState(report.id, 'Recibido', 'En revisión', key)
  await changeState(report.id, 'Recibido', 'Recibido')
  assert.equal((await changeState(report.id, 'Archivado', 'Recibido')).status, 400)
  const notices = await list(owner)
  assert.equal(notices.length, 3)
  assert.deepEqual(notices.map((notice) => notice.type), ['status-change', 'status-change', 'received'])
  assert.deepEqual(notices.map((notice) => notice.newStatus), ['Recibido', 'En revisión', 'Recibido'])
  assert.ok(notices.every((notice) => notice.readAt === null))
  const history = (await owner.request(`/api/reports/${report.id}`)).body.report.history
  notices.forEach((notice, index) => {
    assert.ok(history.some((entry) => entry.id === notice.eventId && entry.at === notice.createdAt && entry.status === notice.newStatus))
    if (index) assert.ok(notices[index - 1].createdAt >= notice.createdAt)
  })
})

test('HU-14 solo el dueño marca la lectura y la repetición conserva readAt y el reporte intacto', async () => {
  const a = await citizen()
  const b = await citizen()
  await createReport(a.owner)
  const own = (await list(a.owner))[0]
  assert.deepEqual(await list(b.owner), [])
  assert.deepEqual((await b.owner.request(`/api/notifications?citizenId=${a.accountId}`)).body.notifications, [])
  assert.equal((await b.owner.request(readUrl(own.id), { method: 'PATCH' })).status, 404)
  assert.equal((await client().request(readUrl(own.id), { method: 'PATCH' })).status, 401)
  assert.equal((await b.owner.request(`/api/reports/${own.reportId}`)).status, 404)
  assert.equal((await a.owner.request(readUrl('inexistente'), { method: 'PATCH' })).status, 404)
  const original = await database()
  const start = Date.now()
  const results = await Promise.all(Array.from({ length: 3 }, () => a.owner.request(readUrl(own.id), { method: 'PATCH', body: { readAt: '1999-01-01', citizenId: b.accountId } })))
  const saved = results[0].body.notification
  assert.ok(Date.parse(saved.readAt) >= start)
  assert.ok(results.every((response) => response.status === 200 && response.body.notification.readAt === saved.readAt))
  assert.deepEqual({ ...saved, readAt: null }, own)
  const after = await database()
  assert.deepEqual(after.reports, original.reports)
  assert.deepEqual(after.notifications, original.notifications.map((notice) => notice.id === own.id ? { ...notice, readAt: saved.readAt } : notice))
  const unchangedFile = await readFile(databasePath, 'utf8')
  await a.owner.request(readUrl(own.id), { method: 'PATCH' })
  assert.equal(await readFile(databasePath, 'utf8'), unchangedFile)
})

test('HU-14 conserva lectura y avisos tras recargar la API, salir y reiniciar el servidor', async () => {
  const { owner, credentials } = await citizen()
  await createReport(owner)
  const notice = (await list(owner))[0]
  await owner.request(readUrl(notice.id), { method: 'PATCH' })
  const before = await list(owner)
  assert.deepEqual(await list(owner), before)
  await owner.request('/api/auth/logout', { method: 'POST' })
  assert.equal((await owner.request(readUrl(notice.id), { method: 'PATCH' })).status, 401)
  await server.stop()
  server = await startServer()
  await owner.request('/api/auth/login', { method: 'POST', body: credentials })
  assert.deepEqual(await list(owner), before)
})

test('HU-14 migra recepciones históricas de forma idempotente sin alterar reportes ni avisos previos', async () => {
  const { owner } = await citizen()
  const report = (await createReport(owner)).body.report
  await changeState(report.id, 'En proceso', 'Recibido')
  const stored = await database()
  stored.notifications = stored.notifications.filter((notice) => !(notice.reportId === report.id && notice.eventId === 'created'))
  const previous = stored.notifications.find((notice) => notice.reportId === report.id)
  previous.readAt = '2026-11-01T10:00:00.000Z'
  stored.reports.push({ ...stored.reports.find((item) => item.id === report.id), id: 'legacy-demo', citizenId: 'demo-seed', demo: true, statusEvents: [] })
  await server.stop()
  await writeFile(databasePath, JSON.stringify(stored))
  server = await startServer()
  const migrated = await database()
  assert.deepEqual(migrated.reports, stored.reports)
  assert.deepEqual(migrated.notifications.find((notice) => notice.id === previous.id), previous)
  const receipts = migrated.notifications.filter((notice) => notice.reportId === report.id && notice.eventId === 'created')
  assert.equal(receipts.length, 1)
  assert.equal(receipts[0].createdAt, report.createdAt)
  assert.equal(receipts[0].newStatus, 'Recibido')
  assert.ok(migrated.notifications.every((notice) => notice.reportId !== 'legacy-demo'))
  await server.stop()
  server = await startServer()
  assert.deepEqual((await database()).notifications, migrated.notifications)
})

test('HU-14 los fallos de almacenamiento no guardan recepciones ni lecturas parciales', async () => {
  const { owner } = await citizen()
  const original = await readFile(databasePath, 'utf8')
  const key = 'failed-receipt-storage-key-0001'
  await writeFile(faultPath, 'fail')
  try {
    assert.equal((await createReport(owner, key)).status, 500)
    assert.equal(await readFile(databasePath, 'utf8'), original)
  } finally { await rm(faultPath, { force: true }) }
  assert.equal((await createReport(owner, key)).status, 201)
  const notice = (await list(owner))[0]
  const beforeRead = await readFile(databasePath, 'utf8')
  await writeFile(faultPath, 'fail')
  try {
    assert.equal((await owner.request(readUrl(notice.id), { method: 'PATCH' })).status, 500)
    assert.equal(await readFile(databasePath, 'utf8'), beforeRead)
    assert.ok((await readdir(directory)).every((name) => !name.includes('.tmp-')))
  } finally { await rm(faultPath, { force: true }) }
  assert.equal((await owner.request(readUrl(notice.id), { method: 'PATCH' })).status, 200)
  assert.equal((await list(owner)).length, 1)
})

test('HU-14 lista y abre un aviso entre 100 dentro de dos segundos en el entorno de prueba', async (context) => {
  const { owner } = await citizen()
  for (let count = 0; count < 100; count++) assert.equal((await createReport(owner)).status, 201)
  const start = performance.now()
  const notices = await list(owner)
  assert.equal(notices.length, 100)
  const opened = await owner.request(readUrl(notices[0].id), { method: 'PATCH' })
  assert.equal(opened.status, 200)
  assert.equal((await owner.request(`/api/reports/${notices[0].reportId}`)).status, 200)
  const elapsed = performance.now() - start
  context.diagnostic(`Listado de 100 avisos, lectura y consulta de reporte: ${elapsed.toFixed(1)} ms`)
  assert.ok(elapsed < 2000)
})
