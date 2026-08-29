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
import { embedHealth } from "./embed.js";
export async function doctor(opts = {}) {
    const checks = {};
    // engram — check that engine src exists and is importable via python
    try {
        const engPath = "/usr/local/devel/positronic/positronic-engram/engine/src/memeng/store.py";
        if (fs.existsSync(engPath)) {
            const r = spawnSync("python3", ["-c", "import sys; sys.path.insert(0,'/usr/local/devel/positronic/positronic-engram/engine/src'); import memeng.store; print('ok')"], { encoding: "utf-8" });
            checks.engram = r.status === 0 && r.stdout.includes("ok") ? "ok" : "missing";
        }
        else {
            checks.engram = "missing";
        }
    }
    catch {
        checks.engram = "missing";
    }
    // bge — check embed health
    try {
        const h = await embedHealth({ embed: { local_url: "http://127.0.0.1:8090" } });
        checks.bge = h.ok ? "ok" : "down";
        void path;
    }
    catch {
        checks.bge = "down";
    }
    // llama — check binary exists
    try {
        const r = spawnSync("which", ["llama-server"], { encoding: "utf-8" });
        if (r.status === 0)
            checks.llama = "ok";
        else {
            const r2 = spawnSync("ls", ["/home/swong/dls/.tmp/beellama-check/build-hip/bin/llama-server"], { encoding: "utf-8" });
            checks.llama = r2.status === 0 ? "ok" : "missing";
        }
    }
    catch {
        checks.llama = "missing";
    }
    checks.lexical = "ok"; // FTS5 always works
    const result = { tiers: checks };
    if (opts.json)
        return result;
    console.log(JSON.stringify(result, null, 2));
    return result;
}
