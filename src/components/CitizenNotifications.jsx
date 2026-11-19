import { useEffect, useRef, useState } from 'react'
import { AppHeader } from './Dashboard.jsx'
import { getCitizenNotifications, markNotificationRead } from '../services/reportService.js'
import Icon from './Icon.jsx'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' })

export default function CitizenNotifications({ user, onNavigate, onSignOut }) {
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, notifications: [], error: '' })
  const [openingId, setOpeningId] = useState(null)
  const [openError, setOpenError] = useState('')
  const openingLock = useRef(false)
  const isLoading = result.key !== reload

  useEffect(() => {
    let active = true
    getCitizenNotifications()
      .then((notifications) => {
        if (active) setResult({ key: reload, notifications, error: '' })
      })
      .catch((error) => {
        if (active) setResult({ key: reload, notifications: [], error: error.message || 'No se pudieron cargar tus notificaciones.' })
      })
    return () => { active = false }
  }, [reload])

  async function openNotification(notification) {
    if (openingLock.current) return
    openingLock.current = true
    setOpeningId(notification.id)
    setOpenError('')
    try {
      const saved = await markNotificationRead(notification.id)
      onNavigate(saved.url)
    } catch (error) {
      setOpenError(error.message || 'No se pudo guardar la lectura del aviso. Intentá nuevamente.')
    } finally {
      openingLock.current = false
      setOpeningId(null)
    }
  }

  const unread = result.notifications.filter((notification) => !notification.readAt).length

  return (
    <div className="app-shell">
      <AppHeader user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
      <main className="citizen-reports-main">
        <div className="report-page-heading">
          <button className="back-link" type="button" onClick={() => onNavigate('/ciudadano')}><Icon name="arrowLeft" />Volver al inicio</button>
          <span className="eyebrow">Seguimiento ciudadano</span>
          <h1>Mis notificaciones</h1>
          <p>Consultá la recepción y los cambios de estado de tus reportes.</p>
        </div>
        {openError && <div className="notice notice-error" role="alert">{openError}</div>}
        {isLoading ? (
          <section className="report-list-state" role="status">
            <span className="loading-indicator" aria-hidden="true" />
            <p>Cargando tus notificaciones…</p>
          </section>
        ) : result.error ? (
          <section className="report-list-state report-empty-state" role="alert">
            <h2>No se pudieron cargar tus notificaciones</h2>
            <p>{result.error}</p>
            <button className="button button-primary" type="button" onClick={() => setReload((value) => value + 1)}>Reintentar</button>
          </section>
        ) : result.notifications.length === 0 ? (
          <section className="report-list-state report-empty-state">
            <h2>Todavía no tenés notificaciones</h2>
            <p>Cuando registres un reporte o cambie su estado, encontrarás el aviso aquí.</p>
            <button className="button button-primary" type="button" onClick={() => onNavigate('/ciudadano/reportes')}>Consultar mis reportes</button>
          </section>
        ) : (
          <section className="report-list-section notifications-section" aria-labelledby="notifications-list-title">
            <div className="report-list-caption">
              <h2 id="notifications-list-title">Avisos de tus reportes</h2>
              <span role="status">{unread} sin leer · {result.notifications.length} en total</span>
            </div>
            <ul className="notification-list">
              {result.notifications.map((notification) => (
                <li key={notification.id}>
                  <button className={`notification-item ${notification.readAt ? 'is-read' : 'is-unread'}`} type="button" onClick={() => openNotification(notification)} disabled={openingId !== null}>
                    <span className="notification-symbol" aria-hidden="true"><Icon name={notification.readAt ? 'check' : 'bell'} /></span>
                    <span className="notification-copy">
                      <span className="notification-heading">
                        <strong>{notification.type === 'received' ? 'Recibimos tu reporte' : 'Cambió el estado de tu reporte'}</strong>
                        <span className="notification-reading">{notification.readAt ? 'Leída' : 'No leída'}</span>
                      </span>
                      <span className="notification-report-id">{notification.reportId}</span>
                      <span className="notification-meta">
                        <span className="report-status" data-status={notification.newStatus}>{notification.newStatus}</span>
                        <time dateTime={notification.createdAt}>{DATE_FORMATTER.format(new Date(notification.createdAt))}</time>
                      </span>
                      <span className="notification-action">{openingId === notification.id ? 'Abriendo reporte…' : <>Consultar reporte <Icon name="arrowRight" /></>}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="app-footer"><span>Reporte Ciudadano</span></footer>
    </div>
  )
}
