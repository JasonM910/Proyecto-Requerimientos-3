import { useId } from 'react'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value) {
  return DATE_FORMATTER.format(new Date(value))
}

function StatusPill({ status }) {
  return (
    <span className="report-status" data-status={status}>
      {status}
    </span>
  )
}

// HU-13 / RF-14: historial cronológico del reporte. Lo usan el detalle
// ciudadano y el municipal con los mismos datos que entrega el servidor:
// el registro inicial y cada cambio de estado confirmado.
export default function StatusHistory({ history = [], reportId }) {
  const titleId = useId()
  const lastIndex = history.length - 1

  return (
    <section className="history-section" aria-labelledby={titleId}>
      <h2 id={titleId}>Historial de estados</h2>
      <ol className="history-list" aria-label={`Historial del reporte ${reportId}`}>
        {history.map((entry, index) => (
          <li
            key={entry.id}
            className={index === lastIndex ? 'history-current' : undefined}
          >
            <span className="history-dot" aria-hidden="true" />
            <div>
              <strong>
                {entry.type === 'created' ? 'Registro inicial' : 'Cambio de estado'}
              </strong>
              <span className="history-transition">
                {entry.previousStatus && (
                  <>
                    <span className="visually-hidden">Estado anterior: </span>
                    <StatusPill status={entry.previousStatus} />
                    <span aria-hidden="true">→</span>
                    <span className="visually-hidden">Estado nuevo: </span>
                  </>
                )}
                <StatusPill status={entry.status} />
                {index === lastIndex && (
                  <span className="history-current-tag">Estado actual</span>
                )}
              </span>
              <time className="history-time" dateTime={entry.at}>
                {formatDate(entry.at)}
              </time>
            </div>
          </li>
        ))}
      </ol>
      {history.length <= 1 && (
        <p className="field-hint">
          Este reporte todavía no tiene cambios de estado: conserva su estado
          inicial.
        </p>
      )}
    </section>
  )
}