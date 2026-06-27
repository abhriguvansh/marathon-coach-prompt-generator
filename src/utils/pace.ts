const MARATHON_MILES = 26.2188;

export function paceSecondsPerMile(
  distanceMiles: number,
  durationSeconds: number,
): number | null {
  if (distanceMiles <= 0 || durationSeconds <= 0) {
    return null;
  }

  return durationSeconds / distanceMiles;
}

export function formatPace(secondsPerMile: number | null): string {
  if (secondsPerMile === null || !Number.isFinite(secondsPerMile)) {
    return "unknown";
  }

  const roundedSeconds = Math.round(secondsPerMile);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} min/mi`;
}

export function goalMarathonPaceFromFinishTime(finishTime: string): number {
  const parts = finishTime.split(":").map(Number);

  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error("Finish time must be HH:MM or HH:MM:SS.");
  }

  if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error("Finish time contains invalid values.");
  }

  const [hours, minutes, seconds = 0] = parts;

  if (minutes >= 60 || seconds >= 60) {
    throw new Error("Finish time minutes and seconds must be less than 60.");
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  return totalSeconds / MARATHON_MILES;
}
