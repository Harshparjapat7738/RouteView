/** Zoom for showing the surroundings of the user's position; a coarse fix (cell/Wi-Fi) gets a wider view. */
export function zoomForAccuracy(accuracyMeters: number | null): number {
  if (accuracyMeters === null || accuracyMeters <= 200) {
    return 15
  }
  if (accuracyMeters <= 1_000) {
    return 14
  }
  return accuracyMeters <= 5_000 ? 12 : 10
}
