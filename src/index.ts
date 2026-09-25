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
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Every verb is delegated to the positronic_ai Python package (PAI, Task 8).
// No python import in TS — always spawnSync `paiPython() -m positronic_ai <verb>`.
// Fix 6 — PAI python resolution: the background `serve` process may not
// inherit the venv PATH (live `No module named positronic_ai`). Explicit
// candidates first (env override, then known venvs), PATH last.
const PAI_PYTHONS = ["/mnt/k/devel/ft/.venv-pai/bin/python", "/tmp/ft2/bin/python", "python3"];
export function paiPython(): string {
  const env = (typeof process !== "undefined" && process.env && (process.env.POSITRONIC_PYTHON || process.env.PAI_PYTHON)) || "";
  for (const p of (env ? [env] : []).concat(PAI_PYTHONS)) {
    if (p === "python3") return p;
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return "python3";
}
// Fix 7 — project root fallback: this file lives at
// <project>/.opencode/plugins/positronic.js. v2 tool contexts and session
// events don't reliably carry the session directory, and process.cwd() is
// the serve daemon's cwd — not the project. Derive it from our own location
// (each project loads its own copy => correct by construction).
export function projectDir(): string | undefined {
  // Deploy assumption: this file is <project>/.opencode/plugins/positronic.js
  // (3x dirname). Under vitest/dev (src/index.ts, dist/index.js) this resolves
  // to the repo umbrella instead — harmless: toolDir prefers args.dir and
  // ctx.directory first, and tests always pass explicit dirs.
  //
  // Fix 10 follow-up (live ai1 finding): for a GLOBAL install the derived dir
  // (~/.local/share/positronic) is wrong-but-existent, and it SHADOWS the
  // correct process.cwd() when the serve daemon runs inside the project.
  // Only claim the dir when it quacks like a project (has .positronic/).
  try {
    const d = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
    let has = false;
    try { has = fs.statSync(path.join(d, ".positronic")).isDirectory(); } catch { has = false; }
    if (!has) {
      // Fix 11 — make the rejection visible (silent undefined hid the bug).
      logIngest(`projectDir: rejected candidate ${d} (no .positronic/)`);
      return undefined;
    }
    return d;
  } catch { return undefined; }
}
// Fix 10 — global-install safety. projectDir() (file-location, patch-2 Fix 7)
// only holds for <project>/.opencode/plugins/positronic.js copies. opencode's
// PluginInput carries the real project dir; prefer it, keep projectDir() as a
// last-resort fallback for older hosts.
let __posProjectRoot: string | undefined;
// Live finding (ai1 serve): ctx.worktree can be an OBJECT, not a string —
// blindly preferring it yields "v2 project root=[object Object]". Accept
// only non-empty strings; unwrap common object shapes.
export function asDir(v: any): string | undefined {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object") {
    for (const k of ["path", "directory", "root", "cwd"]) {
      if (typeof v[k] === "string" && v[k]) return v[k];
    }
  }
  return undefined;
}
export function setProjectRoot(dir?: any): void {
  const d = asDir(dir);
  if (d) __posProjectRoot = d;
}
export function v2ResetProjectRoot(): void { __posProjectRoot = undefined; }
// Fix 11 — read the root from every plausible PluginInput shape. `worktree`
// can be the worktree object (getter-backed `.directory`), and newer builds
// add `location`/`project`.
export function ctxRoot(ctx: any): string | undefined {
  return asDir(ctx?.directory) || asDir(ctx?.worktree) ||
    asDir(ctx?.location) || asDir(ctx?.project) || undefined;
}
// Fix 11 — explicit root for global installs on builds that pass no directory.
// One absolute path per line at ~/.config/positronic/project.
export function configRoot(): string | undefined {
  try {
    // Prefer $HOME (operator/test-visible) over os.homedir().
    const home = process.env.HOME || os.homedir();
    const p = path.join(home, ".config", "positronic", "project");
    const t = fs.readFileSync(p, "utf-8");
    for (const line of t.split("\n")) {
      const s = line.trim();
      if (s && !s.startsWith("#")) return s;
    }
    return undefined;
  } catch { return undefined; }
}
export function projectRoot(): string | undefined {
  return __posProjectRoot || process.env.POSITRONIC_PROJECT_DIR || configRoot() || undefined;
}
// Fix 10d — per-session directory via the SDK client (multi-project services).
// Stored from setupV2's PluginInput; sessionDir() resolves a sessionID to its
// project directory so one service stays correct across many projects.
// Fix 11 — cache sessionID→dir, and log once when the client is absent
// (silent no-op hid whether ctx.client even exists on the build).
let __posClient: any = undefined;
const __posSessionDirs = new Map<string, string>();
let __posSessionDirNoClientLogged = false;
export function setPosClient(client: any): void { __posClient = client; }
export function v2ResetSessionDirs(): void {
  __posSessionDirs.clear();
  __posSessionDirNoClientLogged = false;
  __posClient = undefined;
}
export async function sessionDir(id?: string): Promise<string | undefined> {
  if (!id) return undefined;
  const cached = __posSessionDirs.get(id);
  if (cached) return cached;
  if (!__posClient) {
    if (!__posSessionDirNoClientLogged) {
      __posSessionDirNoClientLogged = true;
      logIngest("sessionDir: no client");
    }
    return undefined;
  }
  try {
    const r: any = await __posClient?.session?.get?.({ path: { id } });
    const d = r?.data?.directory || r?.directory || undefined;
    if (d) {
      if (__posSessionDirs.size > 5000) __posSessionDirs.clear();
      __posSessionDirs.set(id, d);
    }
    return d;
  } catch { return undefined; }
}
export function toolDir(args: any, ctx: any): string {
  return args?.dir || ctx?.directory || projectRoot() || projectDir() || process.cwd();
}
function pai(argv: string[], opts?: { cwd?: string; timeout?: number }): { ok: boolean; json: any; error?: string } {
  try {
    const r = spawnSync(paiPython(), ["-m", "positronic_ai", ...argv], {
      encoding: "utf-8",
      cwd: opts?.cwd,
      timeout: opts?.timeout ?? 60000,
    });
    if (r.status !== 0) {
      return { ok: false, json: null, error: (r.stderr || "").trim() || `exit ${r.status}` };
    }
    try {
      return { ok: true, json: JSON.parse(r.stdout || "{}") };
    } catch (e: any) {
      return { ok: false, json: null, error: `bad json: ${(r.stdout || "").slice(0, 200)}` };
    }
  } catch (e: any) {
    return { ok: false, json: null, error: e?.message };
  }
}

export const positronicCommands = [
  { title: "positronic:init", value: "positronic:init", description: "init .positronic/brains (warn if exists, --force)", slash: { name: "positronic:init" } },
  { title: "positronic:info", value: "positronic:info", description: "positronic info --json", slash: { name: "positronic:info" } },
  { title: "positronic:stats", value: "positronic:stats", description: "federated brain stats", slash: { name: "positronic:stats" } },
  { title: "positronic:config", value: "positronic:config", description: "get/set .positronic/config.json", slash: { name: "positronic:config" } },
  { title: "positronic:brain-test", value: "positronic:brain-test", description: "probe new_event -> activate smoke", slash: { name: "positronic:brain-test" } },
  { title: "positronic:llm-stat", value: "positronic:llm-stat", description: "bge/llama tier health", slash: { name: "positronic:llm-stat" } },
  { title: "positronic:llm-setup", value: "positronic:llm-setup", description: "tier guide (1 lexical, 2 remote, 3 local 606MB)", slash: { name: "positronic:llm-setup" } },
  { title: "positronic:update", value: "positronic:update", description: "deferred update --check/--tail/--status", slash: { name: "positronic:update" } },
  { title: "positronic:delete", value: "positronic:delete", description: "delete brain (warn, --force)", slash: { name: "positronic:delete" } },
  { title: "positronic:query", value: "positronic:query", description: "query brain (text/FTS5/SQL/anchors/objects/sightings)", slash: { name: "positronic:query" } },
  { title: "positronic:prune", value: "positronic:prune", description: "run τ-decay pruning on the live brain", slash: { name: "positronic:prune" } },
  { title: "positronic:consolidate", value: "positronic:consolidate", description: "write a consolidation summary event", slash: { name: "positronic:consolidate" } },
] as const;

function logIngest(msg: string) {
  try {
    const dir = path.join(os.homedir(), ".cache", "positronic");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "ingest.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

async function ingestLive(partsToIngest: string[], dirHint?: string, role: string = "assistant") {
  const text = partsToIngest.join("\n").slice(0, 4000).trim();
  if (!text) { logIngest("ingest skip: empty text"); return; }
  const dir = dirHint || projectRoot() || projectDir() || process.cwd();
  // live flag + brain list come from PAI config (never loadConfig locally)
  const cfg = pai(["config", "--json"], { cwd: dir });
  if (!cfg.ok) { logIngest(`ingest skip: config failed dir=${dir} err=${cfg.error}`); return; }
  if (cfg.json.live === false) { logIngest(`ingest skip: live=false dir=${dir}`); return; }
  if (role === "user" && cfg.json.capture_user !== true) {
    logIngest(`ingest skip: user message, capture_user=false dir=${dir}`);
    return;
  }
  const brains = cfg.json.brains || {};
  if (Object.keys(brains).length === 0) { logIngest(`ingest skip: no brains dir=${dir}`); return; }
  const brainName = Object.keys(brains)[0];
  try {
    const r = pai(["ingest", text, "--arousal", "0.5", "--brain", brainName, "--role", role], { cwd: dir, timeout: 60000 });
    logIngest(`ingest done role=${role} brain=${brainName} dir=${dir} len=${text.length} ok=${r.ok} out=${JSON.stringify(r.json ?? r.error).slice(0, 200)}`);
  } catch (e: any) { logIngest(`ingest exception role=${role} brain=${brainName} err=${e?.message}`); }
}

function logPrune(msg: string) {
  try {
    const dir = path.join(os.homedir(), ".cache", "positronic");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "prune.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// Compose a content-carrying consolidation marker from engram's own selection
// machinery: recent anchor episodes (salience >= anchor_salience) + the recent
// object graph. Falls back to the bare session id when the span has no anchors.
const ANCHOR_SQL = "SELECT json_extract(features_json,'$.body_text') t FROM episode WHERE is_anchor=1 AND kind='message' ORDER BY tau DESC LIMIT 4";
const OBJECT_SQL = "SELECT canonical_name FROM object ORDER BY COALESCE(last_seen_tau,first_seen_tau) DESC LIMIT 8";

export function composeMarker(dir: string, sessionID: string): string {
  const anchors = pai(["query", "--sql", ANCHOR_SQL, "--json"], { cwd: dir });
  const frags = (anchors.ok && Array.isArray(anchors.json?.results))
    ? anchors.json.results.map((r: any) => r?.t).filter((t: any): t is string => typeof t === "string" && t.length > 0)
    : [];
  if (frags.length === 0) return `session compacted ${sessionID}`.trim();
  const objs = pai(["query", "--sql", OBJECT_SQL, "--json"], { cwd: dir });
  const names = (objs.ok && Array.isArray(objs.json?.results))
    ? objs.json.results.map((r: any) => r?.canonical_name).filter((n: any): n is string => typeof n === "string")
    : [];
  let text = frags.slice(0, 4).join(" | ");
  if (names.length) text += ` objects: ${names.slice(0, 8).join(", ")}`;
  return text.slice(0, 1000);
}

async function compactBrain(dir: string, sessionID: string) {
  try {
    const pr = pai(["prune", "--json"], { cwd: dir });
    logPrune(`compact prune dir=${dir} ok=${pr.ok} ${JSON.stringify(pr.json ?? pr.error).slice(0, 200)}`);
    const marker = composeMarker(dir, sessionID);
    if (marker) {
      const cr = pai(["consolidate", marker, "--arousal", "0.3"], { cwd: dir });
      logPrune(`compact marker dir=${dir} ok=${cr.ok} len=${marker.length} ${JSON.stringify(cr.json ?? cr.error).slice(0, 200)}`);
    }
  } catch (e: any) {
    logPrune(`compact exception dir=${dir} err=${e?.message}`);
  }
}

// Post-compaction brain-first reminder. The `context` session hook edits
// only the OUTGOING model call — never persisted history — so the reminder
// text itself can never be ingested into the brain. Exposure is bounded:
// each compacted session gets BRAIN_REMINDER_BUDGET injections, then
// silence. (Unbounded injection risks the model echoing the rule into
// ingested answers, and per-model reactions to injected instructions are
// unpredictable — so: short text, post-compaction only, then stop.)
export const BRAIN_REMINDER_BUDGET = 2;
export const BRAIN_REMINDER_TEXT =
  "Memory rule: query the positronic brain (positronic_recall / positronic_query) before answering project questions — do not re-derive from files what the brain holds.";
const __reminderBudget = new Map<string, number>();
export function markCompacted(sessionID: string) {
  if (sessionID) {
    __reminderBudget.set(String(sessionID), BRAIN_REMINDER_BUDGET);
    logIngest(`reminder armed session=${sessionID} budget=${BRAIN_REMINDER_BUDGET}`);
  }
}
export function takeReminder(sessionID: string): string | null {
  const k = String(sessionID || "");
  if (!k) return null;
  const left = __reminderBudget.get(k);
  if (!left) return null;
  if (left <= 1) __reminderBudget.delete(k);
  else __reminderBudget.set(k, left - 1);
  logIngest(`reminder inject session=${k} left=${Math.max(left - 1, 0)}`);
  return BRAIN_REMINDER_TEXT;
}
export function v2ResetReminders() { __reminderBudget.clear(); }
export function registerReminderHook(ctx: any): boolean {
  try {
    if ((globalThis as any).__positronicReminderHook) return true;
    if (typeof ctx?.session?.hook !== "function") {
      logIngest("reminder hook unsupported (no ctx.session.hook)");
      return false;
    }
    void ctx.session.hook("context", (event: any) => {
      try {
        const text = takeReminder(event?.sessionID);
        if (text && Array.isArray(event?.system)) event.system.push({ type: "text", text });
      } catch {}
    });
    (globalThis as any).__positronicReminderHook = true;
    logIngest("reminder hook registered");
    return true;
  } catch (e: any) {
    logIngest("reminder hook err " + ((e && e.message) || e));
    return false;
  }
}

// Collect assistant-message text for ingestion, deliberately EXCLUDING
// reasoning/thinking parts: they are process, not decision. The answer part
// already carries the conclusion; ingesting the reasoning trace would let a
// future recall surface a discarded hypothesis as if it were a decision.
// Exported for tests.
export function isReasoningPart(p: any): boolean {
  return typeof p?.type === "string" && p.type === "reasoning";
}

export function collectAssistantText(outParts: any[], msg: any): string[] {
  const parts: string[] = [];
  for (const p of outParts || []) {
    if (isReasoningPart(p)) continue;
    if (typeof p?.text === "string" && p.text.trim()) parts.push(p.text);
    if (typeof p?.part?.text === "string" && !isReasoningPart(p.part)) parts.push(p.part.text);
  }
  if (msg && typeof (msg as any)?.text === "string") parts.push((msg as any).text);
  return parts;
}

async function pluginFactory(_input: any) {
  return {
    // chat.message is the correct hook for live ingestion in opencode 1.18+ (event bus only has session.*)
    "chat.message": async (_input: any, output: any) => {
      try {
        const msg = output?.message;
        const outParts: any[] = output?.parts || [];
        // Collect answer text, skipping reasoning parts (see collectAssistantText).
        const parts = collectAssistantText(outParts, msg);
        // Capture both sides: ingest user AND assistant messages, role-tagged.
        // User-side capture is gated by config capture_user (privacy).
        const role = (msg as any)?.role || (msg as any)?.info?.role || "assistant";
        const isUser = String(role).toLowerCase() === "user";
        if (parts.length === 0) {
          logIngest(`chat.message no parts session=${_input?.sessionID}`);
          return;
        }
        logIngest(`chat.message ingest role=${role} len=${parts.join("\n").length} session=${_input?.sessionID}`);
        const msgDir = _input?.directory || _input?.workspace?.directory || projectRoot() || projectDir() || process.cwd();
        await ingestLive(parts, msgDir, isUser ? "user" : "assistant");
      } catch (e: any) {
        logIngest(`chat.message exception ${e?.message}`);
      }
    },
    // Generic event — session lifecycle (session.created etc) — keep for diagnostics
    event: async ({ event }: any) => {
      const t = event?.type as string | undefined;
      if (!t) return;
      logIngest(`event type=${t} dir=${process.cwd()}`);
      if (t === "session.created") {
        const dir = (event as any)?.properties?.directory || (event as any)?.directory || projectRoot() || projectDir() || process.cwd();
        const probe = pai(["info", "--json"], { cwd: dir });
        logIngest(`session.created info probe dir=${dir} ok=${probe.ok}`);
        return;
      }
      if (t === "session.compacted" || t === "session.compaction.ended") {
        const dir = (event as any)?.properties?.info?.directory || (event as any)?.properties?.directory || (event as any)?.directory || projectRoot() || projectDir() || process.cwd();
        const sessionID = (event as any)?.properties?.sessionID || "";
        void compactBrain(dir, sessionID);
        return;
      }
      // Fallback: legacy message.* events if bus still emits them (pre-1.18 compat)
      if (t.startsWith("message.")) {
        const props: any = (event as any)?.properties || event;
        const role = props?.role || props?.message?.role || (props?.part?.type === "text" ? "assistant" : undefined);
        if (role && String(role).toLowerCase() === "user") { logIngest(`event skip: role=user type=${t}`); return; }
        const parts: string[] = [];
        const collect = (m: any) => {
          if (!m) return;
          if (typeof m?.text === "string" && m?.type !== "reasoning") parts.push(m.text);
          if (typeof m?.content === "string") parts.push(m.content);
          if (Array.isArray(m?.parts)) m.parts.forEach((p: any) => { if (p?.type !== "reasoning" && typeof p?.text === "string") parts.push(p.text); else if (typeof p === "string") parts.push(p); });
          if (Array.isArray(m?.message?.parts)) m.message.parts.forEach((p: any) => { if (p?.type !== "reasoning" && typeof p?.text === "string") parts.push(p.text); });
          if (typeof m?.properties?.part?.text === "string") parts.push(m.properties.part.text);
          if (typeof m?.properties?.delta === "string") parts.push(m.properties.delta);
        };
        collect(props);
        collect((props as any)?.message);
        collect((props as any)?.part);
        if (parts.length === 0) { logIngest(`event ${t} no parts text`); return; }
        await ingestLive(parts);
      }
    },
    tool: {
      "positronic.init": {
        description: "init .positronic/brains (warn if exists, --force to overwrite; --live/--no-live)",
        args: {
          brain: z.string().optional().describe("brain name (default kairos)"),
          profile: z.string().optional().describe("retention balanced|long_term|archival|short_term"),
          embed: z.string().optional().describe("embed lexical|local|remote"),
          force: z.boolean().optional().describe("overwrite existing brain"),
          live: z.boolean().optional().describe("enable live ingestion (false for --no-live)"),
          dir: z.string().optional().describe("project directory"),
          brains: z.array(z.object({ name: z.string(), profile: z.string(), embed: z.string() })).optional().describe("explicit brains array (advanced)"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          let brains = args?.brains;
          if ((!brains || (Array.isArray(brains) && brains.length === 0)) && (args?.brain || args?.profile || args?.embed)) {
            brains = [{ name: args.brain || "kairos", profile: args.profile || "balanced", embed: args.embed || "lexical" }];
          }
          const argv: string[] = ["init"];
          if (Array.isArray(brains) && brains.length > 0) {
            for (const b of brains) {
              argv.push("--brain", b.name, "--profile", b.profile || "balanced", "--embed", b.embed || "lexical");
            }
          }
          if (args?.force) argv.push("--force");
          if (args?.live === true) argv.push("--live");
          if (args?.live === false) argv.push("--no-live");
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.recall": {
        description: "fused recall across federated brains",
        args: {
          dir: z.string().optional().describe("project directory"),
          text: z.string().describe("query text"),
          k: z.number().optional().describe("top-k"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const r = pai(["recall", args?.text ?? "", "--k", String(args?.k ?? 8), "--json"], { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.ask": {
        description: "object dossier",
        args: {
          dir: z.string().optional().describe("project directory"),
          object: z.string().describe("object name"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const r = pai(["ask", args?.object ?? "", "--json"], { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.info": {
        description: "positronic info --json (version, ENGRAM_TAG, brains, tiers)",
        args: {
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const r = pai(["info", "--json"], { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.stats": {
        description: "federated stats --json (episodes per brain)",
        args: {
          brain: z.string().optional().describe("brain name"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["stats"];
          if (args?.brain) argv.push("--brain", args.brain);
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.config": {
        description: "get/set .positronic/config.json (profile confirm gate, PII blocked)",
        args: {
          brain: z.string().optional().describe("brain name"),
          key: z.string().optional().describe("config key"),
          value: z.string().optional().describe("config value"),
          confirm: z.boolean().optional().describe("confirm overwrite"),
          showSecrets: z.boolean().optional().describe("reveal remote_key in set response"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["config"];
          if (args?.key) argv.push(args.key);
          if (args?.value) argv.push(args.value);
          if (args?.brain) argv.push("--brain", args.brain);
          if (args?.confirm) argv.push("--confirm");
          if (args?.showSecrets) argv.push("--show-secrets");
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.brain-test": {
        description: "smoke probe new_event -> activate",
        args: {
          brain: z.string().optional().describe("brain name"),
          k: z.number().optional().describe("top-k"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["brain-test", "--brain", args?.brain || "kairos", "--k", String(args?.k ?? 3)];
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.llm-stat": {
        description: "bge/llama tier health",
        args: {},
        execute: async () => {
          const r = pai(["llm-stat", "--json"]);
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.llm-setup": {
        description: "tier guide (606MB bge-m3)",
        args: {
          tier: z.string().optional().describe("tier 1|2|3"),
        },
        execute: async (args: any) => {
          const r = pai(["llm-setup", "--tier", args?.tier || "3", "--json"]);
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.update": {
        description: "deferred update --check/--status/--tail",
        args: {
          check: z.boolean().optional().describe("check for update"),
          pin: z.string().optional().describe("pin version"),
          status: z.string().optional().describe("job id"),
          tail: z.number().optional().describe("tail lines"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["update"];
          if (args?.check) argv.push("--check");
          if (args?.pin) argv.push("--pin", String(args.pin));
          if (args?.status) argv.push("--status", String(args.status));
          if (args?.tail !== undefined) argv.push("--tail", String(args.tail));
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.delete": {
        description: "delete brain (warn, --force to confirm)",
        args: {
          brain: z.string().optional().describe("brain name"),
          force: z.boolean().optional().describe("confirm delete"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["delete"];
          if (args?.brain) argv.push("--brain", args.brain);
          if (args?.force) argv.push("--force");
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.query": {
        description: "query brain: text/FTS, --sql, --anchors, --objects, --sightings",
        args: {
          brain: z.string().optional().describe("brain name"),
          text: z.string().optional().describe("query text"),
          query: z.string().optional().describe("alias for text"),
          sql: z.string().optional().describe("SQL query"),
          cue: z.string().optional().describe("cue text"),
          objects: z.boolean().optional().describe("list objects"),
          anchors: z.boolean().optional().describe("list anchors"),
          sightings: z.boolean().optional().describe("list sightings"),
          k: z.number().optional().describe("top-k"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["query"];
          const qtext = args?.text || args?.query;
          if (qtext) argv.push(qtext);
          if (args?.sql) argv.push("--sql", args.sql);
          if (args?.cue) argv.push("--cue", args.cue);
          if (args?.objects) argv.push("--objects");
          if (args?.anchors) argv.push("--anchors");
          if (args?.sightings) argv.push("--sightings");
          if (args?.k) argv.push("--k", String(args.k));
          if (args?.brain) argv.push("--brain", args.brain);
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.prune": {
        description: "run τ-decay pruning on the live brain",
        args: {
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const r = pai(["prune", "--json"], { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
      "positronic.consolidate": {
        description: "write a consolidation summary event",
        args: {
          text: z.string().describe("summary text"),
          arousal: z.number().optional().describe("arousal 0..1 (default 0.4)"),
          brain: z.string().optional().describe("brain name"),
          dir: z.string().optional().describe("project directory"),
        },
        execute: async (args: any, ctx: any) => {
          const dir = toolDir(args, ctx);
          const argv = ["consolidate", args?.text || ""];
          if (args?.arousal !== undefined) argv.push("--arousal", String(args.arousal));
          if (args?.brain) argv.push("--brain", args.brain);
          argv.push("--json");
          const r = pai(argv, { cwd: dir });
          return JSON.stringify(r.ok ? r.json : { error: r.error });
        },
      },
    },
    __positronic: {
      async recall(dir: string, text: string, k = 8) {
        const r = pai(["recall", text ?? "", "--k", String(k), "--json"], { cwd: dir });
        return r.ok ? r.json : [];
      },
      async ask(dir: string, objectName: string) {
        const r = pai(["ask", objectName ?? "", "--json"], { cwd: dir });
        return r.ok ? r.json : { found: false, episodes: [] };
      },
    },
  } as any;
}

const plugin = pluginFactory;

// ---------------------------------------------------------------------------
// v2 (opencode 2.x) entry - opencode 1.18 path above is UNTOUCHED.
// v2 loads `default { id, setup }`; tools register via ctx.tool.transform
// with { name, description, inputSchema, execute }; lifecycle/message flow
// arrives as event streams. Tool bodies + PAI bridge are shared verbatim.
// NOTE on the default export below: the tested reference (port/index-v2.js)
// replaced `export default pluginModule` outright. This merge keeps a
// DUAL shape `{ id, server, setup }` instead — `server` keeps the 1.18
// PluginModule path and tests/commands.test.ts + tests/test_plugin.ts green,
// `setup` lights up the 2.x path. If 2.x ever rejects the extra `server`
// key, drop it (one-line change) to match the reference exactly.
// ---------------------------------------------------------------------------
export function toInputSchema(args: any) {
  try {
    if (args && typeof args === "object" && !Array.isArray(args)) {
      // already a ZodObject (has .parse)? use it directly
      if (typeof (args as any).parse === "function") return args;
      return z.object(args);
    }
  } catch { /* fall through to empty schema */ }
  return z.object({});
}

export function wrapExecute(fn: (args: any, context: any) => Promise<any>) {
  return async (args: any, context: any) => {
    const raw = await fn(args, context);
    // v2 fix: the 2.0 tool bridge requires execute() to resolve to an OBJECT
    // and reads .content from it ("Te is not an Object" if given a string).
    // v1 verbs return bare strings/arrays, so normalize here.
    if (typeof raw === "string") return { content: [{ type: "text", text: raw }] };
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      if ((raw as any).content !== undefined) return raw;
      let text: string;
      try { text = JSON.stringify(raw); } catch { text = String(raw); }
      return { ...raw, content: [{ type: "text", text }] };
    }
    let t: string;
    try { t = JSON.stringify(raw); } catch { t = String(raw); }
    return { content: [{ type: "text", text: t }] };
  };
}

export function v2get(obj: any, ...paths: string[][]): any {
  for (const p of paths) {
    let cur = obj, ok = true;
    for (const k of p) { cur = cur == null ? undefined : cur[k]; if (cur === undefined) { ok = false; break; } }
    if (ok) return cur;
  }
  return undefined;
}

// Shared once-only assistant ingest across BOTH event vocabularies: a service
// emits message.updated deltas AND session.text.ended for the same turn, so
// without a common guard each final segment would encode twice. Key is the
// normalized text; the set is bounded for long-lived services.
const __posIngestSeen = new Set<string>();
export function v2ResetIngestState() { __posIngestSeen.clear(); }
export async function ingestAssistantOnce(text: unknown, dir: string, tag: string) {
  if (typeof text !== "string") return;
  const norm = text.replace(/\s+/g, " ").trim();
  if (!norm) return;
  const key = dir + "\n" + norm;
  if (__posIngestSeen.has(key)) { logIngest(`v2 ${tag} dedupe skip len=${text.length}`); return; }
  __posIngestSeen.add(key);
  if (__posIngestSeen.size > 5000) __posIngestSeen.clear();
  logIngest(`v2 ${tag} ingest len=${text.length}`);
  await ingestLive([text], dir, "assistant");
}

export async function handleV2Event(ev: any) {
  try {
    const t = ev && ev.type;
    if (!t) return;
    const props = (ev && (ev.data !== undefined ? ev.data : (ev.properties !== undefined ? ev.properties : ev))) || {};
    const cwd = process.cwd();
    // --- stable v2 vocabulary: session.* events (only vocabulary on 2.0.2+ service) ---
    if (t === "session.text.ended") {
      const txt = typeof props.text === "string" ? props.text : "";
      const d = (await sessionDir(props.sessionID)) || props.directory || projectRoot() || projectDir() || cwd;
      await ingestAssistantOnce(txt, d, t);
      return;
    }
    if (t === "session.compacted" || t === "session.compaction.ended") {
      const cdir = props.directory || projectRoot() || projectDir() || cwd;
      const sessionID = props.sessionID || v2get(props, ["session", "id"], ["id"]) || "";
      markCompacted(String(sessionID));
      void compactBrain(cdir, String(sessionID));
      return;
    }
    if (t === "session.execution.succeeded") return; // terminal noise, nothing to do
    if (t === "session.created") {
      const dir = v2get(props, ["directory"], ["info", "directory"], ["session", "directory"]) || projectRoot() || projectDir() || cwd;
      const probe = pai(["info", "--json"], { cwd: dir });
      logIngest("v2 session.created info probe dir=" + dir + " ok=" + probe.ok);
      return;
    }
    // --- legacy beta vocabulary: message.* (standalone `run` emits these; a
    // service pairs them with session.text.ended — the shared set above keeps
    // exactly-once across both, so this path stays enabled).
    if (typeof t === "string" && t.startsWith("message.")) {
      const msg = (props && (props.message || props.part)) || props;
      const role = String((msg && (msg.role || (msg.info && msg.info.role))) || props.role || "assistant").toLowerCase();
      if (role === "user") return;
      const parts = collectAssistantText(props.parts || msg.parts || [], msg);
      const delta = v2get(props, ["delta"], ["part", "delta"]);
      if (typeof delta === "string" && delta) parts.push(delta);
      if (parts.length === 0) return;
      await ingestAssistantOnce(
        parts.join("\n"),
        v2get(props, ["directory"], ["session", "directory"]) || projectRoot() || projectDir() || cwd,
        t,
      );
      return;
    }
    return;
  } catch (e: any) { logIngest("v2 event exception " + (e && e.message)); }
}

export async function setupV2(ctx: any) {
  // Fix 10 — PluginInput.directory/worktree is authoritative; env wins if set.
  // asDir: worktree may arrive as an object — only strings stick.
  setProjectRoot(
    process.env.POSITRONIC_PROJECT_DIR ||
    ctxRoot(ctx) ||
    undefined,
  );
  setPosClient(ctx && ctx.client);
  // Fix 11 diagnostics: beta builds may pass an empty ctx — surface exactly
  // what is available so the global-install root question is answerable.
  // JSON.stringify hides getters/class props, so probe keys + candidate reads.
  const probe = (v: any) => {
    if (v == null) return String(v);
    if (typeof v !== "object") return `${typeof v}:${String(v).slice(0, 40)}`;
    let keys = "";
    try { keys = Object.keys(v).slice(0, 8).join("|"); } catch { keys = "?"; }
    return `obj{${keys}}`;
  };
  logIngest(`v2 setup keys=${Object.keys(ctx || {}).join(",")} client=${typeof ctx?.client} session=${typeof ctx?.session} event=${typeof ctx?.event} tool=${typeof ctx?.tool}`);
  logIngest(`v2 setup probes directory=${probe(ctx?.directory)} worktree=${probe(ctx?.worktree)} location=${probe(ctx?.location)} project=${probe(ctx?.project)} client=${probe(ctx?.client)}`);
  logIngest(`v2 setup asDir dir=${asDir(ctx?.directory)} worktree=${asDir(ctx?.worktree)} location=${asDir(ctx?.location)} project=${asDir(ctx?.project)} ctxRoot=${ctxRoot(ctx)}`);
  logIngest(`v2 project root=${projectRoot() || "(unresolved)"} (env=${process.env.POSITRONIC_PROJECT_DIR ? "set" : "unset"} config=${configRoot() ? "set" : "unset"})`);
  const v1: any = await pluginFactory({});
  const defs = (v1 && v1.tool) || {};
  try {
    await ctx.tool.transform(async (editor: any) => {
      // NOTE: `const` in for..of binds per iteration — each tool keeps its
      // own def (the reference needed a factory because its loop used `var`).
      for (const [name, d] of Object.entries(defs) as [string, any][]) {
        editor.add({
          name,
          description: d.description || name,
          inputSchema: toInputSchema(d.args),
          execute: wrapExecute(d.execute),
        });
      }
      logIngest("v2 tools registered");
    });
  } catch (e: any) { logIngest("v2 tool register err " + (e && e.message)); }
  // Post-compaction brain-first reminder (bounded context hook — see
  // registerReminderHook; no-op with a log line when the host lacks it).
  registerReminderHook(ctx);
  // Fix 9 — slash commands via ctx.command.transform, GUARDED. Older beta
  // builds lack editor.add on commands and a raw call aborts the whole plugin
  // load; v2.0.2 supports .add. Each command re-prompts its verb (steer).
  try {
    if (ctx.command && typeof ctx.command.transform === "function") {
      await ctx.command.transform((editor: any) => {
        if (!editor || typeof editor.add !== "function") { logIngest("v2 command editor.add unavailable, skip"); return; }
        for (const cmd of positronicCommands) {
          const c = cmd as any;
          const cname = String(c.value || c.title);
          editor.add({
            name: cname,
            description: String(c.description || cname),
            execute: (function (cc: any) {
              return async (inv: any) => {
                const text = "/positronic " + cc.value + (inv && inv.prompt && inv.prompt.text ? " " + inv.prompt.text : "");
                try { await ctx.session.prompt({ sessionID: inv && inv.sessionID, text, delivery: (inv && inv.delivery) || "steer" }); }
                catch (e: any) { logIngest("v2 command prompt err " + (e && e.message)); }
              };
            })(c),
          });
        }
        logIngest(`v2 commands registered (${positronicCommands.length})`);
      });
    }
  } catch (e: any) { logIngest("v2 command register err " + (e && e.message)); }
  // Fix 8 — ONE subscription: subscribe() does not filter by argument, so
  // per-type pumps fanned every event out N× (dedupe hid it for ingest, but
  // probes/compactions ran N×). Guard re-entrant setup with an
  // AbortController and return its cleanup.
  if ((globalThis as any).__positronicV2Abort) {
    logIngest("v2 event pump already running, skip");
    return () => {};
  }
  // Check-and-set is synchronous (no await between), so concurrent setup()
  // calls can't both start pumps — the second sees the first's guard.
  const controller = new AbortController();
  (globalThis as any).__positronicV2Abort = controller;
  (async () => {
    try {
      const stream = await ctx.event.subscribe({ signal: controller.signal });
      for await (const ev of stream as any) { await handleV2Event(ev); }
    } catch (e: any) { logIngest("v2 subscribe err " + (e && e.message)); }
  })();
  // Clearing the global on cleanup: without this, an unload→reload cycle in
  // the same process would hit the guard above with no pump running (zombie).
  return () => {
    try { controller.abort(); }
    finally { if ((globalThis as any).__positronicV2Abort === controller) (globalThis as any).__positronicV2Abort = undefined; }
  };
}

// Support both Plugin (function) and PluginModule ({server}) exports — opencode 1.18+ prefers PluginModule.
// `setup` is the opencode 2.x entry (see v2 block above).
// patch-2 keeps the DUAL shape deliberately: its reference drops `server` for
// pure-v2, but that breaks the 1.18 path and shape tests for zero 2.x gain
// (proven harmless on live 2.0.2).
const pluginModule: any = { id: "positronic-opencode-plugin", server: pluginFactory, setup: setupV2 };

export const tui = async (api: any, _opts: any, _meta: any) => {
  const cmds: any[] = [...positronicCommands];
  try {
    if (api?.command?.register) api.command.register(() => cmds as any);
  } catch {}
  try {
    if (api?.keymap?.registerLayer) {
      api.keymap.registerLayer({
        commands: cmds.map((c: any) => ({ name: c.value, description: c.description })),
        bindings: [],
      } as any);
    }
  } catch {}
};

export { plugin };
export default pluginModule;