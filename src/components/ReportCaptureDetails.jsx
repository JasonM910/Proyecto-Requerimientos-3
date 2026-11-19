import PointMap from './PointMap.jsx'
import Icon from './Icon.jsx'

export default function ReportCaptureDetails({ report }) {
  if (!report.audio && !report.location) return null
  return (
    <section className="report-capture-details" aria-label="Descripción de voz y ubicación del reporte">
      {report.audio && <div>
        <h2>Descripción grabada</h2>
        <audio controls preload="metadata" src={report.audio.url} aria-label="Escuchar descripción del reporte" />
        <p className="field-hint">Nota de voz del ciudadano · {Math.ceil(report.audio.durationSeconds)} segundos.</p>
      </div>}
      {report.location && <div>
        <h2>Ubicación del problema</h2>
        <PointMap point={report.location} />
        <a className="inbox-detail-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${report.location.latitude},${report.location.longitude}`)}`} target="_blank" rel="noreferrer">Abrir ubicación en Google Maps <Icon name="external" /></a>
      </div>}
    </section>
  )
}
