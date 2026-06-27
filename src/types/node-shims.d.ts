declare const process: {
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
};

declare const console: {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
};

declare const require: {
  main: unknown;
};

declare const module: unknown;

declare class Buffer extends Uint8Array {
  static alloc(size: number): Buffer;
  static concat(list: Uint8Array[]): Buffer;
  static from(data: string | ArrayBuffer | Uint8Array | number[]): Buffer;
  readUInt8(offset: number): number;
  readInt8(offset: number): number;
  readUInt16LE(offset: number): number;
  readUInt16BE(offset: number): number;
  readInt16LE(offset: number): number;
  readInt16BE(offset: number): number;
  readUInt32LE(offset: number): number;
  readUInt32BE(offset: number): number;
  readInt32LE(offset: number): number;
  readInt32BE(offset: number): number;
  readFloatLE(offset: number): number;
  readFloatBE(offset: number): number;
  readDoubleLE(offset: number): number;
  readDoubleBE(offset: number): number;
  writeUInt8(value: number, offset: number): number;
  writeUInt16LE(value: number, offset: number): number;
  writeUInt32LE(value: number, offset: number): number;
  subarray(start?: number, end?: number): Buffer;
  toString(encoding?: string): string;
}

declare module "node:assert/strict" {
  const assert: {
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    doesNotMatch(actual: string, expected: RegExp, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    throws(block: () => unknown, error?: RegExp, message?: string): void;
  };

  export default assert;
}

declare module "node:child_process" {
  export function execFileSync(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      encoding: "utf8";
      stdio?: "ignore" | "pipe" | "inherit";
    },
  ): string;
}

declare module "node:fs" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function existsSync(path: string): boolean;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean },
  ): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Buffer;
  export function readdirSync(
    path: string,
    options?: { withFileTypes?: false },
  ): string[];
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Dirent[];
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
}

declare module "node:path" {
  export function basename(path: string, suffix?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
}
