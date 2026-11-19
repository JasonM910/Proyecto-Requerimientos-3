import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MUNICIPAL = { email: 'municipal@reporteciudadano.cr', password: 'Municipal2026!' }
let directory, databasePath, server, audio
let sequence = 0

async function startServer() {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const url = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), REPORTE_CIUDADANO_DATABASE_PATH: databasePath, REPORTE_CIUDADANO_DEMO_DATA: 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(output)
    try {
      if ((await fetch(`${url}/api/auth/session`)).ok) return { url, async stop() {
        if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited }
      } }
    } catch { /* Iniciando. */ }
    await delay(50)
  }
  child.kill()
  throw new Error(output)
}

function client() {
  let cookie = ''
  return { async request(url, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${server.url}${url}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
    return { status: response.status, headers: response.headers, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) }
  } }
}

async function citizen() {
  const owner = client()
  const credentials = { email: `capture-${++sequence}@example.cr`, password: 'Capture-2026' }
  assert.equal((await owner.request('/api/auth/register', { method: 'POST', body: { ...credentials, confirmation: credentials.password, name: 'Ciudadana Captura' } })).status, 201)
  await owner.request('/api/auth/login', { method: 'POST', body: credentials })
  return { owner, credentials }
}

function submit(owner, changes = {}, key = `capture-submission-key-${++sequence}`) {
  return owner.request('/api/reports', { method: 'POST', headers: { 'Idempotency-Key': key }, body: {
    category: 'Infraestructura', audio, location: { latitude: 9.864, longitude: -83.919, accuracy: 12 }, ...changes,
  } })
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'reporte-ciudadano-capture-'))
  databasePath = path.join(directory, 'database.json')
  // Grabación WebM real producida con MediaRecorder y micrófono sintético.
  audio = { type: 'audio/webm;codecs=opus', durationSeconds: 1.1, data: (await readFile(path.join(ROOT, 'tests/fixtures/description.webm'))).toString('base64') }
  server = await startServer()
})
after(async () => {
  await server?.stop()
  if (directory) {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('reporte-ciudadano-capture-'))
    await rm(directory, { recursive: true, force: true })
  }
})

test('captura: permite describir con voz y coordenadas sin escribir, sin duplicar reporte ni recepción', async () => {
  const { owner } = await citizen()
  const key = 'capture-concurrent-key-0001'
  const results = await Promise.all([submit(owner, {}, key), submit(owner, {}, key)])
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 201])
  const report = results[0].body.report
  assert.equal(report.description, '')
  assert.equal(report.community, 'Ubicación en el mapa')
  assert.match(report.locationReference, /9.864000, -83.919000/)
  assert.equal(report.location.accuracy, 12)
  assert.equal(report.audio.type, 'audio/webm')
  assert.equal(report.audio.size, Buffer.from(audio.data, 'base64').length)
  assert.equal('data' in report.audio, false)
  assert.deepEqual((await owner.request(`/api/reports/${report.id}`)).body.report, report)
  assert.equal((await owner.request('/api/notifications')).body.notifications.length, 1)
  assert.equal((await owner.request('/api/reports')).body.reports.length, 1)
})

test('captura: admite audio con texto y dirección manual, o texto y coordenadas sin audio', async () => {
  const { owner } = await citizen()
  const withText = await submit(owner, { location: null, description: 'Descripción adicional.', community: 'Cartago', locationReference: 'Frente a la escuela' })
  assert.equal(withText.status, 201)
  assert.equal(withText.body.report.description, 'Descripción adicional.')
  assert.equal('location' in withText.body.report, false)
  const onlyText = await submit(owner, { audio: null, description: 'Bache grande.' })
  assert.equal(onlyText.status, 201)
  assert.equal('audio' in onlyText.body.report, false)
  assert.equal((await owner.request(`/api/reports/${onlyText.body.report.id}/audio`)).status, 404)
})

test('captura: rechaza audio vacío, formatos falsos, duración y tamaño fuera del límite sin reportes parciales', async () => {
  const { owner } = await citizen()
  const invalid = [
    null, { ...audio, data: '' }, { ...audio, type: 'text/html' }, { ...audio, data: '%%%%' },
    { ...audio, data: Buffer.from('texto falso').toString('base64') },
    { ...audio, durationSeconds: 0 }, { ...audio, durationSeconds: 121 },
    { ...audio, durationSeconds: '10' }, { ...audio, data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') },
  ]
  for (const recording of invalid) {
    const result = await submit(owner, { audio: recording })
    assert.equal(result.status, 400)
  }
  assert.deepEqual((await owner.request('/api/reports')).body.reports, [])
  assert.deepEqual((await owner.request('/api/notifications')).body.notifications, [])
})

test('captura: valida coordenadas numéricas y conserva precisión, sin sustituir los campos manuales existentes', async () => {
  const { owner } = await citizen()
  for (const location of [false, 0, [], {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: '9.86', longitude: -83 }, { latitude: 9, longitude: -83, accuracy: -1 }]) {
    assert.equal((await submit(owner, { location })).status, 400)
  }
  const valid = await submit(owner, { location: { latitude: 0, longitude: 0, accuracy: 0, injected: 'ignored' }, community: 'Comunidad elegida', locationReference: 'Referencia adicional' })
  assert.equal(valid.status, 201)
  assert.deepEqual(valid.body.report.location, { latitude: 0, longitude: 0, accuracy: 0 })
  assert.equal(valid.body.report.community, 'Comunidad elegida')
  assert.equal(valid.body.report.locationReference, 'Referencia adicional')
})

test('captura: protege audio y coordenadas entre cuentas y permite reproducción con rangos al dueño y municipalidad', async () => {
  const { owner } = await citizen()
  const other = await citizen()
  const report = (await submit(owner)).body.report
  const municipal = client()
  await municipal.request('/api/auth/login', { method: 'POST', body: MUNICIPAL })
  assert.equal((await client().request(report.audio.url)).status, 401)
  assert.equal((await other.owner.request(report.audio.url)).status, 404)
  assert.equal((await other.owner.request(`/api/reports/${report.id}`)).status, 404)
  const municipalDetail = await municipal.request(`/api/municipal/reports/${report.id}`)
  assert.deepEqual(municipalDetail.body.report.audio, report.audio)
  assert.deepEqual(municipalDetail.body.report.location, report.location)
  const originalBytes = Buffer.from(audio.data, 'base64')
  for (const connection of [owner, municipal]) {
    const full = await connection.request(report.audio.url)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('cache-control'), 'no-store')
    assert.deepEqual(full.body, originalBytes)
    const range = await connection.request(report.audio.url, { headers: { Range: 'bytes=0-19' } })
    assert.equal(range.status, 206)
    assert.equal(range.headers.get('content-range'), `bytes 0-19/${originalBytes.length}`)
    assert.deepEqual(range.body, originalBytes.subarray(0, 20))
    const suffix = await connection.request(report.audio.url, { headers: { Range: 'bytes=-10' } })
    assert.deepEqual(suffix.body, originalBytes.subarray(-10))
    assert.equal((await connection.request(report.audio.url, { headers: { Range: 'bytes=999999999-' } })).status, 416)
  }
})

test('captura: cambios municipales y reinicios conservan la voz, la ubicación y las fotos', async () => {
  const { owner, credentials } = await citizen()
  const png = await readFile(path.join(ROOT, 'tests/fixtures/evidence-1.png'))
  const report = (await submit(owner, { photos: [{ name: 'foto.png', type: 'image/png', data: png.toString('base64') }] })).body.report
  const original = JSON.parse(await readFile(databasePath, 'utf8')).reports.find((item) => item.id === report.id)
  const municipal = client()
  await municipal.request('/api/auth/login', { method: 'POST', body: MUNICIPAL })
  for (const [field, value, expected] of [['category', 'Limpieza', 'Infraestructura'], ['status', 'En revisión', 'Recibido']]) {
    const response = await municipal.request(`/api/municipal/reports/${report.id}/${field}`, {
      method: 'PATCH', headers: { 'Idempotency-Key': `capture-update-${field}-0001` },
      body: { [field]: value, [field === 'category' ? 'expectedCategory' : 'expectedStatus']: expected },
    })
    assert.equal(response.status, 200)
  }
  await owner.request('/api/auth/logout', { method: 'POST' })
  await server.stop()
  server = await startServer()
  await owner.request('/api/auth/login', { method: 'POST', body: credentials })
  const after = JSON.parse(await readFile(databasePath, 'utf8')).reports.find((item) => item.id === report.id)
  assert.deepEqual(after.audio, original.audio)
  assert.deepEqual(after.location, original.location)
  assert.deepEqual(after.photos, original.photos)
  const detail = (await owner.request(`/api/reports/${report.id}`)).body.report
  assert.equal(detail.status, 'En revisión')
  assert.deepEqual(detail.audio, report.audio)
  assert.deepEqual((await owner.request(report.audio.url)).body, Buffer.from(audio.data, 'base64'))
})
