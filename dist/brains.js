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
export function initBrain(projectDir, name, profile, embed = "lexical", threshold) {
    if (!ALLOWED_PROFILES.has(profile)) {
        throw new Error(`unknown retention profile: ${profile}`);
    }
    if (!ALLOWED_EMBEDS.has(embed)) {
        throw new Error(`unknown embed choice: ${embed}`);
    }
    // Update config; DB creation is handled by Python shim in wizard.
    // We still ensure the brains directory exists for TS-only callers.
    const cfg = loadConfig(projectDir);
    cfg.brains[name] = {
        profile,
        embed,
        ...(threshold !== undefined ? { threshold } : {}),
    };
    saveConfig(projectDir, cfg);
    const dbPath = path.join(projectDir, ".positronic", "brains", name, "memory.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    return dbPath;
}
export function getBrains(projectDir) {
    return loadConfig(projectDir).brains;
}
