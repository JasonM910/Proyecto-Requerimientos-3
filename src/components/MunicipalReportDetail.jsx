import { useEffect, useState } from 'react'
import { AppHeader } from './Dashboard.jsx'
import EvidenceGallery from './EvidenceGallery.jsx'
import { getMunicipalReport } from '../services/reportService.js'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value) {
  return DATE_FORMATTER.format(new Date(value))
}

export default function MunicipalReportDetail({
  reportId,
  user,
  onNavigate,
  onSignOut,
}) {
  // El resultado se asocia al identificador solicitado: si no coincide con el
  // reporte de la ruta, se muestra la carga y nunca los datos de otro caso.
  const [result, setResult] = useState({ id: null, report: null, error: '' })
  const isLoading = result.id !== reportId

  useEffect(() => {
    let active = true
    getMunicipalReport(reportId)
      .then((report) => {
        if (active) {
          setResult({ id: reportId, report, error: '' })
        }
      })
      .catch((requestError) => {
        if (active) {
          setResult({
            id: reportId,
            report: null,
            error:
              requestError instanceof Error
                ? requestError.message
                : 'No se pudo cargar el reporte.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [reportId])

  const { report, error } = result
  const goToInbox = () => onNavigate('/municipal/reportes')

  return (
    <div className="app-shell">
      <AppHeader user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
      <main className="citizen-reports-main">
        <div className="report-page-heading">
          <button className="back-link" type="button" onClick={goToInbox}>
            <span aria-hidden="true">←</span> Volver a la bandeja
          </button>
        </div>

        {isLoading ? (
          <section className="report-list-state" aria-live="polite">
            <span className="loading-indicator" aria-hidden="true" />
            <p>Cargando el reporte…</p>
          </section>
        ) : error ? (
          <section
            className="report-list-state report-empty-state"
            role="alert"
          >
            <h1>No se pudo abrir el reporte</h1>
            <p>{error}</p>
            <button
              className="button button-primary"
              type="button"
              onClick={goToInbox}
            >
              Volver a la bandeja
            </button>
          </section>
        ) : (
          <article
            className="report-detail"
            aria-labelledby="municipal-detail-id"
          >
            <header className="report-detail-header">
              <div>
                <span className="eyebrow">Revisión municipal</span>
                <h1 id="municipal-detail-id">{report.id}</h1>
                <p>Registrado el {formatDate(report.createdAt)}</p>
              </div>
              <span
                className="report-status report-status-large"
                data-status={report.status}
              >
                {report.status}
              </span>
            </header>

            <dl className="report-detail-grid">
              <div className="report-detail-description">
                <dt>Descripción del problema</dt>
                <dd>{report.description}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{report.category}</dd>
              </div>
              <div>
                <dt>Comunidad o localidad</dt>
                <dd>{report.community}</dd>
              </div>
              <div>
                <dt>Referencia del sitio</dt>
                <dd>{report.locationReference}</dd>
              </div>
              <div>
                <dt>Fecha y hora</dt>
                <dd>{formatDate(report.createdAt)}</dd>
              </div>
              <div>
                <dt>Estado actual</dt>
                <dd>
                  <span className="report-status" data-status={report.status}>
                    {report.status}
                  </span>
                </dd>
              </div>
            </dl>

            <EvidenceGallery photos={report.photos} />

            <section className="history-section" aria-labelledby="history-title">
              <h2 id="history-title">Historial del reporte</h2>
              <ol className="history-list">
                {report.history.map((entry) => (
                  <li key={entry.id}>
                    <span className="history-dot" aria-hidden="true" />
                    <div>
                      <strong>{entry.description}</strong>
                      <span className="history-meta">
                        <span
                          className="report-status"
                          data-status={entry.status}
                        >
                          {entry.status}
                        </span>
                        <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="field-hint">
                Por ahora se muestra el registro inicial del reporte. El
                historial completo de cambios se integrará en un siguiente
                incremento.
              </p>
            </section>

            <p className="report-status-immutable">
              Esta vista es de solo lectura: la clasificación y el cambio de
              estado se integrarán en los siguientes incrementos.
            </p>
          </article>
        )}
      </main>
      <footer className="app-footer">
        <span>Reporte Ciudadano</span>
      </footer>
    </div>
  )
}