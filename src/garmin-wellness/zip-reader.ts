import { inflateRawSync } from "node:zlib";

export interface ZipFitEntry {
  name: string;
  content: Buffer;
}

export interface ZipReadResult {
  fitEntries: ZipFitEntry[];
  ignoredEntries: number;
  warnings: string[];
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const MAX_ENTRIES = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export function readFitEntriesFromZip(content: Buffer): ZipReadResult {
  const eocdOffset = findEndOfCentralDirectory(content);

  if (eocdOffset === -1) {
    throw new Error("ZIP end-of-central-directory record was not found.");
  }

  const entryCount = content.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = content.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = content.readUInt32LE(eocdOffset + 16);

  if (entryCount > MAX_ENTRIES) {
    throw new Error("ZIP contains too many entries.");
  }

  if (centralDirectoryOffset + centralDirectorySize > content.length) {
    throw new Error("ZIP central directory exceeds file length.");
  }

  const fitEntries: ZipFitEntry[] = [];
  const warnings: string[] = [];
  let ignoredEntries = 0;
  let totalUncompressed = 0;
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (content.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("ZIP central directory entry is invalid.");
    }

    const flags = content.readUInt16LE(offset + 8);
    const method = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const uncompressedSize = content.readUInt32LE(offset + 24);
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const externalAttributes = content.readUInt32LE(offset + 38);
    const localHeaderOffset = content.readUInt32LE(offset + 42);
    const name = content
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;

    if (!isSafeRelativePath(name) || isSymlink(externalAttributes)) {
      throw new Error("ZIP contained an unsafe entry path.");
    }

    if (name.endsWith("/")) {
      ignoredEntries += 1;
      continue;
    }

    if (!name.toLowerCase().endsWith(".fit")) {
      ignoredEntries += 1;
      continue;
    }

    if (method !== 0 && method !== 8) {
      warnings.push(`Unsupported ZIP compression method skipped: ${method}.`);
      continue;
    }

    if (uncompressedSize > MAX_FILE_BYTES) {
      throw new Error("ZIP FIT entry exceeds the per-file size limit.");
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_BYTES) {
      throw new Error("ZIP exceeds the total uncompressed size limit.");
    }

    const encrypted = (flags & 0x0001) !== 0;
    if (encrypted) {
      warnings.push("Encrypted ZIP FIT entry skipped.");
      continue;
    }

    const compressed = readLocalFileData({
      archive: content,
      localHeaderOffset,
      compressedSize,
    });
    const inflated = method === 0 ? compressed : inflateRawSync(compressed);

    if (inflated.length !== uncompressedSize) {
      throw new Error("ZIP FIT entry size did not match central directory.");
    }

    fitEntries.push({
      name: `wellness-fit-${fitEntries.length + 1}.fit`,
      content: inflated,
    });
  }

  return { fitEntries, ignoredEntries, warnings };
}

function findEndOfCentralDirectory(content: Buffer): number {
  const start = Math.max(0, content.length - MAX_EOCD_SEARCH);

  for (let offset = content.length - 22; offset >= start; offset -= 1) {
    if (content.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function readLocalFileData(input: {
  archive: Buffer;
  localHeaderOffset: number;
  compressedSize: number;
}): Buffer {
  const { archive, localHeaderOffset, compressedSize } = input;

  if (archive.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("ZIP local file header is invalid.");
  }

  const nameLength = archive.readUInt16LE(localHeaderOffset + 26);
  const extraLength = archive.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + compressedSize;

  if (dataEnd > archive.length) {
    throw new Error("ZIP local file data exceeds file length.");
  }

  return archive.subarray(dataStart, dataEnd);
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");

  return (
    normalized !== "" &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:/.test(normalized) &&
    !normalized.split("/").some((part) => part === "..")
  );
}

function isSymlink(externalAttributes: number): boolean {
  const mode = (externalAttributes >>> 16) & 0o170000;

  return mode === 0o120000;
}
