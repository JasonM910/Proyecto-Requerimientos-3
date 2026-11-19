import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

export default function CameraCapture({ onCapture, onActiveChange, disabled }) {
  const [phase, setPhase] = useState('closed')
  const [error, setError] = useState('')
  const video = useRef(null)
  const session = useRef({ token: 0 })
  const nativeCamera = useRef(null)
  useEffect(() => {
    const current = session.current
    return () => { current.token++; current.stream?.getTracks().forEach((track) => track.stop()) }
  }, [])

  function close() {
    session.current.token++
    session.current.stream?.getTracks().forEach((track) => track.stop())
    setPhase('closed')
    onActiveChange(false)
  }

  async function open() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { nativeCamera.current?.click(); return }
    const token = ++session.current.token
    setPhase('requesting')
    onActiveChange(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false })
      if (token !== session.current.token) { stream.getTracks().forEach((track) => track.stop()); return }
      session.current.stream = stream
      video.current.srcObject = stream
      await video.current.play()
      if (token === session.current.token) setPhase('live')
    } catch {
      if (token !== session.current.token) return
      close()
      setError('No se pudo abrir la cámara. Revisá el permiso o usá la cámara del teléfono o la galería.')
    }
  }

  async function capture() {
    if (phase !== 'live' || !video.current?.videoWidth || session.current.capturing) return
    session.current.capturing = true
    const token = session.current.token
    setPhase('capturing')
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1600 / Math.max(video.current.videoWidth, video.current.videoHeight))
      canvas.width = Math.round(video.current.videoWidth * scale)
      canvas.height = Math.round(video.current.videoHeight * scale)
      canvas.getContext('2d').drawImage(video.current, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) throw new Error('capture')
      if (token === session.current.token) await onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      if (token === session.current.token) close()
    } catch {
      if (token === session.current.token) { close(); setError('No se pudo tomar la fotografía. Volvé a intentarlo.') }
    } finally {
      session.current.capturing = false
    }
  }

  return (
    <div className="camera-capture">
      <div className="capture-actions">
        <button className="button button-primary" type="button" disabled={disabled || phase !== 'closed'} onClick={open}><Icon name="camera" />Tomar fotografía</button>
        {error && <button className="button button-outline" type="button" disabled={disabled || phase !== 'closed'} onClick={() => nativeCamera.current.click()}>Cámara del teléfono</button>}
        <input className="visually-hidden" aria-label="Capturar con la cámara del teléfono" tabIndex={-1} ref={nativeCamera} type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled} onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) await onCapture(file)
        }} />
      </div>
      {phase !== 'closed' && (
        <div className="camera-preview">
          <video ref={video} autoPlay playsInline muted aria-label="Vista previa de la cámara" />
          <p role="status">{phase === 'requesting' ? 'Esperando permiso de la cámara…' : phase === 'capturing' ? 'Preparando fotografía…' : 'Encuadrá el problema y tomá la foto.'}</p>
          <div className="capture-actions">
            <button className="button button-primary" type="button" disabled={phase !== 'live'} onClick={capture}><Icon name="camera" />Capturar foto</button>
            <button className="button button-outline" type="button" disabled={phase === 'capturing'} onClick={close}>Cancelar cámara</button>
          </div>
        </div>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </div>
  )
}
