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
import { doctor } from "../doctor.js";
import * as fs from "node:fs";
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    let cfg = { brains: {}, engram_tag: "v0.2.0" };
    try {
        cfg = loadConfig(dir);
    }
    catch { }
    const doc = await doctor({ json: true }).catch(() => ({ tiers: { lexical: "ok" } }));
    const json = { version: JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url).pathname, "utf-8")).version, engram_tag: cfg.engram_tag, brains: cfg.brains, tiers: doc.tiers || doc };
    const human = `positronic v${json.version} ENGRAM_TAG=${json.engram_tag} brains:${Object.keys(json.brains).join(",") || "(none)"} tiers:${JSON.stringify(json.tiers)}`;
    return { json, human };
}
