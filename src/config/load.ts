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
      config: JSON.parse(readFileSync(localPath, "utf8")) as AthleteConfig,
      source: "local",
    };
  }

  if (options.allowExample) {
    return {
      config: JSON.parse(
        readFileSync(join(cwd, EXAMPLE_ATHLETE_CONFIG_PATH), "utf8"),
      ) as AthleteConfig,
      source: "example",
    };
  }

  throw new Error(
    `Missing local athlete config. Copy ${EXAMPLE_ATHLETE_CONFIG_PATH} to ${LOCAL_ATHLETE_CONFIG_PATH} and edit the private copy before real generation.`,
  );
}
