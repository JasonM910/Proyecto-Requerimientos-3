async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new Error(
      'No se pudo conectar con el servidor local. Asegurate de iniciar la aplicación con npm run dev.',
    )
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error('El servidor devolvió una respuesta que no se pudo leer.')
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('El servidor devolvió una respuesta que no se pudo leer.')
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'No se pudo completar la operación. Intentá nuevamente.',
    )
  }

  return result
}

export async function registerCitizen({ name, email, password, confirmation }) {
  const cleanName = name.trim()
  const cleanEmail = email.trim().toLowerCase()

  if (!cleanName || !cleanEmail || !password || !confirmation) {
    throw new Error('Completá todos los campos para crear la cuenta.')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Ingresá un correo electrónico válido.')
  }

  if (password !== confirmation) {
    throw new Error('Las contraseñas no coinciden.')
  }

  const result = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: cleanName,
      email: cleanEmail,
      password,
      confirmation,
    }),
  })

  return result.user
}

export async function getLoginAccounts() {
  const result = await request('/api/auth/accounts')
  return result.accounts
}

export async function signIn({ email, password }) {
  const cleanEmail = email.trim().toLowerCase()

  if (!cleanEmail || !password) {
    throw new Error('Ingresá tu correo electrónico y contraseña.')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Ingresá un correo electrónico válido.')
  }

  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail, password }),
  })

  return result.user
}

export async function getCurrentSession() {
  const result = await request('/api/auth/session')
  return result.user
}

export async function signOut() {
  await request('/api/auth/logout', { method: 'POST' })
}
