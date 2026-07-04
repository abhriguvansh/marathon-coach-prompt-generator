import { parseFitMessages, type FitParsedMessage } from "../fit/decoder";

const GLOBAL_SESSION = 18;
const GLOBAL_LAP = 19;
const GLOBAL_RECORD = 20;
const GLOBAL_LENGTH = 101;
const GLOBAL_EVENT = 21;
const GLOBAL_ACTIVITY = 34;
const GLOBAL_MONITORING = 55;
const GLOBAL_HRV = 78;
const GLOBAL_MONITORING_INFO = 103;
const GLOBAL_STRESS_LEVEL = 227;
const GLOBAL_SLEEP_LEVEL = 275;
const GLOBAL_SLEEP_SUMMARY = 346;
const GLOBAL_GARMIN_SLEEP_DATA = 356;
const GLOBAL_HRV_STATUS = 370;
const GLOBAL_GARMIN_SLEEP_STAGE = 410;
const GLOBAL_DAILY_SUMMARY = 411;

const ACTIVITY_MESSAGES = new Set([
  GLOBAL_SESSION,
  GLOBAL_LAP,
  GLOBAL_RECORD,
  GLOBAL_LENGTH,
  GLOBAL_EVENT,
  GLOBAL_ACTIVITY,
]);

const WELLNESS_MESSAGES = new Set([
  GLOBAL_MONITORING,
  GLOBAL_HRV,
  GLOBAL_MONITORING_INFO,
  GLOBAL_STRESS_LEVEL,
  GLOBAL_SLEEP_LEVEL,
  GLOBAL_SLEEP_SUMMARY,
  GLOBAL_GARMIN_SLEEP_DATA,
  GLOBAL_HRV_STATUS,
  GLOBAL_GARMIN_SLEEP_STAGE,
  GLOBAL_DAILY_SUMMARY,
]);

export type FitContentKind = "activity" | "wellness" | "unknown";

export function classifyFitContent(content: Buffer): FitContentKind {
  try {
    return classifyFitMessages(parseFitMessages(content));
  } catch {
    return "unknown";
  }
}

export function classifyFitMessages(
  messages: FitParsedMessage[],
): FitContentKind {
  const messageNumbers = new Set(
    messages.map((message) => message.globalMessageNumber),
  );
  const hasSession = messageNumbers.has(GLOBAL_SESSION);
  const hasActivitySummary = hasSession || messageNumbers.has(GLOBAL_ACTIVITY);
  const hasActivityTrace =
    messageNumbers.has(GLOBAL_RECORD) || messageNumbers.has(GLOBAL_LAP);
  const hasActivity = hasSession || (hasActivitySummary && hasActivityTrace);
  const hasWellness = [...messageNumbers].some((message) =>
    WELLNESS_MESSAGES.has(message),
  );

  if (hasActivity) {
    return "activity";
  }

  if (
    hasWellness &&
    ![...messageNumbers].some((message) => ACTIVITY_MESSAGES.has(message))
  ) {
    return "wellness";
  }

  return "unknown";
}
