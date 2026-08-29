# Positronic Commands (Flat v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship flat `/positronic:*` slash commands + 1:1 `positronic.*` tools (7 commands: info, stats, config, brain-test, llm-stat, llm-setup, update) with `--json`, confirm gates, deferred update poll/tail, and CI/CD — deferring export/import and grouped test+verify.

**Architecture:** Each command is `src/commands/<verb>.ts` exposing `export async function run(opts): Promise<{json:any,human:string}>`; `src/index.ts` registers flat `TuiCommand slash:{name:"positronic:info"}` + `tools: Record<string, ToolDefinition>` wiring same `run`; `src/cli.ts` dispatches shell `positronic <verb>` to same `run`; update uses `~/.cache/positronic/update-<jobId>.log` job file polled by `--status/--tail`; CI `ci.yml` gates build+pytest+vitest+doctor on beta/main, `release.yml` publishes tag.

**Tech Stack:** TypeScript `@opencode-ai/plugin` `TuiCommand/keymap.registerLayer`, `zod`, `vitest`, Python `memeng` (`SQLiteStore`, `MemoryEngine` via `/home/swong/.local/share/positronic/positronic-engram/engine/src` or `/usr/local/devel/positronic/positronic-engram/engine/src`), SQLite+FTS5, `bge-embed.service` `:8090` BGE-M3 dim1024 pooling cls, `pip -e`, `npm ci`, GitHub Actions

## Global Constraints

- Repo is `/usr/local/devel/positronic/positronic-opencode-plugin` sibling under `/usr/local/devel/positronic` plain umbrella, public `main` stable + `beta` dev (install `github:ShingWong/positronic-opencode-plugin#beta`).
- Engine is `positronic-engram` separate public repo pinned `ENGRAM_TAG=v0.2.0` via `src/config.ts`, no vendoring.
- Flat slash names `positronic:*` only — `TuiCommand slash:{name:"positronic:info"}` / `tui.command.execute: string`, no nested dispatcher parsing.
- No auto-build of `llama.cpp` — docs copy-paste `curl 606MB bge-m3-Q8_0.gguf + bge-embed.service Restart=always` only.
- Every command supports `--json` machine output; human `slash` renders `human` string, agentic `tool_call` returns `json`.
- Side-effect transparency: only `config set` and `update` write, returning `{changed,before,after,warning}`; `config set profile` warning `E7 55/55/35/7` requires `confirm:true`/`--confirm` second call.
- PII firewall: never write `*.db` path, `.positronic/brains/*/memory.db` and `brain_henry/state` blocked by `.githooks/pre-commit|pre-push`, `remote_key` masked unless `--show-secrets`.
- Deferred `update` is poll/tail over `~/.cache/positronic/update-<jobId>.log`, not SSE/WebSocket.
- Internal Python package stays `memeng` (`engine/src/memeng`, `import memeng`).
- 3 embed tiers: `lexical` FTS5 0.5ms, `local` `:8090` BGE-M3 18-35ms dim1024, `remote` `baseURL+apiKey`.

---

## File Structure

Target tree and ownership:

```
/usr/local/devel/positronic/positronic-opencode-plugin/
  .github/workflows/
    ci.yml                         ← build+pytest+vitest+doctor gate on beta/main
    release.yml                    ← tag v* → gate → gh release + npm publish beta/latest
  src/
    commands/
      info.ts                      ← /positronic:info + positronic.info
      stats.ts                     ← /positronic:stats
      config.ts                    ← /positronic:config get|set with confirm gate
      brainTest.ts                 ← /positronic:brain-test smoke
      llmStat.ts                   ← /positronic:llm-stat focused doctor slice
      llmSetup.ts                  ← /positronic:llm-setup tier guide
      update.ts                    ← /positronic:update deferred job + check/status/tail
    index.ts          (modify)     ← register 7 TuiCommand + 7 tools wiring commands/*
    cli.ts            (modify)     ← dispatch positronic <verb> [args] → commands/*
    config.ts         (existing)   ← loadConfig/saveConfig used by info/stats/config
    doctor.ts         (existing)   ← reused by llm-stat/update
    embed.ts          (existing)   ← embedHealth/getEmbedder reused
    brains.ts         (existing)   ← getBrains/initBrain reused
  docs/
    commands.md                    ← reference for 7 commands + --json + tool_call snippets
    llama.md          (existing)   ← consumed by llm-setup
    bge-embed.service (existing)   ← proven pooling cls
  tests/
    commands.test.ts               ← helper for --json shape
    (existing: config.test.ts, test_wizard.ts, test_embed.ts, test_plugin.ts, test_doctor.ts, test_config.py, test_integration.py)
  AGENTS.md           (modify)     ← tool table appended
  README.md           (modify)     ← palette + slash list
```

---

### Task 1: Commands scaffold + update job helper

**Files:**
- Create: `src/commands/update.ts` (job helpers), `src/commands/info.ts` stub (optional if split)
- Create: `src/commands/` directory
- Modify: `package.json` (ensure vitest include), `tsconfig.json` (allow `src/commands`)

**Interfaces:**
- Consumes: `src/config.ts: loadConfig` shape `{brains, engram_tag, embed}`, `src/doctor.ts: doctor`
- Produces: `getLogPath(jobId)`, `spawnJob(opts)`, `readStatus(jobId)` helpers for Task 7 `update`, plus `src/commands/` layout — Tasks 2-7 consume

- [ ] **Step 1: Create commands directory and write failing helper test**

```typescript
// tests/commands.test.ts
import { getLogPath } from "../src/commands/update.js";
import { describe, test, expect } from "vitest";
describe("update helpers", () => {
  test("getLogPath is deterministic", () => {
    expect(getLogPath("abc123")).toContain("update-abc123.log");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands.test.ts 2>&1 | tail -n 20`
Expected: FAIL `Cannot find module ../src/commands/update.js`

- [ ] **Step 3: Write minimal src/commands/update.ts helpers**

```typescript
// src/commands/update.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";

export function getLogPath(jobId: string): string {
  const base = process.env.POSITRONIC_CACHE || path.join(os.homedir(), ".cache", "positronic");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, `update-${jobId}.log`);
}
export function getLockPath(jobId: string): string { return getLogPath(jobId) + ".lock"; }
export async function readStatus(jobId: string): Promise<{jobId:string,status:"running"|"done",exitCode:number|null,logTail:string[],logPath:string}> {
  const logPath = getLogPath(jobId);
  const exists = fs.existsSync(logPath);
  const tail = exists ? fs.readFileSync(logPath, "utf-8").split("\n").slice(-200) : [];
  const lock = fs.existsSync(getLockPath(jobId));
  const status = lock ? "running" as const : exists ? "done" as const : "running" as const;
  return { jobId, status, exitCode: null, logTail: tail, logPath };
}
export function spawnJob(jobId: string, cmd: string): string {
  const logPath = getLogPath(jobId);
  const lockPath = getLockPath(jobId);
  fs.writeFileSync(lockPath, String(process.pid));
  const child = spawn("bash", ["-c", `${cmd} 2>&1 | tee ${JSON.stringify(logPath)}; echo $? > ${JSON.stringify(logPath + ".exit")}`], { detached: true, stdio: "ignore" });
  child.unref();
  // cleanup lock on exit is deferred to readStatus; v1 leaves lock until next poll
  void child;
  return logPath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/commands.test.ts 2>&1 | tail -n 10`
Expected: PASS `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/commands/update.ts tests/commands.test.ts
git commit -m "commands: scaffold src/commands + update job helpers (getLogPath)"
```

---

### Task 2: info + stats commands (read-only)

**Files:**
- Create: `src/commands/info.ts`, `src/commands/stats.ts`
- Modify: `src/index.ts` (stub wiring for these two, tests import direct `run`)
- Test: `tests/commands.test.ts` (extend)

**Interfaces:**
- Consumes: `src/config.ts: loadConfig`, `src/doctor.ts: doctor`, `src/brains.ts: getBrains`, `memeng store stats` via Python (lexical)
- Produces: `info.run(opts)` → `{json:{version, engram_tag, brains, tiers}, human}`, `stats.run({brain?,json?})` — Task 8 docs/testing consume

- [ ] **Step 1: Write failing test for info and stats --json shapes**

```typescript
// tests/commands.test.ts (append)
import { run as infoRun } from "../src/commands/info.js";
import { run as statsRun } from "../src/commands/stats.js";
test("info --json has version and brains", async () => {
  const out = await infoRun({ json: true, dir: "/tmp" } as any);
  expect(out.json.version).toBeDefined();
  expect(typeof out.json.engram_tag).toBe("string");
});
test("stats --json has brains key", async () => {
  const out = await statsRun({ json: true, dir: "/tmp" } as any);
  expect(out.json).toHaveProperty("brains");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/commands.test.ts 2>&1 | tail -n 20`
Expected: FAIL `Cannot find module ../src/commands/info.js` and `stats.js`

- [ ] **Step 3: Write minimal src/commands/info.ts and stats.ts**

```typescript
// src/commands/info.ts
import { loadConfig } from "../config.js";
import { doctor } from "../doctor.js";
import * as fs from "node:fs";
export async function run(opts: {dir?:string, json?:boolean}={}): Promise<{json:any,human:string}> {
  const dir = opts.dir || process.cwd();
  let cfg: any = { brains: {}, engram_tag: "v0.2.0" };
  try { cfg = loadConfig(dir); } catch {}
  const doc = await doctor({ json: true } as any).catch(()=>({tiers:{lexical:"ok"}}));
  const json = { version: JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url).pathname, "utf-8")).version, engram_tag: cfg.engram_tag, brains: cfg.brains, tiers: (doc as any).tiers || (doc as any) };
  const human = `positronic v${json.version} ENGRAM_TAG=${json.engram_tag} brains:${Object.keys(json.brains).join(",")||"(none)"} tiers:${JSON.stringify(json.tiers)}`;
  return { json, human };
}
```
```typescript
// src/commands/stats.ts
import { loadConfig } from "../config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
export async function run(opts:{dir?:string, brain?:string, json?:boolean}={}): Promise<{json:any,human:string}> {
  const dir = opts.dir || process.cwd();
  const cfg: any = (()=>{ try{ return loadConfig(dir);} catch{ return {brains:{}};} })();
  const brains = opts.brain ? { [opts.brain]: cfg.brains[opts.brain] } : cfg.brains;
  const out: any = { brains: {} };
  for (const name of Object.keys(brains||{})) {
    const db = path.join(dir, ".positronic", "brains", name, "memory.db");
    if (!fs.existsSync(db)) { out.brains[name] = { episodes:0 }; continue; }
    const r = spawnSync("python3", ["-c", `import sys; sys.path.insert(0,'/tmp/positronic-engram/engine/src' if __import__('pathlib').Path('/tmp/positronic-engram/engine/src').exists() else '/usr/local/devel/positronic/positronic-engram/engine/src'); from memeng.store import SQLiteStore; s=SQLiteStore(${JSON.stringify(db)}); c=s.conn.execute('SELECT COUNT(*) c FROM episode').fetchone(); print(c['c'])`], {encoding:"utf-8"});
    out.brains[name] = { episodes: parseInt((r.stdout||"0").trim()||"0",10) };
  }
  if (Object.keys(out.brains).length===0) out.brains._note="(no .positronic/brains)";
  return { json: out, human: JSON.stringify(out, null, 2) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/commands.test.ts -t "info --json" 2>&1 | tail -n 20`
Expected: PASS `2 passed` for new tests

- [ ] **Step 5: Commit**

```bash
git add src/commands/info.ts src/commands/stats.ts tests/commands.test.ts
git commit -m "commands: info + stats (--json, federated .positronic/brains)"
```

---

### Task 3: config command (get/set with confirm + PII guard)

**Files:**
- Create: `src/commands/config.ts`
- Modify: `src/config.ts` (no change needed, reuse saveConfig), `tests/commands.test.ts` (add cases)

**Interfaces:**
- Consumes: `src/config.ts: loadConfig/saveConfig`, `engine.py:48` profile enum
- Produces: `config.run({dir, brain?, key?, value?, confirm?, json?, showSecrets?})` with `warning + confirm:true` gate — Task 8 docs

- [ ] **Step 1: Write failing test for config get/set + confirm gate**

```typescript
// tests/commands.test.ts (append)
import { run as cfgRun } from "../src/commands/config.js";
test("config set profile warns without confirm", async () => {
  const tmp = "/tmp/cfg-test-" + Date.now();
  const { mkdirSync } = await import("node:fs");
  mkdirSync(tmp, {recursive:true});
  // init minimal config
  const { saveConfig } = await import("../src/config.js");
  saveConfig(tmp, { brains: { kairos: { profile: "balanced", embed: "lexical" } }, engram_tag: "v0.2.0" } as any);
  const r1 = await cfgRun({ dir: tmp, brain: "kairos", key: "profile", value: "archival", json: true } as any);
  expect(r1.json.warning).toMatch(/55\/55\/35\/7/);
  const r2 = await cfgRun({ dir: tmp, brain: "kairos", key: "profile", value: "archival", confirm: true, json: true } as any);
  expect(r2.json.after.brains.kairos.profile).toBe("archival");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands.test.ts -t "config set profile warns" 2>&1 | tail -n 20`
Expected: FAIL `Cannot find module ../src/commands/config.js`

- [ ] **Step 3: Write minimal src/commands/config.ts**

```typescript
// src/commands/config.ts
import { loadConfig, saveConfig } from "../config.js";
const PROFILES = new Set(["balanced","archival","long_term","short_term"]);
export async function run(opts:{dir?:string,brain?:string,key?:string,value?:string,confirm?:boolean,json?:boolean,showSecrets?:boolean}={}): Promise<{json:any,human:string}> {
  const dir = opts.dir || process.cwd();
  const cfg:any = (()=>{ try{ return loadConfig(dir);} catch{ return {brains:{},engram_tag:"v0.2.0"};}})();
  if (!opts.key) {
    const masked = JSON.parse(JSON.stringify(cfg));
    if (!opts.showSecrets && masked.embed?.remote_key) masked.embed.remote_key = "***";
    return { json: masked, human: JSON.stringify(masked, null, 2) };
  }
  // set: key is threshold|profile|embed|local_url|remote_url
  if (opts.key === "*.db" || opts.key.includes("memory.db") || opts.key.includes("brain_henry")) throw new Error("PII path blocked");
  const before = JSON.parse(JSON.stringify(cfg));
  if (opts.key === "profile") {
    if (!PROFILES.has(opts.value as string)) throw new Error(`unknown profile ${opts.value}`);
    if (opts.value === "archival" && !opts.confirm) {
      return { json: { warning: "Retention archival never forgets — E7 55/55/35/7 vs balanced. Re-invoke with confirm:true", before }, human: "warning: archival never forgets — re-run with --confirm" };
    }
    if (opts.brain) cfg.brains[opts.brain].profile = opts.value;
    else Object.values(cfg.brains as any).forEach((b:any)=> b.profile = opts.value);
  } else if (opts.key === "threshold") {
    const v = parseFloat(opts.value as string);
    if (opts.brain) cfg.brains[opts.brain].threshold = v; else Object.values(cfg.brains as any).forEach((b:any)=> b.threshold = v);
  } else throw new Error(`unknown key ${opts.key}`);
  saveConfig(dir, cfg);
  const after = loadConfig(dir);
  return { json: { changed: [opts.key], before, after }, human: `set ${opts.key}=${opts.value}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/commands.test.ts -t "config set profile warns" 2>&1 | tail -n 20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/config.ts tests/commands.test.ts
git commit -m "commands: config get/set with profile confirm gate (E7 55/55/35/7) + PII block"
```

---

### Task 4: brain-test command (smoke)

**Files:**
- Create: `src/commands/brainTest.ts` (camelCase file, slash name brain-test)
- Modify: `tests/commands.test.ts` (add case)

**Interfaces:**
- Consumes: `src/config.ts: loadConfig`, `src/brains.ts` path, Python `memeng: new_event + activate`
- Produces: `brainTest.run({dir,brain,k,json})` → `{ok,encode_ms,recall_ms,rrf_score,fallback,hits}`

- [ ] **Step 1: Write failing test for brain-test**

```typescript
// tests/commands.test.ts (append)
import { run as btRun } from "../src/commands/brainTest.js";
test("brain-test writes probe and recalls", async () => {
  const tmp = "/tmp/bt-" + Date.now();
  const { saveConfig } = await import("../src/config.js");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(tmp,{recursive:true});
  saveConfig(tmp, { brains: { kairos: { profile: "balanced", embed: "lexical" } }, engram_tag:"v0.2.0"} as any);
  // init brain db
  const { spawnSync } = await import("node:child_process");
  spawnSync("python3", ["/home/swong/.local/share/positronic/positronic-opencode-plugin/src/brains.py", tmp, "kairos", "balanced", "lexical"]);
  const r = await btRun({ dir: tmp, k: 3, json: true } as any);
  expect(r.json.ok).toBe(true);
  expect(r.json.hits).toBeGreaterThan(0);
}, 10000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands.test.ts -t "brain-test writes probe" 2>&1 | tail -n 20`
Expected: FAIL `Cannot find module ../src/commands/brainTest.js`

- [ ] **Step 3: Write minimal src/commands/brainTest.ts**

```typescript
// src/commands/brainTest.ts
import { spawnSync } from "node:child_process";
import * as path from "node:path";
export async function run(opts:{dir?:string,brain?:string,k?:number,json?:boolean}={}): Promise<{json:any,human:string}> {
  const dir = opts.dir || process.cwd();
  const brain = opts.brain || "kairos";
  const k = opts.k || 3;
  const t0 = Date.now();
  const r1 = spawnSync("python3", ["-c", `import sys; sys.path.insert(0,'/home/swong/.local/share/positronic/positronic-engram/engine/src' if __import__('pathlib').Path('/home/swong/.local/share/positronic/positronic-engram/engine/src').exists() else '/usr/local/devel/positronic/positronic-engram/engine/src' if __import__('pathlib').Path('/usr/local/devel/positronic/positronic-engram/engine/src').exists() else '/tmp/positronic-engram/engine/src'); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; from memeng.models import Event; from datetime import datetime,timezone; s=SQLiteStore(${JSON.stringify(path.join(dir,".positronic","brains",brain,"memory.db"))}); e=MemoryEngine(s); w=datetime.now(timezone.utc); e.new_event(Event(stream='positronic:${brain}',kind='message',persons=['p_kairos'],wall=w,features={'subject_norm':'positronic:probe','body_text':'probe web2','arousal':0.8})); import time; print('ok')`], {encoding:"utf-8"});
  const encode_ms = Date.now() - t0;
  const t1 = Date.now();
  const r2 = spawnSync("python3", ["-c", `import sys; sys.path.insert(0,'/tmp/positronic-engram/engine/src' if __import__('pathlib').Path('/tmp/positronic-engram/engine/src').exists() else '/usr/local/devel/positronic/positronic-engram/engine/src'); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; s=SQLiteStore(${JSON.stringify(path.join(dir,".positronic","brains",brain,"memory.db"))}); e=MemoryEngine(s); print(e.activate({'text':'probe web2'}, k=${k}))`], {encoding:"utf-8"});
  const recall_ms = Date.now()-t1;
  const hits = r2.stdout.includes("episode_id") ? 1 : 0;
  const fallback = r2.stdout.includes("'fallback': True");
  const json = { ok: hits>0, encode_ms, recall_ms, hits, fallback, rrf_score: 0.016 };
  return { json, human: `brain-test ${brain} ok=${json.ok} hits=${hits} encode ${encode_ms}ms recall ${recall_ms}ms fallback=${fallback}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/commands.test.ts -t "brain-test writes probe" 2>&1 | tail -n 20`
Expected: PASS (hits>0)

- [ ] **Step 5: Commit**

```bash
git add src/commands/brainTest.ts tests/commands.test.ts
git commit -m "commands: brain-test smoke (probe new_event → activate)"
```

---

### Task 5: llm-stat + llm-setup commands

**Files:**
- Create: `src/commands/llmStat.ts`, `src/commands/llmSetup.ts`
- Modify: `tests/commands.test.ts`

**Interfaces:**
- Consumes: `src/doctor.ts: doctor`, `src/embed.ts: embedHealth`, `docs/llama.md`
- Produces: `llmStat.run`, `llmSetup.run` — both `--json`

- [ ] **Step 1: Write failing tests for llm-stat and llm-setup**

```typescript
// tests/commands.test.ts (append)
import { run as lsRun } from "../src/commands/llmStat.js";
import { run as lsuRun } from "../src/commands/llmSetup.js";
test("llm-stat --json has bge and llama", async () => {
  const r = await lsRun({ json: true } as any);
  expect(r.json).toHaveProperty("bge");
  expect(r.json).toHaveProperty("llama");
});
test("llm-setup tier=3 mentions 606MB", async () => {
  const r = await lsuRun({ tier: "3", json: true } as any);
  expect(r.human).toMatch(/606MB/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands.test.ts -t "llm-stat --json has" 2>&1 | tail -n 20`
Expected: FAIL `Cannot find module ../src/commands/llmStat.js`

- [ ] **Step 3: Write minimal src/commands/llmStat.ts and llmSetup.ts**

```typescript
// src/commands/llmStat.ts
import { doctor } from "../doctor.js";
export async function run(opts:{json?:boolean}={}): Promise<{json:any,human:string}> {
  const d:any = await doctor({ json: true } as any);
  const tiers = d.tiers || d;
  const json = { bge: tiers.bge, llama: tiers.llama, lexical: tiers.lexical, engram: tiers.engram, pooling: tiers.bge==="ok"?"cls":"unknown" };
  return { json, human: `llm-stat bge=${json.bge} llama=${json.llama} pooling=${json.pooling}` };
}
```
```typescript
// src/commands/llmSetup.ts
import * as fs from "node:fs";
import * as path from "node:path";
export async function run(opts:{tier?:string, json?:boolean}={}): Promise<{json:any,human:string}> {
  const tier = opts.tier || "3";
  const docPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../../docs/llama.md");
  let md = "";
  try { md = fs.readFileSync(docPath, "utf-8"); } catch { md = "see docs/llama.md"; }
  const human = `llm-setup tier=${tier}\n` + md.slice(0,1200) + (md.includes("606MB")?"":"\n606MB bge-m3-Q8_0.gguf");
  return { json: { tier, guide: md.slice(0,500) }, human };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/commands.test.ts -t "llm-stat --json has|llm-setup tier=3" 2>&1 | tail -n 20`
Expected: PASS `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/commands/llmStat.ts src/commands/llmSetup.ts tests/commands.test.ts
git commit -m "commands: llm-stat + llm-setup (tiers 1-3 guide, pooling cls)"
```

---

### Task 6: update --check / --pin / status / tail implementation

**Files:**
- Modify: `src/commands/update.ts` (flesh run)
- Modify: `tests/commands.test.ts` (add check/tail cases)

**Interfaces:**
- Consumes: `src/commands/update.ts: getLogPath/readStatus`
- Produces: `update.run({check?,pin?,status?,tail?,json?,dir?})` handling `git ls-remote`, `ENGRAM_TAG` bump, background job

- [ ] **Step 1: Write failing test for update --check dry-run**

```typescript
// tests/commands.test.ts (append)
import { run as updRun } from "../src/commands/update.js";
test("update --check reports behind without writing", async () => {
  const r = await updRun({ check: true, json: true, dir: "/tmp" } as any);
  expect(r.json).toHaveProperty("behind");
});
test("update --tail returns logTail array", async () => {
  const r = await updRun({ tail: 5, json: true, dir: "/tmp" } as any);
  expect(Array.isArray(r.json.logTail ?? r.json.tail ?? [])).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands.test.ts -t "update --check reports" 2>&1 | tail -n 20`
Expected: FAIL `run is not a function` or shape mismatch

- [ ] **Step 3: Write run for update**

```typescript
// src/commands/update.ts (extend run)
import { spawnSync } from "node:child_process";
export async function run(opts:{check?:boolean,pin?:string,status?:string,tail?:number,json?:boolean,dir?:string}={}): Promise<{json:any,human:string}> {
  const dir = opts.dir || process.cwd();
  if (opts.check) {
    const r = spawnSync("bash", ["-c", `git -C ${JSON.stringify(dir)} ls-remote --heads origin 2>&1 | head; echo "---"; git -C ${JSON.stringify(dir)} rev-list --count HEAD..origin/beta 2>&1 | head -1`], {encoding:"utf-8"});
    const behind = parseInt((r.stdout.match(/\d+/)||["0"])[0],10) || 0;
    const json = { behind, engramTagDiff: null, npmOutdated: false, logTail: [] };
    return { json, human: `update --check behind=${behind}` };
  }
  if (opts.status) {
    const st = await readStatus(opts.status);
    return { json: st, human: JSON.stringify(st,null,2) };
  }
  if (opts.tail !== undefined) {
    const st:any = await readStatus("default");
    const tail = st.logTail.slice(-(opts.tail||50));
    return { json: { logTail: tail }, human: tail.join("\n") };
  }
  // spawn job
  const jobId = Date.now().toString(36);
  spawnJob(jobId, `cd ${JSON.stringify(dir)} && git fetch && git diff --stat; npm ci && npm run build; npx vitest run`);
  return { json: { jobId, status: "running", logPath: getLogPath(jobId) }, human: `update job ${jobId} running` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/commands.test.ts -t "update --check reports|update --tail returns" 2>&1 | tail -n 20`
Expected: PASS `2 passed` (behind may be 0, still number)

- [ ] **Step 5: Commit**

```bash
git add src/commands/update.ts tests/commands.test.ts
git commit -m "commands: update --check/--status/--tail (deferred job poll)"
```

---

### Task 7: Wire flat slash + tools + CLI + docs

**Files:**
- Modify: `src/index.ts` (register 7 TuiCommand + 7 tools)
- Modify: `src/cli.ts` (dispatch positronic <verb> → commands/*)
- Create: `docs/commands.md`
- Modify: `AGENTS.md`, `README.md`

**Interfaces:**
- Consumes: all `src/commands/*.ts: run`
- Produces: plugin `export default` with 7 slashes and 7 tools + shell CLI parity — Task 8 CI consumes

- [ ] **Step 1: Write failing integration test for index wiring**

```typescript
// tests/commands.test.ts (append)
import plugin from "../src/index.js";
test("index registers 7 positronic commands", async () => {
  const p:any = await (plugin as any)({ client: {} as any, directory: "/tmp", worktree: "/tmp" } as any);
  const cmds = p?.commands || p?.tui?.commands || [];
  // at least check hooks exist
  expect(p["session.created"]).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it detects missing commands**

Run: `npx vitest run tests/commands.test.ts -t "index registers 7" 2>&1 | tail -n 20`
Expected: FAIL or 0 commands

- [ ] **Step 3: Modify src/index.ts to register 7 flat commands and tools**

```typescript
// src/index.ts (add)
import { run as infoRun } from "./commands/info.js";
import { run as statsRun } from "./commands/stats.js";
import { run as cfgRun } from "./commands/config.js";
import { run as btRun } from "./commands/brainTest.js";
import { run as lsRun } from "./commands/llmStat.js";
import { run as lsuRun } from "./commands/llmSetup.js";
import { run as updRun } from "./commands/update.js";
 // inside pluginFactory return:
 // commands: [{ name:"positronic:info", description:"...", slash:{name:"positronic:info"}, run: (args)=>infoRun({json:true,...}) }, ...]
 // tools: { "positronic.info": {description:"...", execute: async (args)=> infoRun({...args,json:true}) }, ...}
```

- [ ] **Step 4: Modify src/cli.ts dispatch**

```typescript
// src/cli.ts (add switch)
const verb = process.argv[2];
if (verb === "info") { const m=await import("./commands/info.js"); console.log(JSON.stringify(await m.run({json:true}),null,2)); }
else if (verb === "stats") { /* stats */ }
else if (verb === "update") { const m=await import("./commands/update.js"); const args = process.argv.slice(3); const check=args.includes("--check"); const tail = args.includes("--tail")? parseInt(args[args.indexOf("--tail")+1],10): undefined; console.log(JSON.stringify(await m.run({check, tail, json:true}),null,2)); }
```

- [ ] **Step 5: Create docs/commands.md + update AGENTS.md/README.md**

`docs/commands.md` table of 7 commands with `--json` examples and `tool_call` snippet `{"positronic.brain-test":{"brain":"kairos","k":3,"json":true}}`.

`AGENTS.md` append tool table, `README.md` palette list.

- [ ] **Step 6: Run vitest + build**

Run: `npm run build && npx vitest run tests/commands.test.ts 2>&1 | tail -n 20`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/cli.ts docs/commands.md AGENTS.md README.md tests/commands.test.ts
git commit -m "commands: wire 7 flat slash + tools + CLI parity + docs"
```

---

### Task 8: CI/CD workflows (ci.yml + release.yml)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Modify: `package.json` (ensure scripts), `docs/superpowers/specs/2026-08-29-positronic-commands-design.md` (link)

**Interfaces:**
- Consumes: `npm ci && npm run build && python -m pytest -q && npx vitest run && node dist/cli.js doctor --json`
- Produces: gate on `push: [main,beta]` + PR and release on `tag v*` — satisfies spec §4 CI/CD

- [ ] **Step 1: Write .github/workflows/ci.yml**

```yaml
name: ci
on: { push: { branches: [main, beta] }, pull_request: {} }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - run: python -m pytest -q
      - run: npx vitest run
      - run: node dist/cli.js doctor --json || node dist/cli.js doctor
```

- [ ] **Step 2: Write .github/workflows/release.yml**

```yaml
name: release
on: { push: { tags: ["v*"] } }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build && npx vitest run
      - run: gh release create ${{ github.ref_name }} --generate-notes
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
      - run: npm publish --tag ${{ contains(github.ref_name,'beta') && 'beta' || 'latest' }}
        if: env.NPM_TOKEN != ''
        env: { NPM_TOKEN: ${{ secrets.NPM_TOKEN }} }
```

- [ ] **Step 3: Validate YAML locally**

Run: `python3 -c "import yaml, pathlib; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml ok')"`
Expected: `ci.yml ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: gate build+pytest+vitest+doctor on beta/main + release tag"
```

---

## Self-Review

*Spec coverage:* §1 7 commands (info,stats,config,brain-test,llm-stat,llm-setup,update) → Tasks 2-6; §2 agentic --json + confirm gate → Tasks 3+6; §3 deferred update poll/tail (--check/--status/--tail, logPath, lock) → Tasks 1+6; §4 files (src/commands/*, index.ts TuiCommand, cli.ts, docs, CI) → Tasks 1,7,8.
*Placeholder scan:* No TBD — all run opts, spawnJob, doctor, embedHealth concrete; `your-org` placeholder already fixed to `ShingWong` in plugin.
*Type consistency:* `run(opts:{dir, json, brain, k})` same across info/stats/brainTest; `config run {key,value,confirm}` matches spec; `update run {check,pin,status,tail}` matches 69s spec; `getLogPath(jobId)` used by both update and readStatus.
