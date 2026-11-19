import { useEffect, useRef, useState } from 'react'
import { AUDIO_TYPES, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '../../shared/captureRules.js'
import Icon from './Icon.jsx'

export default function AudioRecorder({ value, onChange, onBusyChange, disabled }) {
  const [phase, setPhase] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const current = useRef({ token: 0 })

  useEffect(() => {
    const session = current.current
    return () => {
      session.token++
      clearInterval(session.timer)
      if (session.recorder) {
        session.recorder.onstop = null
        if (session.recorder.state !== 'inactive') session.recorder.stop()
      }
      session.stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function start() {
    if (disabled || phase !== 'idle') return
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Este navegador no permite grabar aquí. Abrí la página con HTTPS o escribí la descripción.')
      return
    }
    const session = current.current
    const token = ++session.token
    setPhase('requesting')
    onBusyChange(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (session.token !== token) { stream.getTracks().forEach((track) => track.stop()); return }
      session.stream = stream
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      if (!AUDIO_TYPES.includes(recorder.mimeType.split(';')[0])) throw new Error('unsupported')
      session.recorder = recorder
      const chunks = []
      let size = 0
      const started = performance.now()
      recorder.ondataavailable = ({ data }) => {
        chunks.push(data)
        size += data.size
        if (size > MAX_AUDIO_BYTES && recorder.state === 'recording') recorder.stop()
      }
      recorder.onerror = () => {
        session.token++
        recorder.onstop = null
        clearInterval(session.timer)
        stream.getTracks().forEach((track) => track.stop())
        setError('Se interrumpió la grabación. Podés volver a intentarlo o escribir la descripción.')
        setPhase('idle')
        onBusyChange(false)
      }
      recorder.onstop = async () => {
        clearInterval(session.timer)
        stream.getTracks().forEach((track) => track.stop())
        if (session.token !== token) return
        setPhase('processing')
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType })
          if (!blob.size || blob.size > MAX_AUDIO_BYTES) throw new Error('La grabación está vacía o supera los 5 MB. Volvé a grabarla.')
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('No se pudo preparar la grabación. Volvé a intentarlo.'))
            reader.readAsDataURL(blob)
          })
          if (session.token === token) onChange({ dataUrl, type: recorder.mimeType, durationSeconds: Math.max(0.1, Math.min(MAX_AUDIO_SECONDS, (performance.now() - started) / 1000)) })
        } catch (failure) {
          if (session.token === token) setError(failure.message)
        } finally {
          if (session.token === token) { setPhase('idle'); onBusyChange(false) }
        }
      }
      recorder.start(500)
      setSeconds(0)
      setPhase('recording')
      session.timer = setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_AUDIO_SECONDS && recorder.state === 'recording') recorder.stop()
      }, 250)
    } catch (failure) {
      if (session.token !== token) return
      session.stream?.getTracks().forEach((track) => track.stop())
      setError(failure.name === 'NotAllowedError' ? 'No se autorizó el micrófono. Habilitá el permiso para grabar o escribí la descripción.' : 'No se pudo abrir el micrófono. Revisá los permisos o escribí la descripción.')
      setPhase('idle')
      onBusyChange(false)
    }
  }

  function cancel() {
    const session = current.current
    session.token++
    clearInterval(session.timer)
    if (session.recorder) {
      session.recorder.onstop = null
      if (session.recorder.state !== 'inactive') session.recorder.stop()
    }
    session.stream?.getTracks().forEach((track) => track.stop())
    setPhase('idle')
    onBusyChange(false)
  }

  return (
    <div className="capture-panel audio-recorder">
      <strong>Contalo con tu voz</strong>
      <p className="field-hint">Grabá una nota de hasta dos minutos. Podés escucharla antes de enviar.</p>
      <div className="capture-actions">
        {phase === 'recording' ? (
          <button className="button button-primary recording-stop" type="button" onClick={() => { if (current.current.recorder?.state === 'recording') current.current.recorder.stop() }}><Icon name="stop" />Detener grabación</button>
        ) : <button className="button button-primary" type="button" disabled={disabled || phase !== 'idle'} onClick={start}><Icon name="microphone" />{value ? 'Grabar de nuevo' : 'Grabar descripción'}</button>}
        {value && phase === 'idle' && <button className="button button-outline" type="button" disabled={disabled} onClick={() => onChange(null)}>Retirar audio</button>}
        {['requesting', 'recording'].includes(phase) && <button className="button button-outline" type="button" onClick={cancel}>Cancelar grabación</button>}
      </div>
      <p role="status" className="capture-status">{phase === 'recording' ? `Grabando: ${seconds} s de ${MAX_AUDIO_SECONDS} s. Detené la grabación para continuar.` : phase === 'requesting' ? 'Esperando permiso del micrófono…' : phase === 'processing' ? 'Preparando tu grabación…' : value ? 'Nota de voz lista para enviar.' : ''}</p>
      {value && phase === 'idle' && <audio controls preload="metadata" src={value.dataUrl} aria-label="Escuchar mi descripción grabada" />}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </div>
  )
}
