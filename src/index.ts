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
import { z } from "zod";

// Every verb is delegated to the positronic_ai Python package (PAI, Task 8).
// No python import in TS — always spawnSync `python3 -m positronic_ai <verb>`.
function pai(argv: string[], opts?: { cwd?: string; timeout?: number }): { ok: boolean; json: any; error?: string } {
  try {
    const r = spawnSync("python3", ["-m", "positronic_ai", ...argv], {
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
  const dir = dirHint || process.cwd();
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

async function compactBrain(dir: string, sessionID: string) {
  try {
    const pr = pai(["prune", "--json"], { cwd: dir });
    logPrune(`compact prune dir=${dir} ok=${pr.ok} ${JSON.stringify(pr.json ?? pr.error).slice(0, 200)}`);
    const marker = `session compacted ${sessionID}`.trim();
    if (marker) {
      const cr = pai(["consolidate", marker, "--arousal", "0.2"], { cwd: dir });
      logPrune(`compact marker dir=${dir} ok=${cr.ok} ${JSON.stringify(cr.json ?? cr.error).slice(0, 200)}`);
    }
  } catch (e: any) {
    logPrune(`compact exception dir=${dir} err=${e?.message}`);
  }
}

async function pluginFactory(_input: any) {
  return {
    // chat.message is the correct hook for live ingestion in opencode 1.18+ (event bus only has session.*)
    "chat.message": async (_input: any, output: any) => {
      try {
        const parts: string[] = [];
        const msg = output?.message;
        const outParts: any[] = output?.parts || [];
        // Collect text from output.parts (assistant message being delivered to UI)
        for (const p of outParts) {
          if (typeof p?.text === "string" && p.text.trim()) parts.push(p.text);
          if (typeof p?.part?.text === "string") parts.push(p.part.text);
        }
        if (msg && typeof (msg as any)?.text === "string") parts.push((msg as any).text);
        // Capture both sides: ingest user AND assistant messages, role-tagged.
        // User-side capture is gated by config capture_user (privacy).
        const role = (msg as any)?.role || (msg as any)?.info?.role || "assistant";
        const isUser = String(role).toLowerCase() === "user";
        if (parts.length === 0) {
          logIngest(`chat.message no parts session=${_input?.sessionID}`);
          return;
        }
        logIngest(`chat.message ingest role=${role} len=${parts.join("\n").length} session=${_input?.sessionID}`);
        const sessionDir = _input?.directory || _input?.workspace?.directory || process.cwd();
        await ingestLive(parts, sessionDir, isUser ? "user" : "assistant");
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
        const dir = (event as any)?.properties?.directory || (event as any)?.directory || process.cwd();
        const probe = pai(["info", "--json"], { cwd: dir });
        logIngest(`session.created info probe dir=${dir} ok=${probe.ok}`);
        return;
      }
      if (t === "session.compacted") {
        const dir = (event as any)?.properties?.info?.directory || (event as any)?.properties?.directory || (event as any)?.directory || process.cwd();
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
          if (typeof m?.text === "string") parts.push(m.text);
          if (typeof m?.content === "string") parts.push(m.content);
          if (Array.isArray(m?.parts)) m.parts.forEach((p: any) => { if (typeof p?.text === "string") parts.push(p.text); else if (typeof p === "string") parts.push(p); });
          if (Array.isArray(m?.message?.parts)) m.message.parts.forEach((p: any) => { if (typeof p?.text === "string") parts.push(p.text); });
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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
          const dir = args?.dir || ctx?.directory || process.cwd();
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

// Support both Plugin (function) and PluginModule ({server}) exports — opencode 1.18+ prefers PluginModule
const pluginModule: any = { id: "positronic-opencode-plugin", server: pluginFactory };

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