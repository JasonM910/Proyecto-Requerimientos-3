import { pbkdf2, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const hashPassword = promisify(pbkdf2)

export async function createDatabaseSnapshot(database) {
  const snapshot = structuredClone(database)
  snapshot.sessions = []
  snapshot.accounts = await Promise.all(database.accounts.map(async (account) => {
    const password = account.role === 'municipal' ? 'Municipal2026!' : 'Ciudadano2026!'
    const salt = randomBytes(16)
    const passwordHash = await hashPassword(password, salt, 120_000, 32, 'sha256')
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      createdAt: account.createdAt,
      ...(account.demo === true ? { demo: true } : {}),
      salt: salt.toString('hex'),
      passwordHash: passwordHash.toString('hex'),
      demoPassword: password,
    }
  }))
  return snapshot
}
