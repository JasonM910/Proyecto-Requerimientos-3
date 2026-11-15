export const MAX_PHOTOS = 3
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png']

export function photoValidationError(photo) {
  if (!PHOTO_TYPES.includes(photo.type)) {
    return 'Solo se admiten fotografías JPEG y PNG.'
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return 'La fotografía supera el máximo de 5 MB.'
  }
  if (photo.size === 0) {
    return 'El archivo está vacío. Seleccioná una fotografía válida.'
  }
  return ''
}
