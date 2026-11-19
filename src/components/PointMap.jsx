import { useEffect, useRef, useState } from 'react'
import { GOOGLE_MAPS_ERROR_EVENT, loadGoogleMaps } from '../services/googleMapsService.js'

function coordinates(position) {
  return {
    latitude: typeof position.lat === 'function' ? position.lat() : position.lat,
    longitude: typeof position.lng === 'function' ? position.lng() : position.lng,
  }
}

export default function PointMap({ point, onChange, disabled = false }) {
  const container = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const latitude = point?.latitude
  const longitude = point?.longitude

  useEffect(() => {
    let active = true
    let instance
    let pin
    function fail(failure) {
      if (active) setError(failure?.code === 'MAPS_KEY_MISSING' ? failure.message : 'No se pudo cargar Google Maps. La ubicación elegida se conserva; podés usar el GPS o escribir una referencia.')
    }
    window.addEventListener(GOOGLE_MAPS_ERROR_EVENT, fail)
    loadGoogleMaps().then(({ Map, AdvancedMarkerElement }) => {
      if (!active) return
      instance = new Map(container.current, {
        center: { lat: 9.93, lng: -84.08 },
        zoom: 8,
        mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
        gestureHandling: 'greedy',
        scrollwheel: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      })
      pin = new AdvancedMarkerElement({ title: 'Ubicación del problema' })
      map.current = instance
      marker.current = pin
      setReady(true)
    }).catch(fail)
    return () => {
      active = false
      window.removeEventListener(GOOGLE_MAPS_ERROR_EVENT, fail)
      if (pin) pin.map = null
      if (instance) window.google?.maps.event.clearInstanceListeners(instance)
      map.current = null
      marker.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || !map.current || !marker.current) return
    if (latitude === undefined || longitude === undefined) {
      marker.current.map = null
      return
    }
    const position = { lat: latitude, lng: longitude }
    marker.current.position = position
    marker.current.map = map.current
    map.current.panTo(position)
    map.current.setZoom(Math.max(map.current.getZoom() ?? 8, 16))
  }, [ready, latitude, longitude])

  useEffect(() => {
    if (!ready || !map.current || !marker.current) return
    const instance = map.current
    const pin = marker.current
    pin.gmpDraggable = Boolean(onChange) && !disabled
    instance.setOptions({ keyboardShortcuts: !disabled, zoomControl: !disabled, gestureHandling: disabled ? 'none' : 'greedy', scrollwheel: !disabled })
    const click = instance.addListener('click', (event) => {
      if (!disabled && event.latLng) onChange?.(coordinates(event.latLng))
    })
    function drag() {
      if (!disabled && pin.position) onChange?.(coordinates(pin.position))
    }
    pin.addEventListener('gmp-dragend', drag)
    return () => { click.remove(); pin.removeEventListener('gmp-dragend', drag) }
  }, [ready, onChange, disabled])

  return (
    <div className="point-map-wrapper" aria-busy={!ready && !error}>
      {!ready && !error && <p className="field-hint" role="status">Cargando Google Maps…</p>}
      <div className="point-map" hidden={Boolean(error)} ref={container} aria-label={onChange ? 'Google Maps para seleccionar la ubicación del problema' : 'Google Maps con la ubicación del reporte'} />
      {error ? <p className="notice notice-error" role="alert">{error}</p> : onChange && (
        <button className="button button-outline" type="button" disabled={disabled || !ready} onClick={() => {
          const center = map.current?.getCenter()
          if (center) onChange(coordinates(center))
        }}>Marcar el centro del mapa</button>
      )}
    </div>
  )
}
