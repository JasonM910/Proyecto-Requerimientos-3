export const MAX_AUDIO_BYTES = 5 * 1024 * 1024
export const MAX_AUDIO_SECONDS = 120
export const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg']

export function validLocation(point) {
  return point && typeof point.latitude === 'number' && Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 && typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 &&
    (point.accuracy === undefined || (typeof point.accuracy === 'number' && Number.isFinite(point.accuracy) && point.accuracy >= 0))
}
