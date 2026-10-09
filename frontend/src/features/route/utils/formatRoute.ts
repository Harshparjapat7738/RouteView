const METERS_PER_KILOMETER = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const WHOLE_KILOMETER_THRESHOLD = 100

export function formatDistance(meters: number): string {
  if (meters < METERS_PER_KILOMETER) {
    return `${Math.round(meters)} m`
  }
  const kilometers = meters / METERS_PER_KILOMETER
  return `${kilometers >= WHOLE_KILOMETER_THRESHOLD ? Math.round(kilometers) : kilometers.toFixed(1)} km`
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE))
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  if (hours === 0) {
    return `${minutes} min`
  }
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}
