function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M16 3.5 27 8v7.3c0 6.3-4.2 10.7-11 13.2C9.2 26 5 21.6 5 15.3V8l11-4.5Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="m11.5 15.7 3.1 3.1 6.3-6.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  )
}

export function AppHeader({ user, onNavigate, onSignOut }) {
  const isCitizen = user.role === 'citizen'

  return (
    <header className="app-header">
      <a
        className="brand"
        href={isCitizen ? '/ciudadano' : '/municipal'}
        onClick={(event) => {
          event.preventDefault()
          onNavigate(isCitizen ? '/ciudadano' : '/municipal')
        }}
      >
        <BrandMark />
        <span>Reporte Ciudadano</span>
      </a>

      <nav className="main-nav" aria-label="Navegación principal">
        {isCitizen ? (
          <>
            <a
              href="/ciudadano"
              onClick={(event) => {
                event.preventDefault()
                onNavigate('/ciudadano')
              }}
            >
              Inicio
            </a>
            <a
              href="/ciudadano/reportes"
              onClick={(event) => {
                event.preventDefault()
                onNavigate('/ciudadano/reportes')
              }}
            >
              Mis reportes
            </a>
          </>
        ) : (
          <span className="nav-role">Espacio municipal</span>
        )}
      </nav>

      <div className="header-account">
        <div className="account-summary">
          <span className="avatar" aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="account-name">{user.name}</span>
          <span className="role-pill">
            {isCitizen ? 'Ciudadano' : 'Municipal'}
          </span>
        </div>
        <button className="button button-outline sign-out" onClick={onSignOut}>
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}

function CitizenHome({ user, onNavigate }) {
  return (
    <>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow eyebrow-light">Reporte Ciudadano</span>
          <h1>Hola, {user.name.split(/\s+/)[0]}.</h1>
          <p>
            Tu participación ayuda a cuidar los espacios que compartimos. ¿Qué
            necesitás hacer hoy?
          </p>
          <button
            className="button button-white"
            onClick={() => onNavigate('/ciudadano/reportes/nuevo')}
          >
            Preparar un reporte <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="welcome-symbol" aria-hidden="true">
          <span>CR</span>
          <span className="symbol-dot" />
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="citizen-actions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tu espacio ciudadano</span>
            <h2 id="citizen-actions">¿Cómo podemos ayudarte?</h2>
          </div>
          <p>Creá un reporte y consultá su estado desde tu cuenta.</p>
        </div>

        <div className="action-grid">
          <button
            className="action-card"
            onClick={() => onNavigate('/ciudadano/reportes/nuevo')}
          >
            <span className="action-icon action-icon-green" aria-hidden="true">
              +
            </span>
            <span className="action-card-title">Crear un reporte</span>
            <span className="action-card-copy">
              Prepará la descripción de una situación en tu comunidad.
            </span>
            <span className="action-card-link">Ir a la sección <span aria-hidden="true">→</span></span>
          </button>

          <button
            className="action-card"
            onClick={() => onNavigate('/ciudadano/reportes')}
          >
            <span className="action-icon action-icon-blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 5.5h14v13H5v-13Zm3 4h8m-8 4h5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
            <span className="action-card-title">Consultar mis reportes</span>
            <span className="action-card-copy">
              Revisá los casos que registraste y el estado actual de cada uno.
            </span>
            <span className="action-card-link">Ir a la sección <span aria-hidden="true">→</span></span>
          </button>
        </div>
      </section>

      <p className="dashboard-disclaimer">
        Tu cuenta se almacena en la base de datos JSON local de esta demostración.
      </p>
    </>
  )
}

function MunicipalHome() {
  return (
    <>
      <section className="municipal-banner">
        <span className="municipal-emblem" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path
              d="M5 13h22M7 13v12m6-12v12m6-12v12m6-12v12M5 27h22M16 4l11 6H5l11-6Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <span>
          <span className="eyebrow">Vista de demostración</span>
          <h1>Espacio municipal</h1>
          <p>Sesión iniciada con una cuenta ficticia de personal municipal.</p>
        </span>
        <span className="role-pill role-pill-large">Rol: Municipal</span>
      </section>

      <section className="municipal-empty" aria-labelledby="municipal-ready">
        <span className="municipal-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <path
              d="M9 10h30v28H9V10Zm7 8h16m-16 7h16m-16 7h9"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </span>
        <span className="eyebrow">Preparado para el siguiente incremento</span>
        <h2 id="municipal-ready">La gestión municipal se integrará aquí</h2>
        <p>
          Esta vista ya valida el rol y protege el acceso. La bandeja de
          reportes, su clasificación y los cambios de estado quedan fuera de
          este incremento.
        </p>
      </section>
    </>
  )
}

export default function Dashboard({
  user,
  notice,
  onNavigate,
  onSignOut,
}) {
  const isCitizen = user.role === 'citizen'

  return (
    <div className="app-shell">
      <AppHeader user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
      <main className="dashboard-main">
        {notice && (
          <div className="notice notice-error access-notice" role="alert">
            {notice}
          </div>
        )}
        {isCitizen ? (
          <CitizenHome user={user} onNavigate={onNavigate} />
        ) : (
          <MunicipalHome />
        )}
      </main>
      <footer className="app-footer">
        <span>Reporte Ciudadano</span>
      </footer>
    </div>
  )
}
