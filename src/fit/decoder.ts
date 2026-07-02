export type FitValue = number | string | null;
export type FitMessageFields = Record<number, FitValue>;

export interface FitParsedMessage {
  globalMessageNumber: number;
  fields: FitMessageFields;
}

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

const FIT_MAGIC = ".FIT";
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

export const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);

export function parseFitMessages(content: Buffer): FitParsedMessage[] {
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

export function fitTimestamp(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(FIT_EPOCH_MS + value * 1000).toISOString();
}

export function valueNumber(value: FitValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function valueString(value: FitValue): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function parseDefinitionMessage(
  content: Buffer,
  offset: number,
  hasDeveloperFields: boolean,
): { definition: FitDefinition; nextOffset: number } {
  offset += 1;
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
      offset += 1;
      developerFieldSizes.push(content.readUInt8(offset));
      offset += 1;
      offset += 1;
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
): { fields: FitMessageFields; nextOffset: number } {
  const fields: FitMessageFields = {};

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
