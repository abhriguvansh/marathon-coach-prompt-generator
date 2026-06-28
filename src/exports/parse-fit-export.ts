import type {
  ActivityLap,
  ExportParseWarning,
  ExportSource,
  ManualActivity,
} from "../types";
import { metersToMiles } from "../utils/units";
import { buildExportActivity, formatPace, warning } from "./parse-helpers";

interface FitFieldDefinition {
  fieldNumber: number;
  size: number;
  baseType: number;
}

interface FitDefinition {
  endian: "little" | "big";
  globalMessageNumber: number;
  fields: FitFieldDefinition[];
  developerFieldSizes: number[];
}

type FitValue = number | string | null;
type FitMessage = Record<number, FitValue>;

interface FitParsedMessage {
  globalMessageNumber: number;
  fields: FitMessage;
}

interface FitActivitySummary {
  startDate: string | null;
  startTime: string | null;
  activityType: string | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  elevationFt: number | null;
  elevationGainFt: number | null;
  elevationLossFt: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  calories: number | null;
  elapsedTimeSeconds: number | null;
  movingTimeSeconds: number | null;
  stoppedTimeSeconds: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  bestPaceMinPerMile: string | null;
  trainingEffect: number | null;
  temperatureC: number | null;
  device: string | null;
  laps: ActivityLap[];
  dataQualityNotes: string[];
  notes: string | null;
}

const FIT_MAGIC = ".FIT";
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const METERS_PER_MILE = 1609.344;
const GLOBAL_SESSION = 18;
const GLOBAL_LAP = 19;
const GLOBAL_DEVICE_INFO = 23;
const GLOBAL_ACTIVITY = 34;

const BASE_TYPE_SIZE = new Map<number, number>([
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 2],
  [4, 2],
  [5, 4],
  [6, 4],
  [7, 1],
  [8, 4],
  [9, 8],
  [10, 1],
  [11, 2],
  [12, 4],
  [13, 1],
  [14, 8],
  [15, 8],
  [16, 8],
]);

export function parseFitExport(
  content: Buffer,
  source: ExportSource,
): { activities: ManualActivity[]; warnings: ExportParseWarning[] } {
  try {
    const messages = parseFitMessages(content);
    const summaries = summarizeFitMessages(messages);
    const fitSource = fitExportSource(source);
    const activities = summaries
      .map((summary) =>
        buildExportActivity({
          source: fitSource,
          activityType: summary.activityType,
          startDate: summary.startDate,
          startTime: summary.startTime,
          distanceMiles: summary.distanceMiles,
          durationMinutes: summary.durationMinutes,
          elevationFt: summary.elevationFt,
          elevationGainFt: summary.elevationGainFt,
          elevationLossFt: summary.elevationLossFt,
          avgHr: summary.avgHr,
          maxHr: summary.maxHr,
          avgCadence: summary.avgCadence,
          maxCadence: summary.maxCadence,
          calories: summary.calories,
          elapsedTimeSeconds: summary.elapsedTimeSeconds,
          movingTimeSeconds: summary.movingTimeSeconds,
          stoppedTimeSeconds: summary.stoppedTimeSeconds,
          avgSpeed: summary.avgSpeed,
          maxSpeed: summary.maxSpeed,
          bestPaceMinPerMile: summary.bestPaceMinPerMile,
          trainingEffect: summary.trainingEffect,
          temperatureC: summary.temperatureC,
          device: summary.device,
          laps: summary.laps,
          dataQualityNotes: summary.dataQualityNotes,
          notes: summary.notes,
        }),
      )
      .filter((activity): activity is ManualActivity => activity !== null);
    const warnings: ExportParseWarning[] = [];

    if (activities.length === 0) {
      warnings.push(
        warning(
          fitSource,
          "FIT export parsed but no session or lap summary activity was found.",
          ".fit",
        ),
      );
    }

    return { activities, warnings };
  } catch {
    return {
      activities: [],
      warnings: [
        warning(
          fitExportSource(source),
          "FIT file could not be parsed. Skipping file.",
          ".fit",
        ),
      ],
    };
  }
}

function parseFitMessages(content: Buffer): FitParsedMessage[] {
  const headerSize = content.readUInt8(0);

  if (headerSize !== 12 && headerSize !== 14) {
    throw new Error("Invalid FIT header size.");
  }

  if (content.length < headerSize + 2) {
    throw new Error("FIT file is too small.");
  }

  if (content.subarray(8, 12).toString("ascii") !== FIT_MAGIC) {
    throw new Error("Missing FIT magic.");
  }

  const dataSize = content.readUInt32LE(4);
  const dataStart = headerSize;
  const dataEnd = dataStart + dataSize;

  if (dataEnd > content.length) {
    throw new Error("FIT data size exceeds file length.");
  }

  const definitions = new Map<number, FitDefinition>();
  const messages: FitParsedMessage[] = [];
  let offset = dataStart;

  while (offset < dataEnd) {
    const recordHeader = content.readUInt8(offset);
    offset += 1;

    if ((recordHeader & 0x80) !== 0) {
      const localMessageType = (recordHeader >> 5) & 0x03;
      const definition = definitions.get(localMessageType);

      if (!definition) {
        throw new Error(
          "FIT compressed data message appeared before definition.",
        );
      }

      const parsed = parseDataMessage(content, offset, definition);
      messages.push({
        globalMessageNumber: definition.globalMessageNumber,
        fields: parsed.fields,
      });
      offset = parsed.nextOffset;
      continue;
    }

    const localMessageType = recordHeader & 0x0f;
    const hasDeveloperFields = (recordHeader & 0x20) !== 0;
    const isDefinition = (recordHeader & 0x40) !== 0;

    if (isDefinition) {
      const parsed = parseDefinitionMessage(
        content,
        offset,
        hasDeveloperFields,
      );
      definitions.set(localMessageType, parsed.definition);
      offset = parsed.nextOffset;
      continue;
    }

    const definition = definitions.get(localMessageType);

    if (!definition) {
      throw new Error("FIT data message appeared before definition.");
    }

    const parsed = parseDataMessage(content, offset, definition);
    messages.push({
      globalMessageNumber: definition.globalMessageNumber,
      fields: parsed.fields,
    });
    offset = parsed.nextOffset;
  }

  return messages;
}

function parseDefinitionMessage(
  content: Buffer,
  offset: number,
  hasDeveloperFields: boolean,
): { definition: FitDefinition; nextOffset: number } {
  offset += 1; // reserved
  const architecture = content.readUInt8(offset);
  offset += 1;
  const endian = architecture === 1 ? "big" : "little";
  const globalMessageNumber = readUInt16(content, offset, endian);
  offset += 2;
  const fieldCount = content.readUInt8(offset);
  offset += 1;
  const fields: FitFieldDefinition[] = [];

  for (let index = 0; index < fieldCount; index += 1) {
    fields.push({
      fieldNumber: content.readUInt8(offset),
      size: content.readUInt8(offset + 1),
      baseType: content.readUInt8(offset + 2),
    });
    offset += 3;
  }

  const developerFieldSizes: number[] = [];

  if (hasDeveloperFields) {
    const developerFieldCount = content.readUInt8(offset);
    offset += 1;

    for (let index = 0; index < developerFieldCount; index += 1) {
      offset += 1; // developer field number
      developerFieldSizes.push(content.readUInt8(offset));
      offset += 1;
      offset += 1; // developer data index
    }
  }

  return {
    definition: {
      endian,
      globalMessageNumber,
      fields,
      developerFieldSizes,
    },
    nextOffset: offset,
  };
}

function parseDataMessage(
  content: Buffer,
  offset: number,
  definition: FitDefinition,
): { fields: FitMessage; nextOffset: number } {
  const fields: FitMessage = {};

  for (const field of definition.fields) {
    fields[field.fieldNumber] = readFieldValue(
      content.subarray(offset, offset + field.size),
      field,
      definition.endian,
    );
    offset += field.size;
  }

  for (const size of definition.developerFieldSizes) {
    offset += size;
  }

  return { fields, nextOffset: offset };
}

function readFieldValue(
  data: Buffer,
  field: FitFieldDefinition,
  endian: "little" | "big",
): FitValue {
  const baseType = field.baseType & 0x1f;
  const baseSize = BASE_TYPE_SIZE.get(baseType);

  if (!baseSize || data.length < baseSize || isInvalid(data)) {
    return null;
  }

  switch (baseType) {
    case 0:
    case 2:
    case 10:
    case 13:
      return data.readUInt8(0);
    case 1:
      return data.readInt8(0);
    case 3:
      return readInt16(data, 0, endian);
    case 4:
    case 11:
      return readUInt16(data, 0, endian);
    case 5:
      return readInt32(data, 0, endian);
    case 6:
    case 12:
      return readUInt32(data, 0, endian);
    case 7:
      return data.toString("utf8").replace(/\0+$/, "").trim() || null;
    case 8:
      return endian === "little" ? data.readFloatLE(0) : data.readFloatBE(0);
    case 9:
      return endian === "little" ? data.readDoubleLE(0) : data.readDoubleBE(0);
    default:
      return null;
  }
}

function summarizeFitMessages(
  messages: FitParsedMessage[],
): FitActivitySummary[] {
  const sessionMessages = messages.filter(
    (message) => message.globalMessageNumber === GLOBAL_SESSION,
  );
  const lapSummaries = messages
    .filter((message) => message.globalMessageNumber === GLOBAL_LAP)
    .map((message, index) => lapFromMessage(message, index + 1))
    .filter((lap): lap is ActivityLap => lap !== null);
  const summaryMessages =
    sessionMessages.length > 0
      ? sessionMessages
      : messages.filter(
          (message) => message.globalMessageNumber === GLOBAL_LAP,
        );

  if (summaryMessages.length === 0) {
    return [];
  }

  return summaryMessages
    .map((message) =>
      summaryFromMessage(
        message,
        messages,
        sessionMessages.length > 0 ? lapSummaries : [],
      ),
    )
    .filter((summary): summary is FitActivitySummary => summary !== null);
}

function summaryFromMessage(
  message: FitParsedMessage,
  messages: FitParsedMessage[],
  laps: ActivityLap[],
): FitActivitySummary | null {
  const startDateTime =
    fitTimestamp(valueNumber(message.fields[2])) ??
    fitTimestamp(valueNumber(message.fields[253]));

  if (!startDateTime) {
    return null;
  }

  const activityType = mapFitSport(
    valueNumber(message.fields[5]) ?? activitySport(messages),
    valueNumber(message.fields[6]),
  );
  const distanceMeters = scaledNumber(message.fields[9], 100);
  const elapsedTimeSeconds = scaledNumber(message.fields[7], 1000);
  const movingTimeSeconds = scaledNumber(message.fields[8], 1000);
  const durationSeconds =
    elapsedTimeSeconds ??
    movingTimeSeconds ??
    scaledNumber(message.fields[0], 1000);
  const ascentMeters = valueNumber(message.fields[21]);
  const descentMeters = valueNumber(message.fields[22]);
  const avgHr =
    valueNumber(message.fields[16]) ??
    valueNumber(message.fields[15]) ??
    valueNumber(message.fields[6]);
  const maxHr =
    valueNumber(message.fields[17]) ?? valueNumber(message.fields[16]);
  const avgCadence =
    valueNumber(message.fields[18]) ?? valueNumber(message.fields[17]);
  const maxCadence = valueNumber(message.fields[19]);
  const calories = valueNumber(message.fields[11]);
  const avgSpeedMetersPerSecond = scaledNumber(message.fields[14], 1000);
  const maxSpeedMetersPerSecond = scaledNumber(message.fields[15], 1000);
  const stoppedTimeSeconds =
    elapsedTimeSeconds !== null &&
    movingTimeSeconds !== null &&
    elapsedTimeSeconds > movingTimeSeconds
      ? elapsedTimeSeconds - movingTimeSeconds
      : null;
  const trainingEffect = trainingEffectValue(message.fields[24]);
  const temperatureC = valueNumber(message.fields[20]);

  return {
    startDate: startDateTime.slice(0, 10),
    startTime: startDateTime.slice(11, 19),
    activityType,
    distanceMiles:
      distanceMeters === null ? null : metersToMiles(distanceMeters),
    durationMinutes: durationSeconds === null ? null : durationSeconds / 60,
    elevationFt: ascentMeters === null ? null : ascentMeters * 3.28084,
    elevationGainFt: ascentMeters === null ? null : ascentMeters * 3.28084,
    elevationLossFt: descentMeters === null ? null : descentMeters * 3.28084,
    avgHr,
    maxHr,
    avgCadence,
    maxCadence,
    calories,
    elapsedTimeSeconds,
    movingTimeSeconds,
    stoppedTimeSeconds,
    avgSpeed:
      avgSpeedMetersPerSecond === null
        ? null
        : metersPerSecondToMilesPerHour(avgSpeedMetersPerSecond),
    maxSpeed:
      maxSpeedMetersPerSecond === null
        ? null
        : metersPerSecondToMilesPerHour(maxSpeedMetersPerSecond),
    bestPaceMinPerMile: paceFromSpeed(maxSpeedMetersPerSecond),
    trainingEffect,
    temperatureC,
    device: deviceName(messages),
    laps,
    dataQualityNotes: [
      ...(laps.length > 0 ? [`${laps.length} FIT lap summaries parsed.`] : []),
      ...(stoppedTimeSeconds !== null && stoppedTimeSeconds > 0
        ? [
            "Elapsed time is longer than moving time; stopped/paused time estimated from FIT summary fields.",
          ]
        : []),
    ],
    notes: "Parsed from local FIT export; route details omitted.",
  };
}

function lapFromMessage(
  message: FitParsedMessage,
  lapNumber: number,
): ActivityLap | null {
  const distanceMeters = scaledNumber(message.fields[9], 100);
  const elapsedTimeSeconds = scaledNumber(message.fields[7], 1000);
  const movingTimeSeconds = scaledNumber(message.fields[8], 1000);
  const durationSeconds =
    movingTimeSeconds ??
    elapsedTimeSeconds ??
    scaledNumber(message.fields[0], 1000);
  const distanceMiles =
    distanceMeters === null ? null : metersToMiles(distanceMeters);

  if (distanceMiles === null && durationSeconds === null) {
    return null;
  }

  return {
    lapNumber,
    distanceMiles,
    durationSeconds,
    paceMinPerMile: formatPace(
      distanceMiles,
      durationSeconds === null ? null : durationSeconds / 60,
    ),
    avgHr: valueNumber(message.fields[16]),
    maxHr: valueNumber(message.fields[17]),
    elevationGainFt:
      valueNumber(message.fields[21]) === null
        ? null
        : (valueNumber(message.fields[21]) ?? 0) * 3.28084,
    avgCadence: valueNumber(message.fields[18]),
  };
}

function activitySport(messages: FitParsedMessage[]): number | null {
  const activity = messages.find(
    (message) => message.globalMessageNumber === GLOBAL_ACTIVITY,
  );

  return activity ? valueNumber(activity.fields[4]) : null;
}

function deviceName(messages: FitParsedMessage[]): string | null {
  const device = messages.find(
    (message) => message.globalMessageNumber === GLOBAL_DEVICE_INFO,
  );

  if (!device) {
    return null;
  }

  const productName =
    valueString(device.fields[27]) ??
    productLabel(
      valueNumber(device.fields[2]),
      valueNumber(device.fields[10]) ?? valueNumber(device.fields[4]),
    );
  const manufacturer = manufacturerName(valueNumber(device.fields[2]));

  return (
    [manufacturer, productName]
      .filter((value): value is string => value !== null)
      .join(" ")
      .trim() || null
  );
}

function mapFitSport(
  sport: number | null,
  subSport: number | null,
): string | null {
  if (subSport === 13 || subSport === 20) {
    return "weights";
  }

  switch (sport) {
    case 1:
      return "run";
    case 2:
      return "bike";
    case 5:
      return "swim";
    case 11:
      return "walk";
    case 17:
      return "hike";
    case 10:
      return "weights";
    case null:
      return null;
    default:
      return "other";
  }
}

function fitTimestamp(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(FIT_EPOCH_MS + value * 1000).toISOString();
}

function trainingEffectValue(value: FitValue): number | null {
  const number = valueNumber(value);

  if (number === null) {
    return null;
  }

  return number > 10 ? number / 10 : number;
}

function metersPerSecondToMilesPerHour(value: number): number {
  return (value * 3600) / METERS_PER_MILE;
}

function paceFromSpeed(speedMetersPerSecond: number | null): string | null {
  if (speedMetersPerSecond === null || speedMetersPerSecond <= 0) {
    return null;
  }

  const secondsPerMile = METERS_PER_MILE / speedMetersPerSecond;
  const minutes = secondsPerMile / 60;

  return formatPace(1, minutes);
}

function scaledNumber(value: FitValue, scale: number): number | null {
  const number = valueNumber(value);

  return number === null ? null : number / scale;
}

function valueString(value: FitValue): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function manufacturerName(value: number | null): string | null {
  switch (value) {
    case 1:
      return "Garmin";
    case 15:
      return "Dynastream";
    case 32:
      return "Wahoo";
    case 38:
      return "Suunto";
    default:
      return value === null ? null : `Manufacturer ${value}`;
  }
}

function productLabel(
  manufacturer: number | null,
  product: number | null,
): string | null {
  if (product === null) {
    return null;
  }

  if (manufacturer === 1) {
    return `Garmin product ${product}`;
  }

  return `product ${product}`;
}

function valueNumber(value: FitValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isInvalid(data: Buffer): boolean {
  return [...data].every((byte) => byte === 0xff);
}

function readUInt16(
  data: Buffer,
  offset: number,
  endian: "little" | "big",
): number {
  return endian === "little"
    ? data.readUInt16LE(offset)
    : data.readUInt16BE(offset);
}

function readInt16(
  data: Buffer,
  offset: number,
  endian: "little" | "big",
): number {
  return endian === "little"
    ? data.readInt16LE(offset)
    : data.readInt16BE(offset);
}

function readUInt32(
  data: Buffer,
  offset: number,
  endian: "little" | "big",
): number {
  return endian === "little"
    ? data.readUInt32LE(offset)
    : data.readUInt32BE(offset);
}

function readInt32(
  data: Buffer,
  offset: number,
  endian: "little" | "big",
): number {
  return endian === "little"
    ? data.readInt32LE(offset)
    : data.readInt32BE(offset);
}

function fitExportSource(source: ExportSource): ExportSource {
  if (source === "garmin_fit_export" || source === "strava_fit_export") {
    return source;
  }

  return source === "garmin_export" ? "garmin_fit_export" : "strava_fit_export";
}
