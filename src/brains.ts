// =====================================================================
// Project Positronic — Polytemporal Cognitive Engram Memory Substrate
// Copyright (C) 2026 Shing Wong. All Rights Reserved.
// =====================================================================
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://gnu.org>.
// =====================================================================

import * as path from "node:path";
import * as fs from "node:fs";
import { loadConfig, saveConfig } from "./config.js";

const ALLOWED_PROFILES = new Set(["balanced", "archival", "long_term", "short_term"]);
const ALLOWED_EMBEDS = new Set(["lexical", "local", "remote"]);

/**
 * initBrain — TypeScript wrapper for federation init.
 * Validates retention_profile, creates .positronic/brains/{name}/memory.db
 * via Python engine bridge (spawns python), and updates config.
 * For now this is a thin validator + config updater; DB creation is
 * delegated to the Python shim `src/brains.py` when invoked via CLI.
 */
export function initBrain(
  projectDir: string,
  name: string,
  profile: string,
  embed: string = "lexical",
  threshold?: number,
): string {
  if (!ALLOWED_PROFILES.has(profile)) {
    throw new Error(`unknown retention profile: ${profile}`);
  }
  if (!ALLOWED_EMBEDS.has(embed)) {
    throw new Error(`unknown embed choice: ${embed}`);
  }
  // Update config; DB creation is handled by Python shim in wizard.
  // We still ensure the brains directory exists for TS-only callers.
  const cfg = loadConfig(projectDir);
  (cfg.brains as Record<string, unknown>)[name] = {
    profile,
    embed,
    ...(threshold !== undefined ? { threshold } : {}),
  };
  saveConfig(projectDir, cfg);
  const dbPath = path.join(projectDir, ".positronic", "brains", name, "memory.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return dbPath;
}

export function getBrains(projectDir: string): Record<string, unknown> {
  return loadConfig(projectDir).brains;
}
