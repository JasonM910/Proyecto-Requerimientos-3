import { useEffect, useRef, useState } from 'react'
import PointMap from './PointMap.jsx'
import Icon from './Icon.jsx'

export default function LocationPicker({ point, onChange, disabled, children, hasErrors }) {
  const [mapOpen, setMapOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])

  function select(point) {
    request.current++
    setLocating(false)
    setError('')
    onChange(point)
  }

  function locate() {
    if (!navigator.geolocation) { setError('Este navegador no permite obtener la ubicación. Marcala en el mapa o escribí la dirección.'); return }
    const token = ++request.current
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (token !== request.current) return
      setLocating(false)
      onChange({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy })
      setMapOpen(true)
    }, (failure) => {
      if (token !== request.current) return
      setLocating(false)
      setError(failure.code === 1 ? 'No se autorizó la ubicación. Podés marcar el punto en el mapa o escribir la dirección.' : 'No se pudo obtener tu ubicación. Intentá de nuevo o elegí el punto en el mapa.')
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  return (
    <div className="location-picker">
      <div className="capture-actions">
        <button className="button button-primary" type="button" disabled={disabled || locating} onClick={locate}><Icon name="pin" />{locating ? 'Buscando ubicación…' : 'Usar mi ubicación actual'}</button>
        <button className="button button-outline" type="button" disabled={disabled} onClick={() => setMapOpen((value) => !value)}>{mapOpen ? 'Ocultar Google Maps' : 'Elegir en Google Maps'}</button>
      </div>
      {point && <p className="capture-status" role="status">Ubicación seleccionada: {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}.{point.accuracy !== undefined && ` Precisión aproximada: ${Math.round(point.accuracy)} m.`} Revisá que el punto corresponda al problema.</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {mapOpen && <><p className="field-hint">Tocá el lugar o arrastrá el marcador. Con teclado, mové el mapa con las flechas y marcá su centro.</p><PointMap point={point} disabled={disabled} onChange={select} /></>}
      <div className="capture-actions location-manual-toggle">
        <button className="text-button" type="button" disabled={disabled} onClick={() => setManual((value) => !value)}>{manual ? 'Ocultar dirección escrita' : point ? 'Agregar una referencia (opcional)' : 'Prefiero escribir la ubicación'}</button>
        {point && <button className="text-button" type="button" disabled={disabled} onClick={() => { select(null); setManual(true) }}>Retirar ubicación del mapa</button>}
      </div>
      {(manual || hasErrors) && <div className="manual-location">{children}</div>}
    </div>
  )
}
