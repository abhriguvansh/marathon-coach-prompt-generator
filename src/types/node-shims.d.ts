declare const process: {
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
    equal(actual: unknown, expected: unknown, message?: string): void;
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
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "node:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
}
