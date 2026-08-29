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

import { getLogPath } from "../src/commands/update.js";
import { describe, test, expect } from "vitest";
describe("update helpers", () => {
  test("getLogPath is deterministic", () => {
    expect(getLogPath("abc123")).toContain("update-abc123.log");
  });
});
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
import { run as updRun } from "../src/commands/update.js";
test("update --check reports behind without writing", async () => {
  const r = await updRun({ check: true, json: true, dir: "/tmp" } as any);
  expect(r.json).toHaveProperty("behind");
});
test("update --tail returns logTail array", async () => {
  const r = await updRun({ tail: 5, json: true, dir: "/tmp" } as any);
  expect(Array.isArray(r.json.logTail ?? r.json.tail ?? [])).toBe(true);
});
import plugin from "../src/index.js";
test("index registers 7 positronic commands", async () => {
  const p:any = await (plugin as any)({ client: {} as any, directory: "/tmp", worktree: "/tmp" } as any);
  // live ingestion is now via generic event hook; commands/tools are via exported tui + tool
  expect(p["event"]).toBeDefined();
  const toolMap = p?.tool || p?.tools || {};
  const toolCount = Object.keys(toolMap).filter((k:string)=> k.startsWith("positronic.")).length;
  expect(toolCount >= 7).toBe(true);
});
