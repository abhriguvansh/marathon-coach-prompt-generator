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
  netElevationChangeFt: number | null;
  elevationSource: ManualActivity["elevationSource"];
  elevationDataQuality: string | null;
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
const SPLIT_DISTANCE_TOLERANCE_MILES = 0.005;
const ELEVATION_NOISE_THRESHOLD_FT = 5;
const GLOBAL_SESSION = 18;
const GLOBAL_LAP = 19;
const GLOBAL_RECORD = 20;
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
          netElevationChangeFt: summary.netElevationChangeFt,
          elevationSource: summary.elevationSource,
          elevationDataQuality: summary.elevationDataQuality,
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
      summaryFromMessage(message, messages, sessionMessages.length > 0),
    )
    .filter((summary): summary is FitActivitySummary => summary !== null);
}

function summaryFromMessage(
  message: FitParsedMessage,
  messages: FitParsedMessage[],
  canUseLaps: boolean,
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
  const distanceMiles =
    distanceMeters === null ? null : metersToMiles(distanceMeters);
  const durationMinutes =
    durationSeconds === null ? null : durationSeconds / 60;
  const elevation = elevationSummary(messages, ascentMeters, descentMeters);
  const fitLaps = canUseLaps
    ? validFitLaps(messages, distanceMiles, durationSeconds)
    : [];
  const laps =
    fitLaps.length > 0
      ? fitLaps
      : derivedMileSplits(messages, distanceMiles, durationSeconds);

  return {
    startDate: startDateTime.slice(0, 10),
    startTime: startDateTime.slice(11, 19),
    activityType,
    distanceMiles,
    durationMinutes,
    elevationFt: elevation.gainFt,
    elevationGainFt: elevation.gainFt,
    elevationLossFt: elevation.lossFt,
    netElevationChangeFt: elevation.netChangeFt,
    elevationSource: elevation.source,
    elevationDataQuality: elevation.dataQuality,
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
      ...(laps.length > 0
        ? [`${laps.length} privacy-safe split summaries parsed.`]
        : []),
      ...(stoppedTimeSeconds !== null && stoppedTimeSeconds > 0
        ? [
            "Elapsed time is longer than moving time; stopped/paused time estimated from FIT summary fields.",
          ]
        : []),
      ...(elevation.dataQuality === null ? [] : [elevation.dataQuality]),
    ],
    notes: "Parsed from local FIT export; route details omitted.",
  };
}

function validFitLaps(
  messages: FitParsedMessage[],
  activityDistanceMiles: number | null,
  activityDurationSeconds: number | null,
): ActivityLap[] {
  const laps = messages
    .filter((message) => message.globalMessageNumber === GLOBAL_LAP)
    .map((message, index) => lapFromMessage(message, index + 1))
    .filter((lap): lap is ActivityLap => lap !== null)
    .filter(
      (lap) =>
        !duplicatesActivity(
          lap,
          activityDistanceMiles,
          activityDurationSeconds,
        ),
    );

  if (laps.length < 2) {
    return [];
  }

  const lapDistance = sumLapDistance(laps);
  const lapDuration = sumLapDuration(laps);

  if (
    activityDistanceMiles !== null &&
    lapDistance !== null &&
    lapDistance > activityDistanceMiles * 1.08
  ) {
    return [];
  }

  if (
    activityDurationSeconds !== null &&
    lapDuration !== null &&
    lapDuration > activityDurationSeconds * 1.08
  ) {
    return [];
  }

  return laps;
}

interface FitElevationSummary {
  gainFt: number | null;
  lossFt: number | null;
  netChangeFt: number | null;
  source: ManualActivity["elevationSource"];
  dataQuality: string | null;
}

function elevationSummary(
  messages: FitParsedMessage[],
  sessionAscentMeters: number | null,
  sessionDescentMeters: number | null,
): FitElevationSummary {
  const sessionGainFt = metersToFeetOrNull(sessionAscentMeters);
  const sessionLossFt = metersToFeetOrNull(sessionDescentMeters);
  const lapTotals = lapElevationTotals(messages);
  const recordTotals = recordElevationTotals(messages);
  const gainFt = firstSaneElevation([
    sessionGainFt,
    lapTotals.gainFt,
    recordTotals.gainFt,
  ]);
  const lossFt = firstSaneElevation([
    sessionLossFt,
    lapTotals.lossFt,
    recordTotals.lossFt,
  ]);
  const source = elevationSource({
    gainFt,
    lossFt,
    sessionGainFt,
    sessionLossFt,
    lapTotals,
    recordTotals,
  });
  const netChangeFt =
    recordTotals.netChangeFt !== null ? recordTotals.netChangeFt : null;
  const dataQuality =
    source === "record-derived"
      ? "Elevation derived from altitude records and may differ from Strava/Garmin corrected elevation."
      : gainFt === null && lossFt !== null
        ? "Elevation gain unavailable; elevation loss only."
        : null;

  return {
    gainFt,
    lossFt,
    netChangeFt,
    source,
    dataQuality,
  };
}

function lapElevationTotals(messages: FitParsedMessage[]): {
  gainFt: number | null;
  lossFt: number | null;
} {
  const laps = messages.filter(
    (message) => message.globalMessageNumber === GLOBAL_LAP,
  );
  const gainMeters = sumNullableNumbers(
    laps.map((message) => valueNumber(message.fields[21])),
  );
  const lossMeters = sumNullableNumbers(
    laps.map((message) => valueNumber(message.fields[22])),
  );

  return {
    gainFt: metersToFeetOrNull(gainMeters),
    lossFt: metersToFeetOrNull(lossMeters),
  };
}

function recordElevationTotals(messages: FitParsedMessage[]): {
  gainFt: number | null;
  lossFt: number | null;
  netChangeFt: number | null;
} {
  const altitudes = messages
    .filter((message) => message.globalMessageNumber === GLOBAL_RECORD)
    .map((message) => recordPoint(message).altitudeFt)
    .filter((value): value is number => value !== null);

  if (altitudes.length < 2) {
    return { gainFt: null, lossFt: null, netChangeFt: null };
  }

  let gainFt = 0;
  let lossFt = 0;

  for (let index = 1; index < altitudes.length; index += 1) {
    const change = altitudes[index] - altitudes[index - 1];

    if (Math.abs(change) < ELEVATION_NOISE_THRESHOLD_FT) {
      continue;
    }

    if (change > 0) {
      gainFt += change;
    } else {
      lossFt += Math.abs(change);
    }
  }

  return {
    gainFt: gainFt > 0 ? gainFt : null,
    lossFt: lossFt > 0 ? lossFt : null,
    netChangeFt: altitudes[altitudes.length - 1] - altitudes[0],
  };
}

function elevationSource(input: {
  gainFt: number | null;
  lossFt: number | null;
  sessionGainFt: number | null;
  sessionLossFt: number | null;
  lapTotals: { gainFt: number | null; lossFt: number | null };
  recordTotals: {
    gainFt: number | null;
    lossFt: number | null;
    netChangeFt: number | null;
  };
}): ManualActivity["elevationSource"] {
  if (input.gainFt === null && input.lossFt === null) {
    return "unknown";
  }

  if (
    input.gainFt === input.sessionGainFt ||
    input.lossFt === input.sessionLossFt
  ) {
    return "session";
  }

  if (
    input.gainFt === input.lapTotals.gainFt ||
    input.lossFt === input.lapTotals.lossFt
  ) {
    return "lap";
  }

  if (
    input.gainFt === input.recordTotals.gainFt ||
    input.lossFt === input.recordTotals.lossFt
  ) {
    return "record-derived";
  }

  return "unknown";
}

function firstSaneElevation(values: Array<number | null>): number | null {
  return (
    values.find(
      (value): value is number =>
        value !== null && value >= 0 && value < 100000,
    ) ?? null
  );
}

function metersToFeetOrNull(value: number | null): number | null {
  return value === null ? null : value * 3.28084;
}

function sumNullableNumbers(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);

  return present.length === 0
    ? null
    : present.reduce((total, value) => total + value, 0);
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
    label: null,
    kind: "fit_lap",
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

interface FitRecordPoint {
  timestampSeconds: number | null;
  distanceMiles: number | null;
  heartRate: number | null;
  cadence: number | null;
  altitudeFt: number | null;
}

function derivedMileSplits(
  messages: FitParsedMessage[],
  activityDistanceMiles: number | null,
  activityDurationSeconds: number | null,
): ActivityLap[] {
  const records = messages
    .filter((message) => message.globalMessageNumber === GLOBAL_RECORD)
    .map(recordPoint)
    .filter(
      (record): record is FitRecordPoint =>
        record.timestampSeconds !== null && record.distanceMiles !== null,
    )
    .sort(
      (left, right) =>
        (left.timestampSeconds ?? 0) - (right.timestampSeconds ?? 0),
    );

  if (records.length < 2 || activityDistanceMiles === null) {
    return [];
  }

  const splits: ActivityLap[] = [];
  let splitStart = records[0];
  let nextMile = 1;

  for (const record of records.slice(1)) {
    while (
      record.distanceMiles !== null &&
      record.distanceMiles >= nextMile - SPLIT_DISTANCE_TOLERANCE_MILES &&
      nextMile < Math.floor(activityDistanceMiles) + 1
    ) {
      const boundary = interpolateRecord(splitStart, record, nextMile);
      const split = splitFromRecords(
        splitStart,
        boundary,
        splits.length + 1,
        `Mile ${nextMile}`,
      );

      if (split) {
        splits.push(split);
      }

      splitStart = boundary;
      nextMile += 1;
    }
  }

  const last = records[records.length - 1];
  const finalDistance =
    last.distanceMiles === null || splitStart.distanceMiles === null
      ? null
      : last.distanceMiles - splitStart.distanceMiles;

  if (finalDistance !== null && finalDistance >= 0.08) {
    const finalSplit = splitFromRecords(
      splitStart,
      last,
      splits.length + 1,
      `Final ${formatSplitDistance(finalDistance)}`,
    );

    if (
      finalSplit &&
      !duplicatesActivity(
        finalSplit,
        activityDistanceMiles,
        activityDurationSeconds,
      )
    ) {
      splits.push(finalSplit);
    }
  }

  return splits.length >= 2 ? splits : [];
}

function recordPoint(message: FitParsedMessage): FitRecordPoint {
  const altitudeMeters =
    scaledNumber(message.fields[78], 5) ?? scaledNumber(message.fields[2], 5);

  return {
    timestampSeconds: valueNumber(message.fields[253]),
    distanceMiles:
      scaledNumber(message.fields[5], 100) === null
        ? null
        : metersToMiles(scaledNumber(message.fields[5], 100) ?? 0),
    heartRate: valueNumber(message.fields[3]),
    cadence: valueNumber(message.fields[4]),
    altitudeFt:
      altitudeMeters === null ? null : (altitudeMeters - 500) * 3.28084,
  };
}

function interpolateRecord(
  start: FitRecordPoint,
  end: FitRecordPoint,
  targetDistanceMiles: number,
): FitRecordPoint {
  const startDistance = start.distanceMiles ?? targetDistanceMiles;
  const endDistance = end.distanceMiles ?? targetDistanceMiles;
  const fraction =
    endDistance === startDistance
      ? 1
      : (targetDistanceMiles - startDistance) / (endDistance - startDistance);

  return {
    timestampSeconds: interpolateNumber(
      start.timestampSeconds,
      end.timestampSeconds,
      fraction,
    ),
    distanceMiles: targetDistanceMiles,
    heartRate: interpolateNumber(start.heartRate, end.heartRate, fraction),
    cadence: interpolateNumber(start.cadence, end.cadence, fraction),
    altitudeFt: interpolateNumber(start.altitudeFt, end.altitudeFt, fraction),
  };
}

function splitFromRecords(
  start: FitRecordPoint,
  end: FitRecordPoint,
  lapNumber: number,
  label: string,
): ActivityLap | null {
  if (
    start.timestampSeconds === null ||
    end.timestampSeconds === null ||
    start.distanceMiles === null ||
    end.distanceMiles === null
  ) {
    return null;
  }

  const distanceMiles = end.distanceMiles - start.distanceMiles;
  const durationSeconds = end.timestampSeconds - start.timestampSeconds;

  if (distanceMiles <= 0 || durationSeconds <= 0) {
    return null;
  }

  const hrValues = [start.heartRate, end.heartRate].filter(
    (value): value is number => value !== null,
  );
  const cadenceValues = [start.cadence, end.cadence].filter(
    (value): value is number => value !== null,
  );
  const elevationGainFt =
    start.altitudeFt === null || end.altitudeFt === null
      ? null
      : Math.max(0, end.altitudeFt - start.altitudeFt);

  return {
    lapNumber,
    label,
    kind: "derived_mile_split",
    distanceMiles,
    durationSeconds,
    paceMinPerMile: formatPace(distanceMiles, durationSeconds / 60),
    avgHr: hrValues.length === 0 ? null : Math.round(averageNumber(hrValues)),
    maxHr: hrValues.length === 0 ? null : Math.round(Math.max(...hrValues)),
    elevationGainFt,
    avgCadence:
      cadenceValues.length === 0
        ? null
        : Math.round(averageNumber(cadenceValues)),
  };
}

function duplicatesActivity(
  lap: ActivityLap,
  activityDistanceMiles: number | null,
  activityDurationSeconds: number | null,
): boolean {
  const distanceDuplicate =
    lap.distanceMiles !== null &&
    activityDistanceMiles !== null &&
    Math.abs(lap.distanceMiles - activityDistanceMiles) <=
      Math.max(0.03, activityDistanceMiles * 0.02);
  const durationDuplicate =
    lap.durationSeconds !== null &&
    activityDurationSeconds !== null &&
    Math.abs(lap.durationSeconds - activityDurationSeconds) <=
      Math.max(60, activityDurationSeconds * 0.02);

  return distanceDuplicate && durationDuplicate;
}

function sumLapDistance(laps: ActivityLap[]): number | null {
  const distances = laps
    .map((lap) => lap.distanceMiles)
    .filter((value): value is number => value !== null);

  return distances.length === 0
    ? null
    : distances.reduce((total, value) => total + value, 0);
}

function sumLapDuration(laps: ActivityLap[]): number | null {
  const durations = laps
    .map((lap) => lap.durationSeconds)
    .filter((value): value is number => value !== null);

  return durations.length === 0
    ? null
    : durations.reduce((total, value) => total + value, 0);
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

  if (!productName) {
    return null;
  }

  if (!manufacturer) {
    return productName;
  }

  return `${manufacturer} ${productName}`;
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

function interpolateNumber(
  start: number | null,
  end: number | null,
  fraction: number,
): number | null {
  if (start === null || end === null) {
    return null;
  }

  return start + (end - start) * Math.max(0, Math.min(1, fraction));
}

function averageNumber(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatSplitDistance(distanceMiles: number): string {
  return `${Number(distanceMiles.toFixed(2))} mi`;
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
      return null;
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
    return null;
  }

  return null;
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
