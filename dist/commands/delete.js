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
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, saveConfig } from "../config.js";
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    const name = opts.brain;
    if (!name) {
        const cfg = (() => { try {
            return loadConfig(dir);
        }
        catch {
            return { brains: {} };
        } })();
        const brains = Object.keys(cfg.brains || {});
        const list = brains.length ? brains.join(", ") : "(none)";
        const help = `Usage: /positronic:delete --brain <name> [--force]\nBrains here: ${list}\nThis will PERMANENTLY delete the brain and all its memories. Add --force to confirm.`;
        return { json: { ok: false, warning: help, brains }, human: help };
    }
    const cfg = (() => { try {
        return loadConfig(dir);
    }
    catch {
        return { brains: {} };
    } })();
    const exists = cfg.brains && cfg.brains[name];
    const db = path.join(dir, ".positronic", "brains", name, "memory.db");
    const existsOnDisk = fs.existsSync(db) || fs.existsSync(path.join(dir, ".positronic", "brains", name));
    if (!exists && !existsOnDisk) {
        const help = `No brain named "${name}" here. Available: ${Object.keys(cfg.brains || {}).join(", ") || "(none)"}`;
        return { json: { ok: false, warning: help }, human: help };
    }
    if (!opts.force) {
        const warning = `This will PERMANENTLY delete brain "${name}" and all ${existsOnDisk ? "its" : "its config"} memories. Data will be LOST. Re-run with --force or confirm:true to proceed.`;
        return { json: { ok: false, warning, brain: name, configPath: path.join(dir, ".positronic", "config.json"), dbPath: db }, human: `WARNING: ${warning}` };
    }
    // Force: delete
    const before = JSON.parse(JSON.stringify(cfg));
    try {
        fs.rmSync(path.join(dir, ".positronic", "brains", name), { recursive: true, force: true });
    }
    catch { }
    if (cfg.brains && cfg.brains[name]) {
        delete cfg.brains[name];
        saveConfig(dir, cfg);
    }
    const after = (() => { try {
        return loadConfig(dir);
    }
    catch {
        return { brains: {} };
    } })();
    return { json: { ok: true, deleted: name, before, after, dbPath: db }, human: `Deleted brain "${name}".` };
}
