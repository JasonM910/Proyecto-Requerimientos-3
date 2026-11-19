import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { createDatabaseSnapshot } from './databaseSnapshot.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(process.env.REPORTE_CIUDADANO_DATABASE_PATH ?? path.join(root, 'data/database.local.json'))
const destination = path.join(root, 'data/database.json')
const temporary = `${destination}.tmp-${randomBytes(6).toString('hex')}`

try {
  const database = JSON.parse(await readFile(source, 'utf8'))
  const snapshot = await createDatabaseSnapshot(database)
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, destination)
  console.log(`Copia compartida actualizada: ${snapshot.accounts.length} cuentas, ${snapshot.reports.length} reportes y ${snapshot.notifications.length} avisos. Sin sesiones ni contraseñas personales.`)
} catch (error) {
  await rm(temporary, { force: true })
  console.error('No se pudo exportar la base compartida:', error.code ?? 'formato inválido')
  process.exitCode = 1
}
