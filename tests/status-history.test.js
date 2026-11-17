import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MUNICIPAL = { email: 'municipal@reporteciudadano.cr', password: 'Municipal2026!' }
const HISTORY_FIELDS = ['at', 'id', 'previousStatus', 'reportId', 'status', 'type']
const INBOX = '/api/municipal/reports'
let directory, databasePath, server, municipal
let sequence = 0

async function startServer(dataFile = databasePath) {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), REPORTE_CIUDADANO_DATABASE_PATH: dataFile },
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

function client(target = () => server) {
  let cookie = ''
  return {
    async request(url, { method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(`${target().url}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
      return { status: response.status, body: await response.json() }
    },
  }
}

async function signIn(account = MUNICIPAL, target) {
  const connection = client(target)
  assert.equal((await connection.request('/api/auth/login', { method: 'POST', body: account })).status, 200)
  return connection
}

async function createCase() {
  const number = ++sequence
  const credentials = { email: `history-${number}@example.cr`, password: 'Ciudadano-2026' }
  const owner = client()
  const registration = await owner.request('/api/auth/register', {
    method: 'POST', body: { ...credentials, confirmation: credentials.password, name: `Ciudadano ${number}` },
  })
  assert.equal(registration.status, 201)
  await owner.request('/api/auth/login', { method: 'POST', body: credentials })
  const creation = await owner.request('/api/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': `history-case-submission-${number}` },
    body: {
      description: 'Luminaria apagada en la esquina.',
      category: 'Infraestructura',
      community: 'Comunidad de historial',
      locationReference: 'Esquina de la pulpería',
    },
  })
  assert.equal(creation.status, 201)
  return { owner, credentials, report: creation.body.report }
}

function changeStatus(reportId, value, expected, key = `history-status-${++sequence}-key-0001`) {
  return municipal.request(`${INBOX}/${reportId}/status`, {
    method: 'PATCH',
    headers: { 'Idempotency-Key': key },
    body: { status: value, expectedStatus: expected },
  })
}

const citizenHistory = async (owner, id) => (await owner.request(`/api/reports/${id}`)).body.report.history
const municipalHistory = async (id) => (await municipal.request(`${INBOX}/${id}`)).body.report.history

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'reporte-ciudadano-history-'))
  databasePath = path.join(directory, 'database.json')
  server = await startServer()
  municipal = await signIn()
})

after(async () => {
  await server?.stop()
  if (directory) {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('reporte-ciudadano-history-'))
    await rm(directory, { recursive: true, force: true })
  }
})

test('HU-13 un reporte sin cambios muestra solo el registro inicial en ambos detalles', async () => {
  const { owner, report } = await createCase()
  const fromCitizen = await citizenHistory(owner, report.id)
  const fromMunicipal = await municipalHistory(report.id)

  assert.deepEqual(fromCitizen, fromMunicipal)
  assert.equal(fromCitizen.length, 1)
  assert.deepEqual(fromCitizen[0], {
    id: 'created',
    reportId: report.id,
    type: 'created',
    at: report.createdAt,
    previousStatus: null,
    status: 'Recibido',
  })
})

test('HU-13 un recorrido con varios cambios se muestra en orden cronológico, con fecha, estado anterior y nuevo', async () => {
  const { owner, report } = await createCase()
  const path = ['En revisión', 'En proceso', 'Resuelto', 'En proceso']
  let previous = 'Recibido'
  for (const status of path) {
    const response = await changeStatus(report.id, status, previous)
    assert.equal(response.status, 200)
    assert.equal(response.body.changed, true)
    previous = status
  }

  const fromCitizen = await citizenHistory(owner, report.id)
  const fromMunicipal = await municipalHistory(report.id)
  assert.deepEqual(fromCitizen, fromMunicipal, 'ambos detalles muestran el mismo historial')
  assert.equal(fromCitizen.length, path.length + 1)

  assert.equal(fromCitizen[0].type, 'created')
  assert.equal(fromCitizen[0].status, 'Recibido')
  fromCitizen.slice(1).forEach((entry, index) => {
    assert.equal(entry.type, 'status-change')
    assert.equal(entry.previousStatus, index === 0 ? 'Recibido' : path[index - 1])
    assert.equal(entry.status, path[index])
    assert.equal(entry.reportId, report.id)
    assert.ok(Number.isFinite(Date.parse(entry.at)), 'cada evento tiene fecha y hora válidas')
  })
  const moments = fromCitizen.map((entry) => Date.parse(entry.at))
  assert.deepEqual(moments, [...moments].sort((left, right) => left - right), 'orden cronológico ascendente')
  for (const entry of fromCitizen) {
    assert.deepEqual(Object.keys(entry).sort(), HISTORY_FIELDS)
  }
})

test('HU-13 el estado más reciente del historial coincide con la lista, el detalle y la bandeja municipal', async () => {
  const { owner, report } = await createCase()
  await changeStatus(report.id, 'En revisión', 'Recibido')
  await changeStatus(report.id, 'En proceso', 'En revisión')

  const detail = (await owner.request(`/api/reports/${report.id}`)).body.report
  const list = (await owner.request('/api/reports')).body.reports.find((item) => item.id === report.id)
  const municipalDetail = (await municipal.request(`${INBOX}/${report.id}`)).body.report
  const inbox = (await municipal.request(INBOX)).body.reports.find((item) => item.id === report.id)
  const filtered = (await municipal.request(`${INBOX}?status=En%20proceso`)).body.reports
  const latest = detail.history.at(-1).status

  assert.equal(latest, 'En proceso')
  for (const status of [detail.status, list.status, municipalDetail.status, municipalDetail.history.at(-1).status, inbox.status]) {
    assert.equal(status, latest)
  }
  assert.ok(filtered.some((item) => item.id === report.id))
})

test('HU-13 los eventos anteriores se conservan intactos cuando el estado vuelve a cambiar', async () => {
  const { owner, report } = await createCase()
  let previous = 'Recibido'
  let earlier = await municipalHistory(report.id)
  for (const status of ['En revisión', 'En proceso', 'Resuelto', 'Recibido']) {
    await changeStatus(report.id, status, previous)
    previous = status
    const current = await citizenHistory(owner, report.id)
    assert.equal(current.length, earlier.length + 1, 'cada cambio agrega exactamente un evento')
    assert.deepEqual(current.slice(0, earlier.length), earlier, 'los eventos previos no cambian ni se eliminan')
    earlier = current
  }
})

test('HU-13 un guardado sin cambio no agrega eventos al historial', async () => {
  const { owner, report } = await createCase()
  await changeStatus(report.id, 'En revisión', 'Recibido')
  const before = await citizenHistory(owner, report.id)

  const unchanged = await changeStatus(report.id, 'En revisión', 'En revisión')
  assert.equal(unchanged.status, 200)
  assert.equal(unchanged.body.changed, false)
  assert.deepEqual(unchanged.body.report.history, before)
  assert.deepEqual(await citizenHistory(owner, report.id), before)
  assert.deepEqual(await municipalHistory(report.id), before)
})

test('HU-13 un cambio cancelado o rechazado no queda registrado en el historial', async () => {
  const { owner, report } = await createCase()
  await changeStatus(report.id, 'En revisión', 'Recibido')
  const before = await citizenHistory(owner, report.id)

  // Cancelar en la pantalla no envía ninguna solicitud: el historial no cambia.
  assert.deepEqual(await municipalHistory(report.id), before)

  // Un envío no confirmado por el servidor tampoco deja eventos.
  assert.equal((await changeStatus(report.id, 'Archivado', 'En revisión')).status, 400, 'estado inválido')
  assert.equal((await changeStatus(report.id, 'Resuelto', 'Recibido')).status, 409, 'estado original desactualizado')
  assert.equal((await changeStatus('RC-20000101-00000000', 'Resuelto', 'Recibido')).status, 404)
  assert.equal((await changeStatus(report.id, 'En proceso', 'En revisión', 'clave-corta')).status, 400, 'sin clave válida')

  assert.deepEqual(await citizenHistory(owner, report.id), before)
  assert.deepEqual(await municipalHistory(report.id), before)
  assert.equal((await owner.request(`/api/reports/${report.id}`)).body.report.status, 'En revisión')
})

test('HU-13 cada historial pertenece a su reporte y la ciudadanía solo ve el suyo', async () => {
  const first = await createCase()
  const second = await createCase()
  await changeStatus(first.report.id, 'En revisión', 'Recibido')
  await changeStatus(second.report.id, 'En revisión', 'Recibido')
  await changeStatus(second.report.id, 'Resuelto', 'En revisión')

  const firstHistory = await citizenHistory(first.owner, first.report.id)
  const secondHistory = await citizenHistory(second.owner, second.report.id)
  assert.equal(firstHistory.length, 2)
  assert.equal(secondHistory.length, 3)
  assert.ok(firstHistory.every((entry) => entry.reportId === first.report.id))
  assert.ok(secondHistory.every((entry) => entry.reportId === second.report.id))
  const ids = [...firstHistory, ...secondHistory].map((entry) => entry.id).filter((id) => id !== 'created')
  assert.equal(new Set(ids).size, ids.length, 'ningún evento se comparte entre reportes')

  assert.equal((await first.owner.request(`/api/reports/${second.report.id}`)).status, 404)
  assert.equal((await client().request(`/api/reports/${first.report.id}`)).status, 401)
  assert.equal((await client().request(`${INBOX}/${first.report.id}`)).status, 401)
  assert.equal((await first.owner.request(`${INBOX}/${first.report.id}`)).status, 403)
})

test('HU-13 el historial no expone cuentas, claves de envío ni operaciones internas', async () => {
  const { owner, credentials, report } = await createCase()
  await changeStatus(report.id, 'En revisión', 'Recibido')
  const serialized = JSON.stringify([
    (await owner.request(`/api/reports/${report.id}`)).body,
    (await municipal.request(`${INBOX}/${report.id}`)).body,
  ]).toLowerCase()
  for (const secret of [credentials.email, 'password', 'hash', 'salt', 'idempotency', 'citizenid', 'accountid', 'municipaloperations', 'demo-municipal']) {
    assert.ok(!serialized.includes(secret), `la respuesta no debe incluir «${secret}»`)
  }
})

test('HU-13 el historial persiste después de reiniciar el servidor', async () => {
  const { owner, credentials, report } = await createCase()
  await changeStatus(report.id, 'En revisión', 'Recibido')
  await changeStatus(report.id, 'En proceso', 'En revisión')
  const before = await municipalHistory(report.id)
  assert.equal(before.length, 3)

  await server.stop()
  server = await startServer()
  municipal = await signIn()
  const reentered = await signIn(credentials)
  assert.deepEqual(await municipalHistory(report.id), before)
  assert.deepEqual(await citizenHistory(reentered, report.id), before)
  assert.equal(owner !== reentered, true)
})

test('HU-13 los reportes ficticios tienen un historial coherente con su estado en la bandeja', async () => {
  const inbox = (await municipal.request(INBOX)).body.reports
  const demo = inbox.filter((item) => item.id.includes('-D000'))
  assert.equal(demo.length, 12)

  const lengths = new Map()
  for (const summary of demo) {
    const { report } = (await municipal.request(`${INBOX}/${summary.id}`)).body
    const { history } = report
    assert.equal(history[0].type, 'created')
    assert.equal(history[0].at, report.createdAt)
    assert.equal(history.at(-1).status, summary.status, `${summary.id}: último evento = estado de la bandeja`)
    assert.equal(report.status, summary.status)
    history.slice(1).forEach((entry, index) => {
      assert.equal(entry.previousStatus, history[index].status, `${summary.id}: la cadena de estados es continua`)
      assert.ok(Date.parse(entry.at) > Date.parse(history[index].at))
      assert.equal(entry.reportId, summary.id)
    })
    lengths.set(summary.status, history.length)
  }
  assert.deepEqual([...lengths].sort(), [['En proceso', 3], ['En revisión', 2], ['Recibido', 1], ['Resuelto', 4]])
})

test('HU-13 completa el historial de datos ficticios sembrados antes de esta versión sin duplicarlo', async () => {
  const legacyPath = path.join(directory, 'legacy-database.json')
  await writeFile(legacyPath, JSON.stringify({
    version: 3,
    accounts: [],
    sessions: [],
    notifications: [],
    reports: [{
      id: 'RC-20261104-D0000004',
      citizenId: 'demo-seed',
      idempotencyKey: 'demo-RC-20261104-D0000004',
      description: 'Alcantarilla sin tapa en la esquina.',
      category: 'Infraestructura',
      community: 'Urbanización El Mirador',
      locationReference: 'Esquina del tanque de agua',
      createdAt: '2026-11-04T11:15:00.000Z',
      status: 'En proceso',
      photos: [],
      demo: true,
    }],
  }))

  const legacyServer = await startServer(legacyPath)
  try {
    const official = await signIn(MUNICIPAL, () => legacyServer)
    const history = (await official.request(`${INBOX}/RC-20261104-D0000004`)).body.report.history
    assert.deepEqual(history.map((entry) => entry.status), ['Recibido', 'En revisión', 'En proceso'])
  } finally {
    await legacyServer.stop()
  }

  const restarted = await startServer(legacyPath)
  try {
    const official = await signIn(MUNICIPAL, () => restarted)
    const history = (await official.request(`${INBOX}/RC-20261104-D0000004`)).body.report.history
    assert.equal(history.length, 3, 'reiniciar no duplica los eventos migrados')
    const stored = JSON.parse(await readFile(legacyPath, 'utf8'))
    assert.equal(stored.reports.find((item) => item.id === 'RC-20261104-D0000004').statusEvents.length, 2)
  } finally {
    await restarted.stop()
  }
})