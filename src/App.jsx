import { useCallback, useEffect, useState } from 'react'
import AuthScreen from './components/AuthScreen.jsx'
import CitizenReports from './components/CitizenReports.jsx'
import Dashboard from './components/Dashboard.jsx'
import {
  getCurrentSession,
  registerCitizen,
  signIn,
  signOut,
} from './services/authService.js'
import './App.css'

const KNOWN_PATHS = new Set([
  '/login',
  '/registro',
  '/ciudadano',
  '/ciudadano/reportes',
  '/ciudadano/reportes/nuevo',
  '/municipal',
])

function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function getReportId(path) {
  const match = path.match(/^\/ciudadano\/reportes\/([^/]+)$/)
  if (!match) {
    return null
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function homeForRole(role) {
  return role === 'municipal' ? '/municipal' : '/ciudadano'
}

function resolvePath(path, session) {
  if (path === '/' || (session && ['/login', '/registro'].includes(path))) {
    return session ? homeForRole(session.role) : '/login'
  }

  if (!session && path !== '/login' && path !== '/registro') {
    return '/login'
  }

  if (session?.role === 'citizen' && path.startsWith('/municipal')) {
    return '/ciudadano'
  }

  if (session?.role === 'municipal' && path.startsWith('/ciudadano')) {
    return '/municipal'
  }

  return KNOWN_PATHS.has(path) || getReportId(path) !== null
    ? path
    : session
      ? homeForRole(session.role)
      : '/login'
}

export default function App() {
  const [path, setPath] = useState(currentPath)
  const [session, setSession] = useState(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [startupError, setStartupError] = useState('')
  const [notice, setNotice] = useState('')

  const navigate = useCallback((destination, options = {}) => {
    const normalized = destination.replace(/\/+$/, '') || '/'
    if (options.replace) {
      window.history.replaceState({}, '', normalized)
    } else {
      window.history.pushState({}, '', normalized)
    }
    setPath(normalized)
    if (!options.keepNotice) {
      setNotice('')
    }
  }, [])

  const effectivePath = resolvePath(path, session)

  useEffect(() => {
    const handlePopState = () => setPath(currentPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let active = true
    getCurrentSession()
      .then((user) => {
        if (active) {
          setSession(user)
        }
      })
      .catch((error) => {
        if (active) {
          setStartupError(
            error instanceof Error
              ? error.message
              : 'No se pudo recuperar la sesión guardada.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsSessionLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleRegister(credentials) {
    await registerCitizen(credentials)
    setStartupError('')
    setNotice('Tu cuenta ciudadana fue creada. Ya podés iniciar sesión.')
    navigate('/login', { keepNotice: true })
  }

  async function handleLogin(credentials) {
    const user = await signIn(credentials)
    setSession(user)
    setStartupError('')
    setNotice('')
    navigate(homeForRole(user.role), { replace: true })
  }

  async function handleSignOut() {
    try {
      await signOut()
      setSession(null)
      setStartupError('')
      setNotice('')
      navigate('/login', { replace: true })
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'No se pudo cerrar la sesión. Intentá nuevamente.',
      )
    }
  }

  if (isSessionLoading) {
    return null
  }

  if (effectivePath === '/login' || effectivePath === '/registro') {
    return (
      <AuthScreen
        key={effectivePath}
        mode={effectivePath === '/registro' ? 'register' : 'login'}
        notice={startupError || notice}
        noticeIsError={Boolean(startupError)}
        onNavigate={navigate}
        onSubmit={effectivePath === '/registro' ? handleRegister : handleLogin}
      />
    )
  }

  if (!session) {
    return null
  }

  if (
    effectivePath === '/ciudadano' ||
    effectivePath === '/municipal'
  ) {
    const deniedMunicipalRoute =
      session.role === 'citizen' && path.startsWith('/municipal')

    return (
      <Dashboard
        user={session}
        notice={
          deniedMunicipalRoute
            ? 'Tu cuenta ciudadana no tiene permiso para acceder a la vista municipal.'
            : notice
        }
        onNavigate={navigate}
        onSignOut={handleSignOut}
      />
    )
  }

  if (effectivePath.startsWith('/ciudadano/reportes')) {
    return (
      <CitizenReports
        page={
          effectivePath === '/ciudadano/reportes/nuevo' ? 'create' : 'list'
        }
        reportId={
          effectivePath === '/ciudadano/reportes' ||
          effectivePath === '/ciudadano/reportes/nuevo'
            ? null
            : getReportId(effectivePath)
        }
        user={session}
        onNavigate={navigate}
        onSignOut={handleSignOut}
      />
    )
  }

  return null
}
