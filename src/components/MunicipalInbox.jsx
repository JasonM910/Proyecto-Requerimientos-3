import { useEffect, useState } from 'react'
import { AppHeader } from './Dashboard.jsx'
import { getMunicipalReports } from '../services/reportService.js'
import { REPORT_CATEGORIES, REPORT_STATUSES } from '../../shared/reportRules.js'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value) {
  return DATE_FORMATTER.format(new Date(value))
}

function describeFilters(category, status) {
  return [category && `categoría «${category}»`, status && `estado «${status}»`]
    .filter(Boolean)
    .join(' y ')
}

export default function MunicipalInbox({ user, onNavigate, onSignOut, filters, onFiltersChange }) {
  const { category, status } = filters
  const [reloadToken, setReloadToken] = useState(0)
  const [result, setResult] = useState({
    key: null,
    reports: [],
    total: 0,
    error: '',
  })

  const requestKey = `${category}|${status}|${reloadToken}`
  const isLoading = result.key !== requestKey
  const hasFilters = Boolean(category || status)

  useEffect(() => {
    let active = true
    getMunicipalReports({ category, status })
      .then((data) => {
        if (active) {
          setResult({
            key: requestKey,
            reports: data.reports,
            total: data.total,
            error: '',
          })
        }
      })
      .catch((requestError) => {
        if (active) {
          setResult({
            key: requestKey,
            reports: [],
            total: 0,
            error:
              requestError instanceof Error
                ? requestError.message
                : 'No se pudo cargar la bandeja de reportes.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [category, status, requestKey])

  function clearFilters() {
    onFiltersChange({ category: '', status: '' })
  }

  const { reports, total, error } = result
  const hasLoadedOnce = result.key !== null
  const hasNoReportsAtAll = hasLoadedOnce && !error && total === 0
  const hasNoMatches =
    hasLoadedOnce && !error && total > 0 && reports.length === 0

  return (
    <div className="app-shell">
      <AppHeader user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
      <main className="citizen-reports-main inbox-main">
        <div className="report-page-heading">
          <span className="eyebrow">Gestión municipal</span>
          <h1>Bandeja de reportes</h1>
          <p>
            Consultá los reportes recibidos y filtralos por categoría o estado
            para organizar su revisión. Los datos son ficticios.
          </p>
        </div>

        <section className="inbox-filters" aria-label="Filtros de la bandeja">
          <div className="form-field">
            <label htmlFor="inbox-category">Categoría</label>
            <select
              id="inbox-category"
              value={category}
              onChange={(event) => onFiltersChange({ ...filters, category: event.target.value })}
            >
              <option value="">Todas las categorías</option>
              {REPORT_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="inbox-status">Estado</label>
            <select
              id="inbox-status"
              value={status}
              onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}
            >
              <option value="">Todos los estados</option>
              {REPORT_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button button-outline"
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Limpiar filtros
          </button>
        </section>

        {error && (
          <div className="notice notice-error inbox-error" role="alert">
            <span>{error}</span>
            <button
              className="button button-outline"
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Reintentar
            </button>
          </div>
        )}

        {!hasLoadedOnce && (
          <section className="report-list-state" aria-live="polite">
            <span className="loading-indicator" aria-hidden="true" />
            <p>Cargando la bandeja…</p>
          </section>
        )}

        {hasNoReportsAtAll && (
          <section className="report-list-state report-empty-state">
            <h2>Todavía no hay reportes registrados</h2>
            <p>Cuando la ciudadanía envíe reportes, aparecerán en esta bandeja.</p>
          </section>
        )}

        {hasNoMatches && (
          <section
            className="report-list-state report-empty-state"
            role="status"
          >
            <h2>No hay reportes que coincidan</h2>
            <p>
              No se encontraron reportes con {describeFilters(category, status)}.
              Probá con otra combinación o limpiá los filtros.
            </p>
            <button
              className="button button-primary"
              type="button"
              onClick={clearFilters}
            >
              Limpiar filtros
            </button>
          </section>
        )}

        {hasLoadedOnce && !error && reports.length > 0 && (
          <section
            className="report-list-section inbox-section"
            aria-labelledby="inbox-title"
            aria-busy={isLoading}
          >
            <div className="report-list-caption">
              <h2 id="inbox-title">Reportes</h2>
              <span aria-live="polite">
                Mostrando {reports.length} de {total}{' '}
                {total === 1 ? 'reporte' : 'reportes'}
              </span>
            </div>
            <div className="inbox-table-wrap">
              <table className="inbox-table">
                <thead>
                  <tr>
                    <th scope="col">Identificador</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Ubicación de referencia</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td data-label="Identificador">
                        <span className="inbox-id">{report.id}</span>
                      </td>
                      <td data-label="Categoría">{report.category}</td>
                      <td data-label="Ubicación">
                        <strong>{report.community}</strong>
                        <span className="inbox-reference">
                          {report.locationReference}
                        </span>
                      </td>
                      <td data-label="Fecha">
                        <time dateTime={report.createdAt}>
                          {formatDate(report.createdAt)}
                        </time>
                      </td>
                      <td data-label="Estado">
                        <span
                          className="report-status"
                          data-status={report.status}
                        >
                          {report.status}
                        </span>
                      </td>
                      <td data-label="Detalle">
                        <a
                          className="inbox-detail-link"
                          href={`/municipal/reportes/${encodeURIComponent(report.id)}`}
                          aria-label={`Ver detalle del reporte ${report.id}`}
                          onClick={(event) => {
                            event.preventDefault()
                            onNavigate(
                              `/municipal/reportes/${encodeURIComponent(report.id)}`,
                            )
                          }}
                        >
                          Ver detalle <span aria-hidden="true">→</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      <footer className="app-footer">
        <span>Reporte Ciudadano</span>
      </footer>
    </div>
  )
}
