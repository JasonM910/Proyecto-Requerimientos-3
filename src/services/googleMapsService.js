import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

export const GOOGLE_MAPS_ERROR_EVENT = 'reporte-google-maps-error'
let loading
let configured = false

export function loadGoogleMaps() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  if (!key) {
    const error = new Error('Google Maps no está disponible en este momento. Tu ubicación actual sí se puede usar.')
    error.code = 'MAPS_KEY_MISSING'
    return Promise.reject(error)
  }
  if (!loading) {
    if (!configured) {
      setOptions({ key, v: 'weekly', language: 'es', region: 'CR' })
      const previousFailure = window.gm_authFailure
      window.gm_authFailure = () => {
        window.dispatchEvent(new Event(GOOGLE_MAPS_ERROR_EVENT))
        previousFailure?.()
      }
      configured = true
    }
    loading = Promise.all([importLibrary('maps'), importLibrary('marker')])
      .then(([maps, markers]) => ({ Map: maps.Map, AdvancedMarkerElement: markers.AdvancedMarkerElement }))
      .catch((error) => { loading = undefined; throw error })
  }
  return loading
}
