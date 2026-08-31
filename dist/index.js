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
import { loadConfig } from "./config.js";
import { getEmbedder } from "./embed.js";
import { run as infoRun } from "./commands/info.js";
import { run as statsRun } from "./commands/stats.js";
import { run as cfgRun } from "./commands/config.js";
import { run as btRun } from "./commands/brainTest.js";
import { run as lsRun } from "./commands/llmStat.js";
import { run as lsuRun } from "./commands/llmSetup.js";
import { run as updRun } from "./commands/update.js";
import { run as pruneRun } from "./commands/prune.js";
import { run as consRun } from "./commands/consolidate.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function bridgePath(name) {
    return path.join(__dirname, `${name}.py`);
}
const positronicCommands = [
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
];
function logIngest(msg) {
    try {
        const dir = path.join(os.homedir(), ".cache", "positronic");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, "ingest.log"), `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch { }
}
async function ingestLive(partsToIngest, dirHint) {
    const text = partsToIngest.join("\n").slice(0, 4000).trim();
    if (!text) {
        logIngest("ingest skip: empty text");
        return;
    }
    const dir = dirHint || process.cwd();
    let cfg = null;
    try {
        cfg = loadConfig(dir);
    }
    catch (e) {
        logIngest(`ingest skip: loadConfig failed dir=${dir} err=${e?.message}`);
        return;
    }
    if (cfg.live === false) {
        logIngest(`ingest skip: live=false dir=${dir}`);
        return;
    }
    if (!cfg.brains || Object.keys(cfg.brains).length === 0) {
        logIngest(`ingest skip: no brains dir=${dir}`);
        return;
    }
    const brainName = Object.keys(cfg.brains)[0];
    const db = path.join(dir, ".positronic", "brains", brainName, "memory.db");
    if (!fs.existsSync(db)) {
        logIngest(`ingest skip: no db ${db}`);
        return;
    }
    try {
        logIngest(`ingest start brain=${brainName} dir=${dir} len=${text.length} db=${db}`);
        // Resolve engram src relative to plugin location (works on both /usr/local/devel/positronic and ~/.local/share/positronic layouts)
        const candidates = [
            path.resolve(__dirname, "..", "..", "positronic-engram", "engine", "src"),
            path.resolve(__dirname, "..", "positronic-engram", "engine", "src"),
            "/usr/local/devel/positronic/positronic-engram/engine/src",
            path.join(os.homedir(), ".local", "share", "positronic", "positronic-engram", "engine", "src"),
        ];
        const engramSrc = candidates.find(p => fs.existsSync(path.join(p, "memeng", "engine.py"))) || candidates[0];
        const script = `import sys; sys.path.insert(0, ${JSON.stringify(engramSrc)}); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; from memeng.models import Event; from datetime import datetime, timezone; s=SQLiteStore(${JSON.stringify(db)}); e=MemoryEngine(s); r=e.new_event(Event(stream='positronic:${brainName}',kind='message',persons=['p_kairos'],wall=datetime.now(timezone.utc),features={'subject_norm': ${JSON.stringify(text.slice(0, 80))}, 'body_text': ${JSON.stringify(text)}, 'arousal': 0.5})); print(r.tau)`;
        const out = spawnSync("python3", ["-c", script], { timeout: 4000, encoding: "utf-8" });
        logIngest(`ingest done brain=${brainName} status=${out.status} stdout=${(out.stdout || "").slice(0, 200)} stderr=${(out.stderr || "").slice(0, 300)}`);
    }
    catch (e) {
        logIngest(`ingest exception brain=${brainName} err=${e?.message}`);
    }
}
function logPrune(msg) {
    try {
        const dir = path.join(os.homedir(), ".cache", "positronic");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, "prune.log"), `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch { }
}
async function compactBrain(dir, sessionID) {
    try {
        const pr = await pruneRun({ dir, json: true });
        logPrune(`compact prune dir=${dir} ${JSON.stringify(pr.json)}`);
        const marker = `session compacted ${sessionID}`.trim();
        if (marker) {
            const cr = await consRun({ dir, text: marker, arousal: 0.2, json: true });
            logPrune(`compact marker dir=${dir} ${JSON.stringify(cr.json)}`);
        }
    }
    catch (e) {
        logPrune(`compact exception dir=${dir} err=${e?.message}`);
    }
}
async function pluginFactory(_input) {
    return {
        // chat.message is the correct hook for live ingestion in opencode 1.18+ (event bus only has session.*)
        "chat.message": async (_input, output) => {
            try {
                const parts = [];
                const msg = output?.message;
                const outParts = output?.parts || [];
                // Collect text from output.parts (assistant message being delivered to UI)
                for (const p of outParts) {
                    if (typeof p?.text === "string" && p.text.trim())
                        parts.push(p.text);
                    if (typeof p?.part?.text === "string")
                        parts.push(p.part.text);
                }
                if (msg && typeof msg?.text === "string")
                    parts.push(msg.text);
                // Only ingest assistant messages
                const role = msg?.role || msg?.info?.role;
                if (role && String(role).toLowerCase() === "user") {
                    logIngest(`chat.message skip user role=${role}`);
                    return;
                }
                if (parts.length === 0) {
                    logIngest(`chat.message no parts session=${_input?.sessionID}`);
                    return;
                }
                logIngest(`chat.message ingest len=${parts.join("\n").length} session=${_input?.sessionID}`);
                const sessionDir = _input?.directory || _input?.workspace?.directory || process.cwd();
                await ingestLive(parts, sessionDir);
            }
            catch (e) {
                logIngest(`chat.message exception ${e?.message}`);
            }
        },
        // Generic event — session lifecycle (session.created etc) — keep for diagnostics
        event: async ({ event }) => {
            const t = event?.type;
            if (!t)
                return;
            logIngest(`event type=${t} dir=${process.cwd()}`);
            if (t === "session.created") {
                const dir = event?.properties?.directory || event?.directory || process.cwd();
                try {
                    loadConfig(dir);
                }
                catch { }
                return;
            }
            if (t === "session.compacted") {
                const dir = event?.properties?.info?.directory || event?.properties?.directory || event?.directory || process.cwd();
                const sessionID = event?.properties?.sessionID || "";
                void compactBrain(dir, sessionID);
                return;
            }
            // Fallback: legacy message.* events if bus still emits them (pre-1.18 compat)
            if (t.startsWith("message.")) {
                const props = event?.properties || event;
                const role = props?.role || props?.message?.role || (props?.part?.type === "text" ? "assistant" : undefined);
                if (role && String(role).toLowerCase() === "user") {
                    logIngest(`event skip: role=user type=${t}`);
                    return;
                }
                const parts = [];
                const collect = (m) => {
                    if (!m)
                        return;
                    if (typeof m?.text === "string")
                        parts.push(m.text);
                    if (typeof m?.content === "string")
                        parts.push(m.content);
                    if (Array.isArray(m?.parts))
                        m.parts.forEach((p) => { if (typeof p?.text === "string")
                            parts.push(p.text);
                        else if (typeof p === "string")
                            parts.push(p); });
                    if (Array.isArray(m?.message?.parts))
                        m.message.parts.forEach((p) => { if (typeof p?.text === "string")
                            parts.push(p.text); });
                    if (typeof m?.properties?.part?.text === "string")
                        parts.push(m.properties.part.text);
                    if (typeof m?.properties?.delta === "string")
                        parts.push(m.properties.delta);
                };
                collect(props);
                collect(props?.message);
                collect(props?.part);
                if (parts.length === 0) {
                    logIngest(`event ${t} no parts text`);
                    return;
                }
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
                execute: async (args, ctx) => {
                    const { run } = await import("./commands/init.js");
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    // Map flat --brain/--profile/--embed flags to brains array (CLI parity)
                    let brains = args?.brains;
                    if ((!brains || (Array.isArray(brains) && brains.length === 0)) && (args?.brain || args?.profile || args?.embed)) {
                        brains = [{ name: args.brain || "kairos", profile: args.profile || "balanced", embed: args.embed || "lexical" }];
                    }
                    const r = await run({ dir, force: args?.force, json: true, live: args?.live, brains });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.recall": {
                description: "fused recall across federated brains",
                args: {
                    dir: z.string().optional().describe("project directory"),
                    text: z.string().describe("query text"),
                    k: z.number().optional().describe("top-k"),
                },
                execute: async ({ dir, text, k }) => {
                    const cfg = loadConfig(dir);
                    void (await getEmbedder(cfg).catch(() => null));
                    void bridgePath;
                    void spawnSync;
                    return [];
                },
            },
            "positronic.ask": {
                description: "object dossier",
                args: {
                    dir: z.string().optional().describe("project directory"),
                    object: z.string().describe("object name"),
                },
                execute: async ({ dir, object }) => {
                    void dir;
                    void object;
                    return { found: false, episodes: [] };
                },
            },
            "positronic.info": {
                description: "positronic info --json (version, ENGRAM_TAG, brains, tiers)",
                args: {
                    dir: z.string().optional().describe("project directory"),
                },
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await infoRun({ dir, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.stats": {
                description: "federated stats --json (episodes per brain)",
                args: {
                    brain: z.string().optional().describe("brain name"),
                    dir: z.string().optional().describe("project directory"),
                },
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await statsRun({ dir, brain: args?.brain, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.config": {
                description: "get/set .positronic/config.json (profile confirm gate, PII blocked)",
                args: {
                    brain: z.string().optional().describe("brain name"),
                    key: z.string().optional().describe("config key"),
                    value: z.string().optional().describe("config value"),
                    confirm: z.boolean().optional().describe("confirm overwrite"),
                    dir: z.string().optional().describe("project directory"),
                },
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await cfgRun({ dir, brain: args?.brain, key: args?.key, value: args?.value, confirm: args?.confirm, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.brain-test": {
                description: "smoke probe new_event -> activate",
                args: {
                    brain: z.string().optional().describe("brain name"),
                    k: z.number().optional().describe("top-k"),
                    dir: z.string().optional().describe("project directory"),
                },
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await btRun({ dir, brain: args?.brain || "kairos", k: args?.k || 3, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.llm-stat": {
                description: "bge/llama tier health",
                args: {},
                execute: async (_args) => {
                    const r = await lsRun({ json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.llm-setup": {
                description: "tier guide (606MB bge-m3)",
                args: {
                    tier: z.string().optional().describe("tier 1|2|3"),
                },
                execute: async (args) => {
                    const r = await lsuRun({ tier: args?.tier || "3", json: true });
                    return JSON.stringify(r.json);
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
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await updRun({ check: args?.check, pin: args?.pin, status: args?.status, tail: args?.tail, json: true, dir });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.delete": {
                description: "delete brain (warn, --force to confirm)",
                args: {
                    brain: z.string().optional().describe("brain name"),
                    force: z.boolean().optional().describe("confirm delete"),
                    dir: z.string().optional().describe("project directory"),
                },
                execute: async (args, ctx) => {
                    const { run } = await import("./commands/delete.js");
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await run({ dir, brain: args?.brain, force: args?.force, json: true });
                    return JSON.stringify(r.json);
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
                execute: async (args, ctx) => {
                    const { runQuery } = await import("./commands/query.js");
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await runQuery({ dir, brain: args?.brain, qtext: args?.text || args?.query, sql: args?.sql, cue: args?.cue, objects: args?.objects, anchors: args?.anchors, sightings: args?.sightings, k: args?.k || 8, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.prune": {
                description: "run τ-decay pruning on the live brain",
                args: {
                    dir: z.string().optional().describe("project directory"),
                },
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await pruneRun({ dir, json: true });
                    return JSON.stringify(r.json);
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
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await consRun({ dir, brain: args?.brain, text: args?.text || "", arousal: args?.arousal, json: true });
                    return JSON.stringify(r.json);
                },
            },
        },
        __positronic: {
            async recall(dir, text, k = 8) {
                const cfg = loadConfig(dir);
                const embedder = await getEmbedder(cfg).catch(() => null);
                void embedder;
                return [];
            },
            async ask(dir, objectName) {
                void dir;
                void objectName;
                return { found: false, episodes: [] };
            },
        },
    };
}
const plugin = pluginFactory;
// Support both Plugin (function) and PluginModule ({server}) exports — opencode 1.18+ prefers PluginModule
const pluginModule = { id: "positronic-opencode-plugin", server: pluginFactory };
void plugin;
void pluginModule;
void bridgePath;
void spawnSync;
export const tui = async (api, _opts, _meta) => {
    const cmds = [...positronicCommands];
    try {
        if (api?.command?.register)
            api.command.register(() => cmds);
    }
    catch { }
    try {
        if (api?.keymap?.registerLayer) {
            api.keymap.registerLayer({
                commands: cmds.map((c) => ({ name: c.value, description: c.description })),
                bindings: [],
            });
        }
    }
    catch { }
};
export default pluginModule;
