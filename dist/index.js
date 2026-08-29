import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { getEmbedder } from "./embed.js";
import { run as infoRun } from "./commands/info.js";
import { run as statsRun } from "./commands/stats.js";
import { run as cfgRun } from "./commands/config.js";
import { run as btRun } from "./commands/brainTest.js";
import { run as lsRun } from "./commands/llmStat.js";
import { run as lsuRun } from "./commands/llmSetup.js";
import { run as updRun } from "./commands/update.js";
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
        const script = `import sys; sys.path.insert(0, '${"/usr/local/devel/positronic/positronic-engram/engine/src"}'); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; from memeng.models import Event; from datetime import datetime, timezone; s=SQLiteStore(${JSON.stringify(db)}); e=MemoryEngine(s); r=e.new_event(Event(stream='positronic:${brainName}',kind='message',persons=['p_kairos'],wall=datetime.now(timezone.utc),features={'subject_norm': ${JSON.stringify(text.slice(0, 80))}, 'body_text': ${JSON.stringify(text)}, 'arousal': 0.5})); print(r.tau)`;
        const out = spawnSync("python3", ["-c", script], { timeout: 4000, encoding: "utf-8" });
        logIngest(`ingest done brain=${brainName} status=${out.status} stdout=${(out.stdout || "").slice(0, 200)} stderr=${(out.stderr || "").slice(0, 300)}`);
    }
    catch (e) {
        logIngest(`ingest exception brain=${brainName} err=${e?.message}`);
    }
}
async function pluginFactory(_input) {
    return {
        // Generic event — opencode delivers session/message events here
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
            if (t === "session.compacted")
                return;
            // message events: message.updated, message.part.updated, etc — ingest assistant text
            if (t.startsWith("message.")) {
                const props = event?.properties || event;
                const role = props?.role || props?.message?.role || (props?.part?.type === "text" ? "assistant" : undefined);
                // Only ingest assistant messages; skip user
                if (role && role !== "assistant" && role !== "assistant") {
                    // try to infer from event: if it's a user message, skip
                    if (String(role).toLowerCase() === "user") {
                        logIngest(`event skip: role=user type=${t}`);
                        return;
                    }
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
                args: {},
                execute: async (args, ctx) => {
                    const { run } = await import("./commands/init.js");
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await run({ dir, force: args?.force, json: true, live: args?.live, brains: args?.brains });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.recall": {
                description: "fused recall across federated brains",
                args: {},
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
                args: {},
                execute: async ({ dir, object }) => {
                    void dir;
                    void object;
                    return { found: false, episodes: [] };
                },
            },
            "positronic.info": {
                description: "positronic info --json (version, ENGRAM_TAG, brains, tiers)",
                args: {},
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await infoRun({ dir, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.stats": {
                description: "federated stats --json (episodes per brain)",
                args: {},
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await statsRun({ dir, brain: args?.brain, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.config": {
                description: "get/set .positronic/config.json (profile confirm gate, PII blocked)",
                args: {},
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await cfgRun({ dir, brain: args?.brain, key: args?.key, value: args?.value, confirm: args?.confirm, json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.brain-test": {
                description: "smoke probe new_event -> activate",
                args: {},
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
                args: {},
                execute: async (args) => {
                    const r = await lsuRun({ tier: args?.tier || "3", json: true });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.update": {
                description: "deferred update --check/--status/--tail",
                args: {},
                execute: async (args, ctx) => {
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await updRun({ check: args?.check, pin: args?.pin, status: args?.status, tail: args?.tail, json: true, dir });
                    return JSON.stringify(r.json);
                },
            },
            "positronic.delete": {
                description: "delete brain (warn, --force to confirm)",
                args: {},
                execute: async (args, ctx) => {
                    const { run } = await import("./commands/delete.js");
                    const dir = args?.dir || ctx?.directory || process.cwd();
                    const r = await run({ dir, brain: args?.brain, force: args?.force, json: true });
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
void plugin;
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
export default plugin;
