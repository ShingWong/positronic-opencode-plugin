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
    if (cfg.live === false) {
        return { json: { ok: true, brains: {}, _note: "live=false — pruning disabled" }, human: "(live=false — pruning disabled)" };
    }
    const name = Object.keys(cfg.brains || {})[0];
    if (!name) {
        return { json: { ok: true, brains: {}, _note: "(no .positronic/brains — run /positronic:init to create one)" }, human: "(no .positronic/brains — run /positronic:init to create one)" };
    }
    const db = path.join(dir, ".positronic", "brains", name, "memory.db");
    if (!fs.existsSync(db)) {
        return { json: { ok: true, brains: {}, _note: `(no db at ${db})` }, human: `(no db at ${db})` };
    }
    const eng = resolveEngramSrc();
    const PY = `import sys, json; sys.path.insert(0, ${JSON.stringify(eng)}); from dataclasses import asdict; from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; s=SQLiteStore(${JSON.stringify(db)}); e=MemoryEngine(s); r=e.prune(); print(json.dumps(asdict(r)))`;
    const out = spawnSync("python3", ["-c", PY], { encoding: "utf-8", timeout: 120000 });
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
        rep = { _err: (out.stderr || out.stdout || "prune failed").trim().slice(0, 300) };
    }
    const json = { ok: out.status === 0, brain: name, ...rep };
    const human = out.status === 0
        ? `${name} — pruned: ${rep.day_merged ?? 0} merged, ${rep.expired ?? 0} expired, ${rep.week_merged ?? 0} week_token, ${rep.objects_dormant ?? 0} dormant, ${rep.objects_forgotten ?? 0} forgotten (${rep.residues ?? 0} residues)`
        : `${name} — prune failed: ${json._err}`;
    return { json, human };
}
