import { AppHeader } from './Dashboard.jsx'

export default function ReportIntegrationPlaceholder({
  type,
  user,
  onNavigate,
  onSignOut,
}) {
  const isCreate = type === 'create'

  return (
    <div className="app-shell">
      <AppHeader user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
      <main className="integration-main">
        <button
          className="back-link"
          onClick={() => onNavigate('/ciudadano')}
        >
          <span aria-hidden="true">←</span> Volver al inicio
        </button>

        <section className="integration-card">
          <span className="integration-icon" aria-hidden="true">
            {isCreate ? '+' : '≡'}
          </span>
          <span className="eyebrow">Punto de integración · Sprint 1</span>
          <h1>{isCreate ? 'Crear un reporte' : 'Mis reportes'}</h1>
          <p>
            {isCreate
              ? 'Este espacio queda reservado para integrar la creación y el envío de reportes desarrollados por el equipo.'
              : 'Este espacio queda reservado para integrar la consulta de reportes ciudadanos desarrollada por el equipo.'}
          </p>
          <p className="integration-path">
            Ruta disponible:{' '}
            <code>
              {isCreate
                ? '/ciudadano/reportes/nuevo'
                : '/ciudadano/reportes'}
            </code>
          </p>
        </section>
      </main>
      <footer className="app-footer">
        <span>Reporte Ciudadano</span>
      </footer>
    </div>
  )
}
