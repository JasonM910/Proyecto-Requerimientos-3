import { useRef, useState } from 'react'
import { MAX_PHOTOS, photoValidationError } from '../../shared/photoRules.js'
import CameraCapture from './CameraCapture.jsx'

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('El archivo no contiene una fotografía válida.'))
      image.onload = () => resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
      })
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function PhotoPicker({ photos, onChange, disabled, onBusyChange }) {
  const [messages, setMessages] = useState([])
  const [isReading, setIsReading] = useState(false)
  const readLock = useRef(false)
  const inputRef = useRef(null)
  const busy = useRef({ reading: false, camera: false })
  const [cameraActive, setCameraActive] = useState(false)

  function updateBusy(channel, value) {
    busy.current[channel] = value
    onBusyChange(busy.current.reading || busy.current.camera)
  }

  async function selectPhotos(event) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    await addFiles(files)
  }

  async function addFiles(files) {
    if (disabled || readLock.current || files.length === 0) return

    readLock.current = true
    setIsReading(true)
    updateBusy('reading', true)
    const nextPhotos = [...photos]
    const nextMessages = []
    try {
      for (const file of files) {
        const validationError = photoValidationError(file)
        if (validationError) {
          nextMessages.push(`${file.name}: ${validationError}`)
          continue
        }
        if (nextPhotos.length >= MAX_PHOTOS) {
          nextMessages.push(`No se agregó ${file.name}: podés adjuntar un máximo de tres fotografías. Retirá una para agregar otra.`)
          continue
        }
        try {
          const photo = await readPhoto(file)
          if (nextPhotos.some((item) => item.dataUrl === photo.dataUrl)) {
            nextMessages.push(`${file.name}: esta fotografía ya está seleccionada.`)
            continue
          }
          nextPhotos.push(photo)
        } catch (error) {
          nextMessages.push(`${file.name}: ${error.message}`)
        }
      }
      onChange(nextPhotos)
      setMessages(nextMessages)
    } finally {
      readLock.current = false
      setIsReading(false)
      updateBusy('reading', false)
    }
  }

  function removePhoto(id) {
    onChange(photos.filter((photo) => photo.id !== id))
    setMessages([])
    inputRef.current?.focus()
  }

  return (
    <section className="report-form-section" aria-labelledby="photos-section-title">
      <div className="form-section-heading">
        <span className="form-section-number">3</span>
        <div>
          <h2 id="photos-section-title">Fotografías del problema <span className="photo-optional">(opcional)</span></h2>
          <p>Revisá las imágenes y retirá las que no querás enviar.</p>
        </div>
      </div>
      <CameraCapture
        disabled={disabled || isReading || photos.length >= MAX_PHOTOS}
        onCapture={(file) => addFiles([file])}
        onActiveChange={(active) => {
          setCameraActive(active)
          updateBusy('camera', active)
        }}
      />
      <div className="form-field photo-upload">
        <label htmlFor="report-photos">Agregar fotografías</label>
        <input
          id="report-photos"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={disabled || isReading || cameraActive}
          onChange={selectPhotos}
          aria-describedby="photos-hint photos-count"
        />
        <span className="field-hint" id="photos-hint">Hasta tres fotografías JPEG o PNG, de máximo 5 MB cada una.</span>
      </div>
      <p className="photo-count" id="photos-count" role="status">
        {isReading ? 'Preparando fotografías…' : `${photos.length} de ${MAX_PHOTOS} fotografías seleccionadas`}
      </p>
      {messages.length > 0 && (
        <div className="notice notice-error photo-errors" role="alert">
          <ul>{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
        </div>
      )}
      {photos.length > 0 && (
        <ul className="photo-grid photo-preview" aria-label="Fotografías seleccionadas">
          {photos.map((photo, index) => (
            <li className="photo-card" key={photo.id}>
              <img src={photo.dataUrl} alt={`Fotografía seleccionada ${index + 1}`} />
              <div className="photo-card-copy">
                <button className="button button-outline photo-remove" type="button" disabled={disabled || isReading || cameraActive} onClick={() => removePhoto(photo.id)} aria-label={`Retirar fotografía ${index + 1}`}>
                  Retirar fotografía
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
