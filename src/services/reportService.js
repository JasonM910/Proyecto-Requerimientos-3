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
      'No se pudo conectar con el servidor. Intentá nuevamente.',
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
        : 'No se pudo completar la solicitud. Intentá nuevamente.',
    )
  }

  return result
}

export async function createCitizenReport(report, idempotencyKey) {
  const result = await request('/api/reports', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(report),
  })

  return result.report
}

export async function getCitizenReports() {
  const result = await request('/api/reports')
  return result.reports
}

export async function getCitizenReport(reportId) {
  const result = await request(`/api/reports/${encodeURIComponent(reportId)}`)
  return result.report
}
