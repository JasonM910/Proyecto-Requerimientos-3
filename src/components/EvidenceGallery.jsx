import { useId, useState } from 'react'
import Icon from './Icon.jsx'

function EvidencePhoto({ photo, index }) {
  const [failed, setFailed] = useState(false)

  return (
    <li className="photo-card">
      {failed ? (
        <p className="photo-unavailable" role="alert">No se pudo cargar esta fotografía. Recargá la página o volvé a iniciar sesión.</p>
      ) : (
        <a className="photo-open" href={photo.url} target="_blank" rel="noreferrer" aria-label={`Abrir fotografía ${index + 1} (nueva pestaña)`}>
          <img src={photo.url} alt={`Evidencia ${index + 1} del reporte`} loading="lazy" onError={() => setFailed(true)} />
          <span>Ver fotografía completa <Icon name="external" /></span>
        </a>
      )}
    </li>
  )
}

// Recibe metadatos de la API; puede usarse también en el futuro detalle municipal.
export default function EvidenceGallery({ photos = [] }) {
  const titleId = useId()

  return (
    <section className="evidence-gallery" aria-labelledby={titleId}>
      <h2 id={titleId}>Fotografías adjuntas</h2>
      {photos.length === 0 ? (
        <p className="field-hint">Este reporte no tiene fotografías adjuntas.</p>
      ) : (
        <ul className="photo-grid" aria-label="Evidencias del reporte">
          {photos.map((photo, index) => <EvidencePhoto key={photo.id} photo={photo} index={index} />)}
        </ul>
      )}
    </section>
  )
}
