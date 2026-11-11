import { useEffect, useState } from 'react'
import { getLoginAccounts } from '../services/authService.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function FieldError({ id, children }) {
  if (!children) {
    return null
  }

  return (
    <span className="field-error" id={id}>
      {children}
    </span>
  )
}

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

export default function AuthScreen({
  mode,
  notice,
  noticeIsError = false,
  onNavigate,
  onSubmit,
}) {
  const isRegister = mode === 'register'
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    confirmation: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [accountsError, setAccountsError] = useState('')
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(!isRegister)

  useEffect(() => {
    if (isRegister) {
      return undefined
    }

    let active = true
    getLoginAccounts()
      .then((availableAccounts) => {
        if (active) {
          setAccounts(availableAccounts)
          setAccountsError('')
        }
      })
      .catch((error) => {
        if (active) {
          setAccountsError(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar las cuentas disponibles.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingAccounts(false)
        }
      })

    return () => {
      active = false
    }
  }, [isRegister])

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
  }

  function selectAccount(account) {
    setValues((current) => ({
      ...current,
      email: account.email,
      password: account.password ?? '',
    }))
    setErrors({})
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    const cleanEmail = values.email.trim()

    if (isRegister && !values.name.trim()) {
      nextErrors.name = 'Ingresá tu nombre.'
    }
    if (!cleanEmail) {
      nextErrors.email = 'Ingresá tu correo electrónico.'
    } else if (!EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = 'Ingresá un correo electrónico válido.'
    }
    if (!values.password) {
      nextErrors.password = 'Ingresá tu contraseña.'
    }
    if (isRegister && !values.confirmation) {
      nextErrors.confirmation = 'Confirmá tu contraseña.'
    } else if (isRegister && values.password !== values.confirmation) {
      nextErrors.confirmation = 'Las contraseñas no coinciden.'
    }

    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        name: values.name,
        email: cleanEmail,
        password: values.password,
        confirmation: values.confirmation,
      })
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No se pudo completar la solicitud. Intentá nuevamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-promo" aria-label="Acerca de Reporte Ciudadano">
        <a
          className="brand brand-light"
          href="/login"
          onClick={(event) => {
            event.preventDefault()
            onNavigate('/login')
          }}
        >
          <BrandMark />
          <span>Reporte Ciudadano</span>
        </a>

        <div className="promo-copy">
          <span className="eyebrow eyebrow-light">Tu comunidad, más cerca</span>
          <h1>Hagamos de nuestros espacios un mejor lugar.</h1>
          <p>
            Un canal para conectar a las personas con la municipalidad y dar
            seguimiento a los problemas de la comunidad.
          </p>
          <ul className="promo-benefits">
            <li>
              <span aria-hidden="true">✓</span> Un espacio para cada comunidad
            </li>
            <li>
              <span aria-hidden="true">✓</span> Información clara y cercana
            </li>
            <li>
              <span aria-hidden="true">✓</span> Seguimiento con transparencia
            </li>
          </ul>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-content">
          <div className="mobile-brand">
            <BrandMark />
            <span>Reporte Ciudadano</span>
          </div>

          <span className="eyebrow">
            {isRegister ? 'Unite a tu comunidad' : 'Bienvenido de nuevo'}
          </span>
          <h2 id="auth-title">
            {isRegister ? 'Crear cuenta' : 'Ingresar a tu cuenta'}
          </h2>
          <p className="auth-description">
            {isRegister
              ? 'Registrate para crear y consultar tus reportes ciudadanos.'
              : 'Ingresá para continuar con tus gestiones ciudadanas.'}
          </p>

          {notice && (
            <div
              className={`notice ${noticeIsError ? 'notice-error' : 'notice-success'}`}
              role={noticeIsError ? 'alert' : 'status'}
            >
              {notice}
            </div>
          )}

          {formError && (
            <div className="notice notice-error" role="alert">
              {formError}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isRegister && (
              <div className="form-field">
                <label htmlFor="name">Nombre completo</label>
                <input
                  autoComplete="name"
                  id="name"
                  name="name"
                  type="text"
                  value={values.name}
                  onChange={updateField}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  required
                />
                <FieldError id="name-error">{errors.name}</FieldError>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                autoComplete="email"
                id="email"
                name="email"
                type="email"
                inputMode="email"
                value={values.email}
                onChange={updateField}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                required
              />
              <FieldError id="email-error">{errors.email}</FieldError>
            </div>

            <div className="form-field">
              <label htmlFor="password">Contraseña</label>
              <input
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                id="password"
                name="password"
                type="password"
                value={values.password}
                onChange={updateField}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'password-error' : undefined
                }
                required
              />
              <FieldError id="password-error">{errors.password}</FieldError>
            </div>

            {isRegister && (
              <div className="form-field">
                <label htmlFor="confirmation">Confirmar contraseña</label>
                <input
                  autoComplete="new-password"
                  id="confirmation"
                  name="confirmation"
                  type="password"
                  value={values.confirmation}
                  onChange={updateField}
                  aria-invalid={Boolean(errors.confirmation)}
                  aria-describedby={
                    errors.confirmation ? 'confirmation-error' : undefined
                  }
                  required
                />
                <FieldError id="confirmation-error">
                  {errors.confirmation}
                </FieldError>
              </div>
            )}

            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Un momento…'
                : isRegister
                  ? 'Crear cuenta ciudadana'
                  : 'Iniciar sesión'}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? '¿Ya tenés una cuenta?' : '¿Todavía no tenés cuenta?'}{' '}
            <button
              className="text-button"
              type="button"
              onClick={() => onNavigate(isRegister ? '/login' : '/registro')}
            >
              {isRegister ? 'Iniciá sesión' : 'Crear cuenta'}
            </button>
          </p>

          {!isRegister && (
            <aside className="accounts-card" aria-label="Cuentas disponibles">
              <div className="accounts-heading">
                <strong>Cuentas</strong>
                <p>
                  Elegí una cuenta para completar sus datos de inicio de sesión
                  de demostración.
                </p>
              </div>
              {isLoadingAccounts ? (
                <p className="accounts-message" role="status">
                  Cargando cuentas…
                </p>
              ) : accountsError ? (
                <p className="accounts-message accounts-error" role="alert">
                  {accountsError}
                </p>
              ) : accounts.length > 0 ? (
                <div className="account-options">
                  {accounts.map((account) => (
                    <button
                      className="button button-outline account-option"
                      key={account.id}
                      type="button"
                      onClick={() => selectAccount(account)}
                    >
                      <span>{account.name}</span>
                      <span className="account-option-role">
                        {account.role === 'municipal' ? 'Municipal' : 'Ciudadana'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="accounts-message">
                  Todavía no hay cuentas registradas.
                </p>
              )}
            </aside>
          )}
        </div>
      </section>
    </main>
  )
}
