// =====================================================================
// Project Positronic — Polytemporal Cognitive Engram Memory Substrate
// Copyright (C) 2026 Shing Wong. All Rights Reserved.
// =====================================================================
// This program is DUAL-LICENSED. You may redistribute and/or modify it 
// under the terms of the GNU Affero General Public License as published by the 
// Free Software Foundation, either version 3 of the License, or (at your 
// option) any later version.
//
// Alternatively, commercial entities, multi-tenant instances, and Managed 
// Service Providers (MSPs) may utilize this program under a separate, 
// proprietary Commercial License Waiver issued directly by the copyright 
// holder, completely exempt from the network-use copyleft restrictions of 
// the AGPLv3 Section 13.
//
// This program is distributed in the hope that it will be useful, but 
// WITHOUT ANY WARRANTY; without even the implied warranty of 
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License 
// along with this program. If not, see <https://gnu.org>.
// =====================================================================

// Regression tests for the opencode 2.x entry (setupV2 + helpers).
// Guards the two bugs the v2 port exists to fix:
//  1. execute() resolving a bare string -> "Te is not an Object" on 2.x
//  2. per-delta / re-fire duplicate ingestion (one episode per message)

import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";
import plugin, {
  toInputSchema,
  wrapExecute,
  v2get,
  handleV2Event,
  setupV2,
  ingestAssistantOnce,
  v2ResetIngestState,
  paiPython,
  projectDir,
  projectRoot,
  setProjectRoot,
  v2ResetProjectRoot,
  ctxRoot,
  configRoot,
  sessionDir,
  setPosClient,
  v2ResetSessionDirs,
  toolDir,
  asDir,
} from "../src/index.js";

function fakeCtx(opts?: { commands?: boolean; commandAdd?: boolean }) {
  const added: any[] = [];
  const subscribed: any[] = [];
  const cmdAdded: any[] = [];
  async function* empty() {}
  const command =
    opts?.commands === false
      ? undefined
      : {
          transform: async (fn: any) => {
            await fn(opts?.commandAdd === false ? {} : { add: (c: any) => cmdAdded.push(c) });
          },
        };
  return {
    added,
    subscribed,
    cmdAdded,
    ctx: {
      tool: { transform: async (fn: any) => { await fn({ add: (t: any) => added.push(t) }); } },
      event: { subscribe: async (arg: any) => { subscribed.push(arg); return empty(); } },
      ...(command ? { command } : {}),
    },
  };
}

function seed(dir: string) {
  execSync(`python3 -m positronic_ai init --brain kairos --profile balanced --embed lexical`, { cwd: dir, stdio: "ignore" });
}

function recallCount(dir: string, cue: string): number {
  const out = execSync(`python3 -m positronic_ai recall "${cue}" --json`, { cwd: dir, encoding: "utf-8" });
  return (JSON.parse(out).results || []).length;
}

function msgEvent(dir: string, role: string, text: string) {
  return {
    type: "message.updated",
    data: {
      directory: dir,
      message: { role },
      parts: [{ type: "text", text }],
    },
  };
}

describe("toInputSchema", () => {
  test("converts an args shape to a ZodObject", () => {
    const s = toInputSchema({ text: z.string(), k: z.number().optional() });
    expect(typeof s.parse).toBe("function");
    expect(s.parse({ text: "hi" })).toEqual({ text: "hi" });
  });

  test("passes an existing ZodObject through untouched", () => {
    const already = z.object({ a: z.string() });
    expect(toInputSchema(already)).toBe(already);
  });

  test("falls back to an empty schema for absent/garbage args", () => {
    for (const bad of [undefined, null, 42, "x", []]) {
      const s = toInputSchema(bad);
      expect(typeof s.parse).toBe("function");
      expect(s.parse({})).toEqual({});
    }
  });
});

describe("wrapExecute", () => {
  test("wraps a bare string in .content", async () => {
    const out = await wrapExecute(async () => "hello")({}, {});
    expect(out).toEqual({ content: [{ type: "text", text: "hello" }] });
  });

  test("wraps arrays in .content as JSON", async () => {
    const out = await wrapExecute(async () => [1, 2])( {}, {});
    expect(out.content[0].text).toBe("[1,2]");
  });

  test("spreads plain objects and adds .content", async () => {
    const out = await wrapExecute(async () => ({ a: 1 }))( {}, {});
    expect(out.a).toBe(1);
    expect(out.content[0].text).toBe('{"a":1}');
  });

  test("passes objects that already carry .content through", async () => {
    const raw = { content: [{ type: "text", text: "kept" }] };
    expect(await wrapExecute(async () => raw)({}, {})).toBe(raw);
  });
});

describe("v2get", () => {
  test("returns the first matching path, undefined otherwise", () => {
    const o = { session: { directory: "/x" } };
    expect(v2get(o, ["directory"], ["session", "directory"])).toBe("/x");
    expect(v2get(o, ["missing"], ["also", "missing"])).toBeUndefined();
    expect(v2get(null, ["a"])).toBeUndefined();
  });
});

describe("setupV2", () => {
  test("default export carries both the v1 server and the v2 setup", () => {
    expect((plugin as any).id).toBe("positronic-opencode-plugin");
    expect(typeof (plugin as any).server).toBe("function");
    expect(typeof (plugin as any).setup).toBe("function");
  });

  test("registers 14 tools with Zod schemas and .content executes", async () => {
    const f = fakeCtx();
    await setupV2(f.ctx);
    expect(f.added).toHaveLength(14);
    for (const t of f.added) expect(typeof t.inputSchema?.parse).toBe("function");
    const byName = Object.fromEntries(f.added.map((t: any) => [t.name, t]));
    const info = await byName["positronic.info"].execute({ dir: "/tmp" }, {});
    const stats = await byName["positronic.stats"].execute({ dir: "/tmp" }, {});
    expect(Array.isArray(info?.content)).toBe(true);
    expect(Array.isArray(stats?.content)).toBe(true);
    expect(JSON.parse(info.content[0].text)).toHaveProperty("version");
    // per-tool closure binding: no "last verb wins"
    expect(info.content[0].text).not.toBe(stats.content[0].text);
  });

  test("second setup re-registers tools but starts no new pump", async () => {
    // pump guard is process-global; reset so this test owns the lifecycle
    (globalThis as any).__positronicV2Abort = undefined;
    const f = fakeCtx();
    const cleanup = await setupV2(f.ctx);
    expect(f.subscribed).toHaveLength(1);
    expect(typeof cleanup).toBe("function");
    await setupV2(f.ctx);
    expect(f.subscribed).toHaveLength(1);
  });

  test("cleanup clears the guard: reload starts a new pump", async () => {
    (globalThis as any).__positronicV2Abort = undefined;
    const f = fakeCtx();
    const cleanup = await setupV2(f.ctx);
    expect(f.subscribed).toHaveLength(1);
    (cleanup as () => void)();
    await setupV2(f.ctx);
    expect(f.subscribed).toHaveLength(2);
  });

  test("concurrent setups start a single pump", async () => {
    (globalThis as any).__positronicV2Abort = undefined;
    const f = fakeCtx();
    await Promise.all([setupV2(f.ctx), setupV2(f.ctx)]);
    expect(f.subscribed).toHaveLength(1);
  });

  test("registers 12 slash commands when the command editor supports add", async () => {
    (globalThis as any).__positronicV2Abort = undefined;
    const f = fakeCtx();
    await setupV2(f.ctx);
    expect(f.cmdAdded).toHaveLength(12);
    expect(f.cmdAdded[0].name).toBe("positronic:init");
  });

  test("survives a command editor without add, and no command API at all", async () => {
    (globalThis as any).__positronicV2Abort = undefined;
    await setupV2(fakeCtx({ commandAdd: false }).ctx); // transform ok, add missing
    (globalThis as any).__positronicV2Abort = undefined;
    await setupV2(fakeCtx({ commands: false }).ctx); // no ctx.command
  });
});

describe("handleV2Event ingestion", () => {
  let dir: string;
  let tag: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pos-v2-"));
    seed(dir);
    tag = `v2test ${Math.random().toString(36).slice(2, 9)}`;
    // reset the shared ingest-once set between tests
    v2ResetIngestState();
  });

  test("one assistant message ingests exactly once, re-fire deduped", async () => {
    const text = `${tag} octopus courier routes parcels by tide`;
    await handleV2Event(msgEvent(dir, "assistant", text));
    expect(recallCount(dir, tag)).toBe(1);
    await handleV2Event(msgEvent(dir, "assistant", text));
    await handleV2Event(msgEvent(dir, "assistant", text));
    expect(recallCount(dir, tag)).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("user messages are skipped", async () => {
    await handleV2Event(msgEvent(dir, "user", `${tag} user chatter stays out`));
    expect(recallCount(dir, tag)).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("session.text.ended ingests, whitespace variants dedupe", async () => {
    const text = `${tag} harbor ledger closes at dusk`;
    await handleV2Event({ type: "session.text.ended", data: { directory: dir, text } });
    expect(recallCount(dir, tag)).toBe(1);
    await handleV2Event({ type: "session.text.ended", data: { directory: dir, text: `  ${text}\n` } });
    expect(recallCount(dir, tag)).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("message.updated + session.text.ended for the same turn encode once", async () => {
    const text = `${tag} lighthouse keepers file tide reports`;
    await handleV2Event(msgEvent(dir, "assistant", text));
    await handleV2Event({ type: "session.text.ended", data: { directory: dir, text } });
    expect(recallCount(dir, tag)).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("session.execution.succeeded is terminal noise", async () => {
    await handleV2Event({ type: "session.execution.succeeded", data: { directory: dir } });
    expect(recallCount(dir, tag)).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("session.compaction.ended runs prune + writes a consolidation marker", async () => {
    const text = `${tag} compaction boundary keeps decisions`;
    await handleV2Event(msgEvent(dir, "assistant", text));
    await handleV2Event({ type: "session.compaction.ended", data: { sessionID: "s1", directory: dir } });
    // compactBrain is fire-and-forget: poll for the marker (prune + consolidate are sync spawns).
    let found = "";
    for (let i = 0; i < 50 && !found; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const out = execSync(
        `python3 -m positronic_ai query --sql "SELECT json_extract(features_json,'$.body_text') t FROM episode WHERE kind='consolidation' ORDER BY tau DESC LIMIT 1" --json`,
        { cwd: dir, encoding: "utf-8" },
      );
      const rows = JSON.parse(out).results || [];
      if (rows.length > 0) found = rows[0]?.t || "";
    }
    expect(found.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("legacy session.compacted still compacts", async () => {
    const text = `${tag} legacy compact event still compacts`;
    await handleV2Event(msgEvent(dir, "assistant", text));
    await handleV2Event({ type: "session.compacted", data: { sessionID: "s1", directory: dir } });
    let found = "";
    for (let i = 0; i < 50 && !found; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const out = execSync(
        `python3 -m positronic_ai query --sql "SELECT json_extract(features_json,'$.body_text') t FROM episode WHERE kind='consolidation' ORDER BY tau DESC LIMIT 1" --json`,
        { cwd: dir, encoding: "utf-8" },
      );
      const rows = JSON.parse(out).results || [];
      if (rows.length > 0) found = rows[0]?.t || "";
    }
    expect(found.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("Fix 6+7 — python and directory resolution", () => {
  test("paiPython falls back to python3 when no venv exists here", () => {
    expect(paiPython()).toBe("python3");
  });

  test("toolDir prefers args.dir, then ctx.directory, then a fallback", () => {
    expect(toolDir({ dir: "/a" }, { directory: "/b" })).toBe("/a");
    expect(toolDir({}, { directory: "/b" })).toBe("/b");
    expect(typeof toolDir({}, {})).toBe("string");
  });

  test("projectDir resolves a directory or undefined, never throws", () => {
    const d = projectDir();
    expect(d === undefined || typeof d === "string").toBe(true);
  });

  test("projectDir claims only dirs containing .positronic", () => {
    // repo umbrella has .positronic (or not) — either way it must not throw,
    // and a bare temp dir must never be claimed even if path math landed there.
    const d = projectDir();
    if (d !== undefined) {
      expect(existsSync(join(d, ".positronic"))).toBe(true);
    }
  });
});

// Fix 10 — project root from PluginInput (global-install safe), not file
// location. ORDER MATTERS within this block: the env test runs first because
// once setupV2 sets the module root it takes precedence over the env var
// (same precedence as production).
describe("Fix 10 — project root from PluginInput", () => {
  test("ingest dir resolves from POSITRONIC_PROJECT_DIR, not file location", async () => {
    const proj = mkdtempSync(join(tmpdir(), "pos-fix10-"));
    seed(proj);
    const tag = `fix10 ${Math.random().toString(36).slice(2, 9)} estuary relay logs tide tables`;
    const text = `${tag} — Fix 10 global-install ingest must land in the project root`;
    v2ResetIngestState();
    const prev = process.env.POSITRONIC_PROJECT_DIR;
    process.env.POSITRONIC_PROJECT_DIR = proj;
    try {
      // v2 session.text.ended carries no directory — must land in $proj.
      await handleV2Event({ type: "session.text.ended", data: { sessionID: "s1", text } });
      expect(recallCount(proj, tag)).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.POSITRONIC_PROJECT_DIR;
      else process.env.POSITRONIC_PROJECT_DIR = prev;
      rmSync(proj, { recursive: true, force: true });
    }
  });

  test("resolves ingest dir from PluginInput.directory, not file location", async () => {
    // env wins over ctx.directory in production — clear it so this test
    // proves the ctx path even on dev boxes that export the variable.
    const prev = process.env.POSITRONIC_PROJECT_DIR;
    delete process.env.POSITRONIC_PROJECT_DIR;
    const proj = mkdtempSync(join(tmpdir(), "pos-fix10-dir-"));
    mkdirSync(join(proj, ".positronic"), { recursive: true });
    try {
      (globalThis as any).__positronicV2Abort = undefined;
      const f = fakeCtx();
      await setupV2({ ...f.ctx, directory: proj, worktree: proj });
      expect(projectRoot()).toBe(proj);
    } finally {
      rmSync(proj, { recursive: true, force: true });
      if (prev !== undefined) process.env.POSITRONIC_PROJECT_DIR = prev;
    }
  });

  test("sessionDir returns undefined without a client, never throws", async () => {
    await expect(sessionDir(undefined)).resolves.toBeUndefined();
    await expect(sessionDir("nope")).resolves.toBeUndefined();
  });

  test("setProjectRoot ignores empty input", () => {
    const before = projectRoot();
    setProjectRoot(undefined);
    setProjectRoot("");
    expect(projectRoot()).toBe(before);
  });

  test("asDir unwraps strings, rejects objects without path-likes", () => {
    expect(asDir("/proj/a")).toBe("/proj/a");
    expect(asDir("")).toBeUndefined();
    expect(asDir(undefined)).toBeUndefined();
    expect(asDir({ path: "/proj/wt" })).toBe("/proj/wt");
    expect(asDir({ id: "abc" })).toBeUndefined();
  });

  test("setProjectRoot ignores non-string input (live [object Object] bug)", () => {
    const before = projectRoot();
    setProjectRoot({ path: "" } as any);
    setProjectRoot({ id: "abc" } as any);
    expect(projectRoot()).toBe(before);
  });
});

// Fix 11 — beta builds pass no directory at setup; make the root resolvable
// from env / a config file, wire tools to it, and make sessionDir cacheable.
describe("Fix 11 — explicit root + toolDir parity + sessionDir cache", () => {
  const savedHome = process.env.HOME;
  const savedEnv = process.env.POSITRONIC_PROJECT_DIR;

  beforeEach(() => {
    v2ResetProjectRoot();
    v2ResetSessionDirs();
    delete process.env.POSITRONIC_PROJECT_DIR;
  });

  afterAll(() => {
    v2ResetProjectRoot();
    v2ResetSessionDirs();
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedEnv === undefined) delete process.env.POSITRONIC_PROJECT_DIR;
    else process.env.POSITRONIC_PROJECT_DIR = savedEnv;
  });

  test("toolDir now consults projectRoot()/env (was ignoring POSITRONIC_PROJECT_DIR)", () => {
    process.env.POSITRONIC_PROJECT_DIR = "/tmp/envproj";
    expect(toolDir({}, {})).toBe("/tmp/envproj");
    // explicit args.dir still wins
    expect(toolDir({ dir: "/a" }, { directory: "/b" })).toBe("/a");
    expect(toolDir({}, { directory: "/b" })).toBe("/b");
  });

  test("configRoot reads $HOME/.config/positronic/project (first line)", () => {
    const home = mkdtempSync(join(tmpdir(), "pos-home-"));
    process.env.HOME = home;
    expect(configRoot()).toBeUndefined();
    const dir = join(home, ".config", "positronic");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "project"), "\n  /proj/from-config  \nignored\n");
    expect(configRoot()).toBe("/proj/from-config");
    expect(projectRoot()).toBe("/proj/from-config");
    rmSync(home, { recursive: true, force: true });
  });

  test("sessionDir caches sessionID→dir and calls the client once", async () => {
    let calls = 0;
    setPosClient({ session: { get: async () => { calls++; return { data: { directory: "/proj/s1" } }; } } });
    expect(await sessionDir("s1")).toBe("/proj/s1");
    expect(await sessionDir("s1")).toBe("/proj/s1");
    expect(calls).toBe(1);
  });

  test("sessionDir returns undefined with no client, never throws", async () => {
    expect(await sessionDir("nope")).toBeUndefined();
  });

  test("ctxRoot reads directory/worktree/location/project, incl. getter objects", () => {
    expect(ctxRoot({ directory: "/d" })).toBe("/d");
    expect(ctxRoot({ worktree: { directory: "/w" } })).toBe("/w");
    expect(ctxRoot({ worktree: { path: "/wp" } })).toBe("/wp");
    expect(ctxRoot({ location: { path: "/l" } })).toBe("/l");
    expect(ctxRoot({ project: { root: "/p" } })).toBe("/p");
    expect(ctxRoot({ worktree: {} })).toBeUndefined();
    expect(ctxRoot({})).toBeUndefined();
    // getter-backed object (JSON.stringify shows {})
    const wt: any = {};
    Object.defineProperty(wt, "directory", { get: () => "/getter", enumerable: false });
    expect(ctxRoot({ worktree: wt })).toBe("/getter");
  });

  test("setupV2 resolves root from ctx.location when directory/worktree are empty", async () => {
    (globalThis as any).__positronicV2Abort = undefined;
    const f = fakeCtx();
    const proj = mkdtempSync(join(tmpdir(), "pos-fix11-loc-"));
    mkdirSync(join(proj, ".positronic"), { recursive: true });
    try {
      await setupV2({ ...f.ctx, worktree: {}, location: { path: proj } });
      expect(projectRoot()).toBe(proj);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  test("setupV2 refuses a root without .positronic/ (multi-project clobber guard)", async () => {
    // Live bug: the serve daemon's multi-project service ran setup() twice —
    // the second call passed the daemon cwd (no .positronic/) and clobbered
    // the real project root, so every brain tool fell back to PAI defaults.
    (globalThis as any).__positronicV2Abort = undefined;
    const f = fakeCtx();
    const proj = mkdtempSync(join(tmpdir(), "pos-fix11-ok-"));
    const home = mkdtempSync(join(tmpdir(), "pos-fix11-home-"));
    mkdirSync(join(proj, ".positronic"), { recursive: true });
    try {
      await setupV2({ ...f.ctx, directory: proj });
      expect(projectRoot()).toBe(proj);
      await setupV2({ ...f.ctx, directory: home });
      expect(projectRoot()).toBe(proj);
    } finally {
      rmSync(proj, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("Post-compaction brain-first reminder", () => {
  test("takeReminder is inert without compaction, budgeted after, then silent", async () => {
    const m = await import("../src/index.js");
    m.v2ResetReminders();
    expect(m.takeReminder("ses_x")).toBeNull();
    m.markCompacted("ses_x");
    expect(m.takeReminder("ses_x")).toBe(m.BRAIN_REMINDER_TEXT);
    expect(m.takeReminder("ses_x")).toBe(m.BRAIN_REMINDER_TEXT);
    expect(m.takeReminder("ses_x")).toBeNull();
    expect(m.takeReminder("")).toBeNull();
    m.v2ResetReminders();
  });

  test("session.compacted event arms the budget", async () => {
    const m = await import("../src/index.js");
    m.v2ResetReminders();
    await m.handleV2Event({ type: "session.compacted", data: { sessionID: "ses_c", directory: tmpdir() } });
    expect(m.takeReminder("ses_c")).toBe(m.BRAIN_REMINDER_TEXT);
    m.v2ResetReminders();
  });

  test("registerReminderHook pushes system text only within budget", async () => {
    const m = await import("../src/index.js");
    m.v2ResetReminders();
    (globalThis as any).__positronicReminderHook = undefined;
    const calls: any[] = [];
    const ctx: any = { session: { hook: async (_kind: string, fn: any) => { calls.push(fn); } } };
    expect(m.registerReminderHook(ctx)).toBe(true);
    expect(calls.length).toBe(1);
    // second setup must not double-register (would burn budget 2x per call)
    expect(m.registerReminderHook(ctx)).toBe(true);
    expect(calls.length).toBe(1);
    const ev: any = { sessionID: "ses_h", system: [] };
    calls[0](ev);
    expect(ev.system).toEqual([]);
    m.markCompacted("ses_h");
    calls[0](ev);
    expect(ev.system.length).toBe(1);
    expect(ev.system[0].text).toContain("positronic_recall");
    calls[0](ev);
    calls[0](ev);
    expect(ev.system.length).toBe(2);
    (globalThis as any).__positronicReminderHook = undefined;
    m.v2ResetReminders();
  });

  test("registerReminderHook no-ops with a log when host lacks session.hook", async () => {
    const m = await import("../src/index.js");
    (globalThis as any).__positronicReminderHook = undefined;
    expect(m.registerReminderHook({})).toBe(false);
    expect(m.registerReminderHook(undefined)).toBe(false);
  });
});
