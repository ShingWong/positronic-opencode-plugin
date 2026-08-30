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

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { loadConfig } from "../config.js";

const ENG_SRC = ((): string => {
  const cands = [
    "/usr/local/devel/positronic/positronic-engram/engine/src",
    "/home/swong/.local/share/positronic/positronic-engram/engine/src",
  ];
  for (const c of cands) { if (__import_path_exists(c)) return c; }
  return "/usr/local/devel/positronic/positronic-engram/engine/src";
})();

function __import_path_exists(p: string): boolean {
  try { spawnSync("test", ["-d", p], { timeout: 1000 }); return true; } catch { return false; }
}

export async function runQuery(opts: {
  dir?: string; brain?: string; qtext?: string; sql?: string; cue?: string;
  objects?: boolean; anchors?: boolean; sightings?: boolean; k?: number; json?: boolean;
} = {}): Promise<{ json: any; human: string }> {
  const dir = opts.dir || process.cwd();
  const brain = opts.brain || "kairos";
  const db = path.join(dir, ".positronic", "brains", brain, "memory.db");
  const k = opts.k || 8;

  if (!fs.existsSync(db)) {
    return { json: { ok: false, error: `no such brain db: ${db}` }, human: `no such brain db: ${db}` };
  }

  const dbJson = JSON.stringify(db);
  const PY = `import sys,json,time; sys.path.insert(0,${JSON.stringify(ENG_SRC)}); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; s=SQLiteStore(${dbJson}); e=MemoryEngine(s)`;
  let py = "";
  if (opts.sql) {
    py = `${PY}; rows=[dict(r) for r in s.conn.execute(${JSON.stringify(opts.sql)}).fetchall()]; print(json.dumps(rows))`;
  } else if (opts.anchors) {
    py = `${PY}; rows=s.conn.execute("SELECT substr(id,1,12) id,round(tau,2) tau,kind,substr(subject_norm,1,80) sn FROM episode WHERE is_anchor=1 ORDER BY tau DESC LIMIT ${k}").fetchall(); print(json.dumps([dict(r) for r in rows]))`;
  } else if (opts.sightings) {
    py = `${PY}; rows=s.conn.execute("SELECT o.canonical_name obj,e.tau,os.channel FROM object_sighting os JOIN object o ON os.object_id=o.id JOIN episode e ON os.episode_id=e.id ORDER BY e.tau DESC LIMIT ${k}").fetchall(); print(json.dumps([dict(r) for r in rows]))`;
  } else if (opts.objects) {
    py = `${PY}; rows=s.conn.execute("SELECT id,canonical_name,kind,first_seen_tau,last_seen_tau,status FROM object ORDER BY first_seen_tau DESC LIMIT ${k}").fetchall(); print(json.dumps([dict(r) for r in rows]))`;
  } else if (opts.cue) {
    py = `${PY}; hits=e.activate({'text':${JSON.stringify(opts.cue)}}, k=${k}); print(json.dumps(hits))`;
  } else {
    const text = (opts.qtext || "").trim();
    if (!text) {
      return { json: { ok: true, help: true, usage: "positronic query <text> --brain <name> --k <n> | --sql <SQL> | --cue <text> | --anchors | --objects | --sightings" }, human: "usage: positronic query <text> | --sql <SQL> | --cue <text> | --anchors | --objects | --sightings [--brain kairos] [--k 8]" };
    }
    py = `${PY}; t0=time.perf_counter(); hits=e.activate({'text':${JSON.stringify(text)}}, k=${k}); ms=(time.perf_counter()-t0)*1000; print(json.dumps({'ms':round(ms,2),'hits':len(hits),'results':hits}))`;
  }

  const r = spawnSync("python3", ["-c", py], { encoding: "utf-8", timeout: 10000 });
  if (r.status !== 0 || r.stderr) {
    return { json: { ok: false, error: (r.stderr || "").slice(0, 300), stdout: (r.stdout || "").slice(0, 200) }, human: `query failed: ${(r.stderr || "").slice(0, 300)}` };
  }
  let parsed: any = [];
  try { parsed = JSON.parse(r.stdout); } catch { parsed = [{ raw: r.stdout.slice(0, 500) }]; }

  const human = Array.isArray(parsed)
    ? parsed.map((h: any, i: number) => `  ${i + 1}. τ=${round(h?.tau ?? h?.first_seen_tau ?? 0, 2)} ${(h?.subject_norm || h?.canonical_name || "").slice(0, 60)}`).join("\n") || "(no results)"
    : JSON.stringify(parsed).slice(0, 200);
  return { json: { ok: true, brain, results: parsed }, human };
}

function round(n: number, d: number): number { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }
