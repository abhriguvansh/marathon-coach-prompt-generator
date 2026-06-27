const METERS_PER_MILE = 1609.344;
const KILOMETERS_PER_MILE = 1.609344;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function kilometersToMiles(kilometers: number): number {
  return kilometers / KILOMETERS_PER_MILE;
}

export function secondsToMinutes(seconds: number): number {
  return seconds / 60;
}

export function secondsToReadableDuration(seconds: number): string {
  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
