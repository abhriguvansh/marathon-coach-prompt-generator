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

declare module "node:assert/strict" {
  const assert: {
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
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
    options: { encoding: "utf8" },
  ): string;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean },
  ): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
}
