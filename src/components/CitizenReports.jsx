import { useEffect, useRef, useState } from 'react'
import { AppHeader } from './Dashboard.jsx'
import {
  createCitizenReport,
  getCitizenReport,
  getCitizenReports,
} from '../services/reportService.js'

const CATEGORIES = ['Infraestructura', 'Limpieza', 'Espacios públicos']

const STATUS_GUIDE = [
  {
    status: 'Recibido',
    description: 'La municipalidad recibió el reporte.',
    available: true,
  },
  {
    status: 'En revisión',
    description: 'El personal municipal está revisando la información.',
  },
  {
    status: 'En proceso',
    description: 'La atención del problema está en curso.',
  },
  {
    status: 'Resuelto',
    description: 'La municipalidad marcó el problema como resuelto.',
  },
]

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value) {
  return DATE_FORMATTER.format(new Date(value))
}

function newIdempotencyKey() {
  return globalThis.crypto.randomUUID()
}

function CitizenLayout({ user, onNavigate, onSignOut, children }) {
  return (
    <div className="app-shell">
      <AppHeader user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
      <main className="citizen-reports-main">{children}</main>
      <footer className="app-footer">
        <span>Reporte Ciudadano</span>
      </footer>
    </div>
  )
}

function PageBackLink({ label, onClick }) {
  return (
    <button className="back-link" type="button" onClick={onClick}>
      <span aria-hidden="true">←</span> {label}
    </button>
  )
}

function FormFieldError({ id, children }) {
  if (!children) {
    return null
  }

  return (
    <span className="field-error" id={id}>
      {children}
    </span>
  )
}

function StatusGuide() {
  return (
    <section className="status-guide" aria-labelledby="status-guide-title">
      <div>
        <span className="eyebrow">Seguimiento</span>
        <h2 id="status-guide-title">Estados del reporte</h2>
      </div>
      <p className="status-guide-note">
        Tus reportes iniciarán en <strong>Recibido</strong>. Los demás estados
        son etapas informativas; todavía no se actualizan en este sprint.
      </p>
      <ol className="status-guide-list">
        {STATUS_GUIDE.map((item, index) => (
          <li
            className={`status-guide-item ${item.available ? 'is-available' : 'is-future'}`}
            key={item.status}
          >
            <span className="status-step" aria-hidden="true">
              {item.available ? '✓' : index + 1}
            </span>
            <span>
              <strong>{item.status}</strong>
              <span className="status-description">{item.description}</span>
            </span>
            {!item.available && <span className="status-future-tag">Etapa futura</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function ReportForm({ user, onNavigate, onSignOut }) {
  const [values, setValues] = useState({
    description: '',
    category: '',
    community: '',
    locationReference: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdReport, setCreatedReport] = useState(null)
  const submissionLock = useRef(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionLock.current) {
      return
    }

    const nextErrors = {}
    if (!values.description.trim()) {
      nextErrors.description = 'Escribí una descripción del problema.'
    }
    if (!values.category) {
      nextErrors.category = 'Seleccioná una categoría.'
    }
    if (!values.community.trim()) {
      nextErrors.community = 'Ingresá la comunidad o localidad.'
    }
    if (!values.locationReference.trim()) {
      nextErrors.locationReference = 'Ingresá una referencia del sitio.'
    }

    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    submissionLock.current = true
    setIsSubmitting(true)
    try {
      const report = await createCitizenReport(
        {
          description: values.description.trim(),
          category: values.category,
          community: values.community.trim(),
          locationReference: values.locationReference.trim(),
        },
        idempotencyKey.current,
      )
      setCreatedReport(report)
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el reporte. Revisá los datos e intentá nuevamente.',
      )
    } finally {
      submissionLock.current = false
      setIsSubmitting(false)
    }
  }

  function startAnotherReport() {
    setValues({
      description: '',
      category: '',
      community: '',
      locationReference: '',
    })
    setErrors({})
    setFormError('')
    setCreatedReport(null)
    idempotencyKey.current = newIdempotencyKey()
  }

  if (createdReport) {
    return (
      <CitizenLayout
        user={user}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      >
        <div className="report-page-heading">
          <PageBackLink
            label="Volver a mis reportes"
            onClick={() => onNavigate('/ciudadano/reportes')}
          />
        </div>
        <section className="report-confirmation" aria-labelledby="confirmation-title">
          <span className="confirmation-check" aria-hidden="true">
            ✓
          </span>
          <span className="eyebrow">Envío completado</span>
          <h1 id="confirmation-title">Tu reporte fue recibido</h1>
          <p>
            Guardamos la información del problema para que podás identificarlo
            y consultarlo desde tu cuenta.
          </p>

          <dl className="confirmation-details">
            <div>
              <dt>Identificador</dt>
              <dd>{createdReport.id}</dd>
            </div>
            <div>
              <dt>Fecha y hora</dt>
              <dd>{formatDate(createdReport.createdAt)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <span className="report-status">{createdReport.status}</span>
              </dd>
            </div>
          </dl>

          <div className="confirmation-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() =>
                onNavigate(
                  `/ciudadano/reportes/${encodeURIComponent(createdReport.id)}`,
                )
              }
            >
              Consultar reporte
            </button>
            <button
              className="button button-outline"
              type="button"
              onClick={startAnotherReport}
            >
              Crear otro reporte
            </button>
          </div>
        </section>
      </CitizenLayout>
    )
  }

  return (
    <CitizenLayout user={user} onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="report-page-heading">
        <PageBackLink
          label="Volver al inicio"
          onClick={() => onNavigate('/ciudadano')}
        />
        <span className="eyebrow">Nuevo reporte ciudadano</span>
        <h1>Contanos qué sucede</h1>
        <p>
          Describí el problema y dónde ocurre. Revisá la información antes de
          enviarla.
        </p>
      </div>

      <div className="report-create-layout">
        <form className="report-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="notice notice-error" role="alert">
              {formError}
            </div>
          )}

          <section className="report-form-section" aria-labelledby="problem-section-title">
            <div className="form-section-heading">
              <span className="form-section-number">1</span>
              <div>
                <h2 id="problem-section-title">Información del problema</h2>
                <p>Ayudanos a comprender la situación de tu comunidad.</p>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="description">Descripción del problema</label>
              <textarea
                autoComplete="off"
                id="description"
                name="description"
                rows="5"
                value={values.description}
                onChange={updateField}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={
                  errors.description
                    ? 'description-error'
                    : 'description-hint'
                }
                placeholder="Por ejemplo: Hay un bache grande en la calle que dificulta el paso de los vehículos."
                required
              />
              <span className="field-hint" id="description-hint">
                Describí qué ocurre y cómo afecta a las personas.
              </span>
              <FormFieldError id="description-error">
                {errors.description}
              </FormFieldError>
            </div>

            <fieldset className="category-fieldset">
              <legend>Categoría del problema</legend>
              <div className="category-options">
                {CATEGORIES.map((category, index) => (
                  <label
                    className={`category-option ${values.category === category ? 'is-selected' : ''}`}
                    htmlFor={`category-${index}`}
                    key={category}
                  >
                    <input
                      id={`category-${index}`}
                      name="category"
                      type="radio"
                      value={category}
                      checked={values.category === category}
                      onChange={updateField}
                      aria-describedby={
                        errors.category ? 'category-error' : undefined
                      }
                    />
                    <span className="category-radio" aria-hidden="true" />
                    <span className="category-option-copy">
                      <strong>{category}</strong>
                      <span>
                        {index === 0
                          ? 'Calles, aceras y estructuras'
                          : index === 1
                            ? 'Basura y limpieza de espacios'
                            : 'Parques y espacios compartidos'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <FormFieldError id="category-error">
                {errors.category}
              </FormFieldError>
            </fieldset>
          </section>

          <section className="report-form-section" aria-labelledby="location-section-title">
            <div className="form-section-heading">
              <span className="form-section-number">2</span>
              <div>
                <h2 id="location-section-title">Ubicación</h2>
                <p>Indicá dónde puede encontrarse el problema.</p>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="community">Comunidad o localidad</label>
              <input
                autoComplete="address-level2"
                id="community"
                name="community"
                type="text"
                value={values.community}
                onChange={updateField}
                aria-invalid={Boolean(errors.community)}
                aria-describedby={errors.community ? 'community-error' : undefined}
                placeholder="Ej.: San Rafael"
                required
              />
              <FormFieldError id="community-error">
                {errors.community}
              </FormFieldError>
            </div>

            <div className="form-field">
              <label htmlFor="locationReference">Referencia del sitio</label>
              <input
                autoComplete="street-address"
                id="locationReference"
                name="locationReference"
                type="text"
                value={values.locationReference}
                onChange={updateField}
                aria-invalid={Boolean(errors.locationReference)}
                aria-describedby={
                  errors.locationReference
                    ? 'location-reference-error'
                    : 'location-reference-hint'
                }
                placeholder="Ej.: Frente a la escuela, 100 m al norte"
                required
              />
              <span className="field-hint" id="location-reference-hint">
                Agregá una referencia fácil de reconocer.
              </span>
              <FormFieldError id="location-reference-error">
                {errors.locationReference}
              </FormFieldError>
            </div>
          </section>

          <div className="report-form-footer">
            <p>Podés revisar y corregir la información antes de enviar.</p>
            <button
              className="button button-primary report-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enviando reporte…' : 'Enviar reporte'}
              {!isSubmitting && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </form>

        <aside className="report-sidebar">
          <section className="report-tip-card">
            <span className="tip-icon" aria-hidden="true">
              i
            </span>
            <h2>Un buen reporte ayuda a actuar</h2>
            <p>
              Una descripción clara y una referencia precisa facilitan que la
              municipalidad identifique el lugar y comprenda el problema.
            </p>
          </section>
          <section className="report-photo-note">
            <span aria-hidden="true">◇</span>
            <p>
              En este sprint no es necesario adjuntar fotografías. Podrás
              agregar evidencia en una entrega posterior.
            </p>
          </section>
          <StatusGuide />
        </aside>
      </div>
    </CitizenLayout>
  )
}

function ReportList({ user, onNavigate, onSignOut }) {
  const [reports, setReports] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    getCitizenReports()
      .then((items) => {
        if (active) {
          setReports(items)
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar tus reportes.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <CitizenLayout user={user} onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="report-page-heading">
        <PageBackLink
          label="Volver al inicio"
          onClick={() => onNavigate('/ciudadano')}
        />
        <div className="report-list-title-row">
          <div>
            <span className="eyebrow">Seguimiento ciudadano</span>
            <h1>Mis reportes</h1>
            <p>Consultá los casos que registraste en tu comunidad.</p>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onNavigate('/ciudadano/reportes/nuevo')}
          >
            <span aria-hidden="true">+</span> Crear reporte
          </button>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <section className="report-list-state" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true" />
          <p>Cargando tus reportes…</p>
        </section>
      ) : reports.length === 0 ? (
        <section className="report-list-state report-empty-state">
          <span className="empty-report-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="M11 8h19l8 8v24H11V8Zm18 1v9h9M17 25h14m-14 6h14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </span>
          <h2>Todavía no tenés reportes</h2>
          <p>
            Cuando registres un problema, aparecerá aquí para que podás revisar
            su información y estado.
          </p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onNavigate('/ciudadano/reportes/nuevo')}
          >
            Crear mi primer reporte
          </button>
        </section>
      ) : (
        <section className="report-list-section" aria-labelledby="report-list-title">
          <div className="report-list-caption">
            <h2 id="report-list-title">Reportes registrados</h2>
            <span>
              {reports.length} {reports.length === 1 ? 'reporte' : 'reportes'}
            </span>
          </div>
          <div className="report-list">
            {reports.map((report) => (
              <button
                className="report-list-item"
                key={report.id}
                type="button"
                onClick={() =>
                  onNavigate(
                    `/ciudadano/reportes/${encodeURIComponent(report.id)}`,
                  )
                }
              >
                <span className="report-list-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 4.5h8l4 4V20H6V4.5Zm8 0v5h4M9 13h6m-6 3.5h6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.7"
                    />
                  </svg>
                </span>
                <span className="report-list-summary">
                  <strong>{report.category}</strong>
                  <span>{report.id}</span>
                </span>
                <span className="report-list-date">
                  {formatDate(report.createdAt)}
                </span>
                <span className="report-status">{report.status}</span>
                <span className="report-list-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <StatusGuide />
    </CitizenLayout>
  )
}

function ReportDetail({ reportId, user, onNavigate, onSignOut }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    getCitizenReport(reportId)
      .then((item) => {
        if (active) {
          setReport(item)
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar el reporte.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [reportId])

  return (
    <CitizenLayout user={user} onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="report-page-heading">
        <PageBackLink
          label="Volver a mis reportes"
          onClick={() => onNavigate('/ciudadano/reportes')}
        />
      </div>

      {isLoading ? (
        <section className="report-list-state" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true" />
          <p>Cargando el reporte…</p>
        </section>
      ) : error ? (
        <section className="report-list-state report-empty-state" role="alert">
          <h1>No se pudo encontrar el reporte</h1>
          <p>{error}</p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onNavigate('/ciudadano/reportes')}
          >
            Volver a mis reportes
          </button>
        </section>
      ) : (
        <article className="report-detail">
          <header className="report-detail-header">
            <div>
              <span className="eyebrow">Detalle del reporte</span>
              <h1>{report.id}</h1>
              <p>Registrado el {formatDate(report.createdAt)}</p>
            </div>
            <span className="report-status report-status-large">
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
                <span className="report-status">{report.status}</span>
              </dd>
            </div>
          </dl>

          <p className="report-status-immutable">
            El estado de este reporte no se puede modificar desde la cuenta
            ciudadana.
          </p>
        </article>
      )}

      {!isLoading && !error && <StatusGuide />}
    </CitizenLayout>
  )
}

export default function CitizenReports({
  page,
  reportId,
  user,
  onNavigate,
  onSignOut,
}) {
  if (page === 'create') {
    return (
      <ReportForm
        user={user}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />
    )
  }

  if (reportId) {
    return (
      <ReportDetail
        key={reportId}
        reportId={reportId}
        user={user}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />
    )
  }

  return (
    <ReportList user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
  )
}
