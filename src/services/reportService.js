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
    const error = new Error(
      typeof result.error === 'string'
        ? result.error
        : 'No se pudo completar la solicitud. Intentá nuevamente.',
    )
    error.status = response.status
    throw error
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

export async function getMunicipalReports({ category = '', status = '' } = {}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  const query = params.toString()

  return request(`/api/municipal/reports${query ? `?${query}` : ''}`)
}

export async function getMunicipalReport(reportId) {
  const result = await request(
    `/api/municipal/reports/${encodeURIComponent(reportId)}`,
  )
  return result.report
}

export async function updateMunicipalReport(reportId, field, value, expectedValue, key) {
  return request(`/api/municipal/reports/${encodeURIComponent(reportId)}/${field}`, {
    method: 'PATCH',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      [field]: value,
      [field === 'category' ? 'expectedCategory' : 'expectedStatus']: expectedValue,
    }),
  })
}

export async function getCitizenNotifications() {
  return (await request('/api/notifications')).notifications
}

export async function markNotificationRead(notificationId) {
  const result = await request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  })
  return result.notification
}

export async function getReportStatusEvents(reportId) {
  return (await request(`/api/reports/${encodeURIComponent(reportId)}/status-events`)).events
}
