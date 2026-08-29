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
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { saveConfig, loadConfig } from "./config.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PY_SHIM = path.join(__dirname, "brains.py");
function pyInitBrain(projectDir, name, profile, embed) {
    const r = spawnSync("python3", [PY_SHIM, projectDir, name, profile, embed], { encoding: "utf-8" });
    if (r.status !== 0)
        throw new Error(`brains.py failed: ${r.stderr || r.stdout}`);
}
export async function runWizard(projectDir, opts = {}) {
    const answers = opts.answers;
    if (!answers || answers.length === 0) {
        // No options → explain choices to a human (no side-effects)
        const helpHuman = `Pick how your brain remembers:

**Name** — what to call this brain (default: kairos). Use one brain per project or one per concern (e.g. mail, research).

**Profile — how long to remember (retention):**
  • balanced — forgets stale stuff after weeks (good default; E7 keeps ~35% at horizon)
  • long_term — remembers months (good for mail/archive)
  • archival — never forgets (good for legal/knowledge base; grows forever)
  • short_term — forgets in days (good for experiments/scratch)

**Embed — how to find things:**
  • lexical — fast text search, no setup (works everywhere)
  • local — semantic search on your machine (needs BGE-M3 llama.cpp :8090)
  • remote — semantic search via API key (needs remote_url + key)

**Live — ingest this chat live (default: yes):**
  • --live (default) — every session message is remembered automatically (live ingestion)
  • --no-live — don't ingest; only manual /positronic:remember or brain-test writes

Examples:
  positronic init                                    # kairos, balanced, lexical, live=yes
  positronic init --brain mail --profile long_term --embed local
  positronic init --brain research --profile archival --embed remote --force
  positronic init --no-live                          # disable live ingestion (add --live to re-enable)

Next: run with a specific --brain/--profile/--embed to create. If a brain already exists you will be warned to add --force (data will be lost).`;
        return {
            json: { ok: false, warning: helpHuman, brains: {}, created: [], existing: [], configPath: path.join(projectDir, ".positronic", "config.json") },
            human: helpHuman,
        };
    }
    const brainsDir = path.join(projectDir, ".positronic", "brains");
    const existingBrains = [];
    if (fs.existsSync(brainsDir)) {
        for (const a of answers) {
            const dbPath = path.join(brainsDir, a.name, "memory.db");
            if (fs.existsSync(dbPath))
                existingBrains.push(a.name);
        }
    }
    // If existing brain would be overwritten and no --force, return warning without writing
    if (existingBrains.length > 0 && !opts.force) {
        const cfgPath = path.join(projectDir, ".positronic", "config.json");
        const brains = {};
        for (const a of answers)
            brains[a.name] = { profile: a.profile, embed: a.embed };
        const warning = `Existing brain(s) will be OVERWRITTEN and data will be LOST: ${existingBrains.join(", ")}. Re-run with --force or confirm:true to proceed.`;
        return {
            json: { ok: false, warning, brains, created: [], existing: existingBrains, configPath: cfgPath },
            human: `WARNING: ${warning}`,
        };
    }
    const brains = {};
    for (const a of answers) {
        pyInitBrain(projectDir, a.name, a.profile, a.embed);
        brains[a.name] = { profile: a.profile, embed: a.embed };
    }
    // Merge with existing config if any, preserve other keys
    let existing = {};
    try {
        existing = loadConfig(projectDir);
    }
    catch { /* ignore parse errors, will overwrite */ }
    // Handle --no-live / --live flag if present in next call via opts
    const liveFlag = opts.live;
    const liveVal = liveFlag !== undefined ? liveFlag : (existing.live ?? true);
    const merged = {
        brains: { ...(existing.brains ?? {}), ...brains },
        live: liveVal,
        embed: existing.embed ?? { local_url: "http://127.0.0.1:8090" },
        engram_tag: existing.engram_tag ?? "v0.2.0",
    };
    saveConfig(projectDir, merged);
    if (!fs.existsSync(path.join(projectDir, ".positronic", "config.json"))) {
        saveConfig(projectDir, merged);
    }
    return {
        json: { ok: true, brains, created: Object.keys(brains), existing: existingBrains, configPath: path.join(projectDir, ".positronic", "config.json"), live: liveVal },
        human: `Created brains: ${Object.keys(brains).join(", ")} (live=${liveVal ? "yes" : "no"})`,
    };
}
export async function initRun(opts = {}) {
    const dir = opts.dir || process.cwd();
    if (!opts.brains) {
        // No options → human-friendly help (no side-effects)
        const res = await runWizard(dir, { answers: undefined, force: opts.force, live: opts.live });
        return res;
    }
    const brains = opts.brains;
    const res = await runWizard(dir, { answers: brains, force: opts.force, live: opts.live });
    return res;
}
