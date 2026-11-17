import { useRef, useState } from 'react'
import { REPORT_CATEGORIES, REPORT_STATUSES } from '../../shared/reportRules.js'
import { getMunicipalReport, updateMunicipalReport } from '../services/reportService.js'

export default function MunicipalReportActions({ report, onUpdated }) {
  const [edit, setEdit] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const categoryButton = useRef(null)
  const statusButton = useRef(null)
  const isCategory = edit?.field === 'category'

  function startEdit(field) {
    setError('')
    setNotice('')
    setEdit({
      field,
      original: report[field],
      value: report[field],
      key: crypto.randomUUID(),
    })
  }

  function closeEdit(field) {
    setEdit(null)
    const button = field === 'category' ? categoryButton : statusButton
    requestAnimationFrame(() => button.current?.focus())
  }

  async function confirmChange(event) {
    event.preventDefault()
    if (lock.current || !edit) return
    lock.current = true
    setIsSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await updateMunicipalReport(report.id, edit.field, edit.value, edit.original, edit.key)
      onUpdated(result.report)
      setNotice(result.repeated
        ? 'El cambio ya estaba guardado. Se muestra la información actual del reporte.'
        : !result.changed
          ? 'El valor seleccionado ya era el actual. No se generaron cambios ni avisos.'
          : edit.field === 'category'
            ? 'La categoría se actualizó correctamente.'
            : 'El estado se actualizó correctamente y se generó el aviso interno para el autor del reporte.')
      closeEdit(edit.field)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo guardar el cambio. Intentá nuevamente.')
      if (requestError.status === 409) {
        try {
          onUpdated(await getMunicipalReport(report.id))
          closeEdit(edit.field)
        } catch {
          setError('No se pudo volver a consultar el reporte. Recargá la página antes de editarlo.')
        }
      }
    } finally {
      lock.current = false
      setIsSaving(false)
    }
  }

  return (
    <section className="municipal-management" aria-labelledby="management-title">
      <h2 id="management-title">Gestión del reporte</h2>
      <p className="field-hint">Revisá el valor actual y confirmá cualquier modificación.</p>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <div className="notice notice-success" role="status">{notice}</div>}
      <div className="management-summary">
        <div>
          <span className="field-hint">Categoría actual</span>
          <strong>{report.category}</strong>
          <button ref={categoryButton} className="button button-outline" type="button" disabled={isSaving || edit !== null} onClick={() => startEdit('category')}>Corregir categoría</button>
        </div>
        <div>
          <span className="field-hint">Estado actual</span>
          <span className="report-status" data-status={report.status}>{report.status}</span>
          <button ref={statusButton} className="button button-outline" type="button" disabled={isSaving || edit !== null} onClick={() => startEdit('status')}>Actualizar estado</button>
        </div>
      </div>
      {edit && (
        <form className="management-editor" onSubmit={confirmChange} aria-label={isCategory ? 'Corregir categoría del reporte' : 'Actualizar estado del reporte'}>
          <fieldset disabled={isSaving}>
            <legend>{isCategory ? 'Corregir categoría' : 'Actualizar estado'}</legend>
            <p>Valor actual: <strong>{report[edit.field]}</strong></p>
            <div className="form-field">
              <label htmlFor="management-value">{isCategory ? 'Nueva categoría' : 'Nuevo estado'}</label>
              <select
                autoFocus
                id="management-value"
                value={edit.value}
                onChange={(event) => {
                  setEdit({ ...edit, value: event.target.value, key: crypto.randomUUID() })
                  setError('')
                }}
              >
                {(isCategory ? REPORT_CATEGORIES : REPORT_STATUSES).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            {!isCategory && <p className="field-hint">Al confirmar un cambio de estado, se generará un aviso interno para el autor del reporte.</p>}
            <div className="management-buttons">
              <button className="button button-primary" type="submit">{isSaving ? 'Guardando cambio…' : isCategory ? 'Confirmar categoría' : 'Confirmar estado'}</button>
              <button className="button button-outline" type="button" onClick={() => {
                setError('')
                closeEdit(edit.field)
              }}>Cancelar cambio de {isCategory ? 'categoría' : 'estado'}</button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  )
}
