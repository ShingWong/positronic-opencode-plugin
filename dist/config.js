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
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
export const BrainCfg = z.object({
    profile: z.enum(["balanced", "archival", "long_term", "short_term"]),
    embed: z.enum(["lexical", "local", "remote"]),
    threshold: z.number().optional(),
});
export const PositronicCfg = z.object({
    brains: z.record(BrainCfg),
    live: z.boolean().default(true),
    embed: z
        .object({
        local_url: z.string().default("http://127.0.0.1:8090"),
        remote_url: z.string().optional(),
        remote_key: z.string().optional(),
    })
        .optional(),
    engram_tag: z.string().default("v0.2.0"),
});
function configPath(dir) {
    return path.join(dir, ".positronic", "config.json");
}
export function loadConfig(dir) {
    const p = configPath(dir);
    if (!fs.existsSync(p)) {
        return PositronicCfg.parse({ brains: {} });
    }
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return PositronicCfg.parse(raw);
}
export function saveConfig(dir, cfg) {
    const parsed = PositronicCfg.parse(cfg);
    const p = configPath(dir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(parsed, null, 2), "utf-8");
}
export function getBrains(dir) {
    return loadConfig(dir).brains;
}
