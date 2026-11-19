import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import { test } from 'node:test'
import { createDatabaseSnapshot } from '../server/databaseSnapshot.js'
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test('la copia compartida conserva registros e historial sin publicar sesiones ni credenciales personales', async () => {
  const original = {
    version: 3,
    accounts: [
      { id: 'citizen', name: 'Ciudadana', email: 'citizen@example.test', role: 'citizen', createdAt: '2026-11-19', salt: 'private-salt', passwordHash: 'private-hash', demoPassword: 'private-password', privateField: 'private-value' },
      { id: 'municipal', name: 'Municipal', email: 'municipal@example.test', role: 'municipal', createdAt: '2026-11-19' },
    ],
    sessions: [{ token: 'private-session', accountId: 'citizen' }],
    reports: [{ id: 'report', citizenId: 'citizen', statusEvents: [{ id: 'event', newStatus: 'En proceso' }], photos: [{ id: 'photo', data: 'evidence' }] }],
    notifications: [{ id: 'notice', citizenId: 'citizen', eventId: 'event', readAt: null }],
  }
  const unchanged = structuredClone(original)
  const snapshot = await createDatabaseSnapshot(original)
  assert.deepEqual(original, unchanged)
  assert.deepEqual(snapshot.sessions, [])
  assert.deepEqual(snapshot.reports, original.reports)
  assert.deepEqual(snapshot.notifications, original.notifications)
  assert.equal(snapshot.accounts.length, original.accounts.length)
  for (const [index, account] of snapshot.accounts.entries()) {
    assert.equal(account.id, original.accounts[index].id)
    const expected = account.role === 'municipal' ? 'Municipal2026!' : 'Ciudadano2026!'
    assert.equal(account.demoPassword, expected)
    assert.equal(account.passwordHash, pbkdf2Sync(expected, Buffer.from(account.salt, 'hex'), 120_000, 32, 'sha256').toString('hex'))
  }
  assert.ok(!JSON.stringify(snapshot).includes('private-'))
})

test('un clon importa la copia compartida una vez y conserva cambios locales al reiniciar', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reporte-clone-test-'))
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  try {
    await cp(path.join(root, 'server'), path.join(directory, 'server'), { recursive: true })
    await cp(path.join(root, 'shared'), path.join(directory, 'shared'), { recursive: true })
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}')
    await mkdir(path.join(directory, 'data'))
    const shared = await createDatabaseSnapshot({
      version: 3,
      accounts: [{ id: 'shared-author', name: 'Autora compartida', email: 'author@example.test', role: 'citizen', createdAt: '2026-11-19' }],
      sessions: [],
      reports: [{ id: 'shared-case', citizenId: 'shared-author', description: 'Reporte compartido', category: 'Limpieza', status: 'Recibido', createdAt: '2026-11-19T10:00:00.000Z', photos: [], statusEvents: [] }],
      notifications: [],
    })
    const sharedPath = path.join(directory, 'data/database.json')
    const localPath = path.join(directory, 'data/database.local.json')
    await writeFile(sharedPath, JSON.stringify(shared))
    const env = { ...process.env, REPORTE_CIUDADANO_DEMO_DATA: 'on' }
    delete env.REPORTE_CIUDADANO_DATABASE_PATH
    const start = () => spawnSync(process.execPath, ['server/index.js', '--seed-only'], { cwd: directory, env, encoding: 'utf8' })
    assert.equal(start().status, 0)
    const local = JSON.parse(await readFile(localPath, 'utf8'))
    assert.ok(local.accounts.some((account) => account.id === 'shared-author'))
    assert.deepEqual(local.reports.find((report) => report.id === 'shared-case'), shared.reports[0])
    assert.deepEqual(local.sessions, [])
    local.reports.find((report) => report.id === 'shared-case').description = 'Cambio local'
    await writeFile(localPath, JSON.stringify(local))
    assert.equal(start().status, 0)
    assert.deepEqual(JSON.parse(await readFile(localPath, 'utf8')), local)
    assert.deepEqual(JSON.parse(await readFile(sharedPath, 'utf8')), shared)
  } finally {
    if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'reporte-clone-test-'))) throw new Error('Ruta temporal inesperada')
    await rm(directory, { recursive: true, force: true })
  }
})
