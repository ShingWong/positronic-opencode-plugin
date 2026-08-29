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
import { spawnSync } from "node:child_process";

const PROFILE_HELP: Record<string, string> = {
  balanced: "Keeps recent memories for a few weeks (normal use)",
  long_term: "Keeps memories for months",
  archival: "Never forgets — grows forever",
  short_term: "Keeps memories for a few days (experiments)",
};

const EMBED_HELP: Record<string, string> = {
  lexical: "Fast text search",
  local: "Smarter search on your machine",
  remote: "Smarter search via online service",
};

export async function run(opts:{dir?:string, brain?:string, json?:boolean}={}): Promise<{json:any,human:string}> {
  const dir = opts.dir || process.cwd();
  const cfg: any = (()=>{ try{ return loadConfig(dir);} catch{ return {brains:{}};} })();
  const brains = opts.brain ? { [opts.brain]: cfg.brains[opts.brain] } : cfg.brains;
  const out: any = { brains: {} };
  for (const name of Object.keys(brains||{})) {
    const bcfg: any = (brains as any)[name] || {};
    const profile = bcfg.profile || "balanced";
    const embed = bcfg.embed || "lexical";
    const db = path.join(dir, ".positronic", "brains", name, "memory.db");
    let episodes = 0;
    if (fs.existsSync(db)) {
      const r = spawnSync("python3", ["-c", `import sys; sys.path.insert(0,'/tmp/positronic-engram/engine/src' if __import__('pathlib').Path('/tmp/positronic-engram/engine/src').exists() else '/usr/local/devel/positronic/positronic-engram/engine/src'); from memeng.store import SQLiteStore; s=SQLiteStore(${JSON.stringify(db)}); c=s.conn.execute('SELECT COUNT(*) c FROM episode').fetchone(); print(c['c'])`], {encoding:"utf-8"});
      episodes = parseInt((r.stdout||"0").trim()||"0",10);
    }
    out.brains[name] = {
      episodes,
      profile,
      profileHelp: PROFILE_HELP[profile] || profile,
      embed,
      embedHelp: EMBED_HELP[embed] || embed,
    };
  }
  if (Object.keys(out.brains).length===0) out.brains._note="(no .positronic/brains — run /positronic:init to create one)";
  // Human: friendly table without json jargon
  const lines: string[] = [];
  if (out.brains._note) lines.push(out.brains._note);
  for (const [name, b] of Object.entries(out.brains as Record<string, any>)) {
    if (name.startsWith("_")) continue;
    const wb:any = b;
    lines.push(`${name} — ${wb.episodes} ${wb.episodes===1?"memory":"memories"} · ${wb.profileHelp} · ${wb.embedHelp}`);
  }
  if (lines.length === 0) lines.push("(no brains)");
  return { json: out, human: lines.join("\n") };
}
