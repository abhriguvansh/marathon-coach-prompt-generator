import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AthleteConfig } from "../types";
import {
  EXAMPLE_ATHLETE_CONFIG_PATH,
  LOCAL_ATHLETE_CONFIG_PATH,
} from "./index";

export interface LoadedAthleteConfig {
  config: AthleteConfig;
  source: "local" | "example";
}

export function loadAthleteConfig(
  cwd = process.cwd(),
  options: { allowExample?: boolean } = {},
): LoadedAthleteConfig {
  const localPath = join(cwd, LOCAL_ATHLETE_CONFIG_PATH);

  if (existsSync(localPath)) {
    return {
      config: readAthleteConfig(localPath),
      source: "local",
    };
  }

  if (options.allowExample) {
    return {
      config: readAthleteConfig(join(cwd, EXAMPLE_ATHLETE_CONFIG_PATH)),
      source: "example",
    };
  }

  throw new Error(
    `Missing local athlete config. Copy ${EXAMPLE_ATHLETE_CONFIG_PATH} to ${LOCAL_ATHLETE_CONFIG_PATH} and edit the private copy before real generation.`,
  );
}

function readAthleteConfig(path: string): AthleteConfig {
  return JSON.parse(
    stripByteOrderMark(readFileSync(path, "utf8")),
  ) as AthleteConfig;
}

function stripByteOrderMark(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
