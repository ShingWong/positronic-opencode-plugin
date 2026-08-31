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
import { loadConfig } from "../config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function resolveEngramSrc() {
    const candidates = [
        path.resolve(__dirname, "..", "..", "..", "positronic-engram", "engine", "src"),
        path.resolve(__dirname, "..", "..", "positronic-engram", "engine", "src"),
        "/usr/local/devel/positronic/positronic-engram/engine/src",
        path.join(os.homedir(), ".local", "share", "positronic", "positronic-engram", "engine", "src"),
    ];
    return candidates.find((p) => fs.existsSync(path.join(p, "memeng", "engine.py"))) || candidates[0];
}
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    const cfg = (() => { try {
        return loadConfig(dir);
    }
    catch {
        return { brains: {}, live: false };
    } })();
    const brain = opts.brain || Object.keys(cfg.brains || {})[0];
    if (!brain) {
        return { json: { ok: false, _note: "(no .positronic/brains — run /positronic:init to create one)" }, human: "(no .positronic/brains — run /positronic:init to create one)" };
    }
    const db = path.join(dir, ".positronic", "brains", brain, "memory.db");
    if (!fs.existsSync(db)) {
        return { json: { ok: false, _note: `(no db at ${db})` }, human: `(no db at ${db})` };
    }
    const text = (opts.text || "").trim();
    if (!text) {
        return { json: { ok: false, _note: "(empty summary — nothing to consolidate)" }, human: "(empty summary — nothing to consolidate)" };
    }
    const arousal = opts.arousal ?? 0.4;
    const eng = resolveEngramSrc();
    const PY = `import sys, json; sys.path.insert(0, ${JSON.stringify(eng)}); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; from memeng.models import Event; from datetime import datetime, timezone; s=SQLiteStore(${JSON.stringify(db)}); e=MemoryEngine(s); r=e.new_event(Event(stream='positronic:${brain}', kind='consolidation', persons=['p_kairos'], wall=datetime.now(timezone.utc), features={'subject_norm': ${JSON.stringify(text.slice(0, 80))}, 'body_text': ${JSON.stringify(text)}, 'arousal': ${arousal}})); print(json.dumps({'tau': r.tau, 'encoded': r.verdict.encoded, 'episode_id': str(r.episode_id)}))`;
    const out = spawnSync("python3", ["-c", PY], { encoding: "utf-8", timeout: 30000 });
    let rep = {};
    if (out.status === 0 && out.stdout) {
        try {
            rep = JSON.parse(out.stdout.trim());
        }
        catch {
            rep = { _err: out.stdout.trim().slice(0, 200) };
        }
    }
    else {
        rep = { _err: (out.stderr || out.stdout || "consolidate failed").trim().slice(0, 300) };
    }
    const json = { ok: out.status === 0, brain, text: text.slice(0, 80), ...rep };
    const human = out.status === 0
        ? `${brain} — consolidated at τ=${rep.tau}${rep.encoded === false ? " (below gate; encoded=false)" : ""}`
        : `${brain} — consolidate failed: ${json._err}`;
    return { json, human };
}
