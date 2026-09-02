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

import { describe, test, expect } from "vitest";
import plugin, { positronicCommands, tui } from "../src/index.js";

describe("plugin hooks", () => {
  test("exports PluginModule with server factory", async () => {
    expect(plugin.id).toBe("positronic-opencode-plugin");
    expect(typeof plugin.server).toBe("function");
  });

  test("server factory exports event hook", async () => {
    const hooks = await (plugin as any).server({ client: {}, directory: "/tmp", worktree: "/tmp" });
    expect(hooks["event"]).toBeDefined();
  });

  test("server factory exports ground-before-deriving system transform (no chat-message injection)", async () => {
    const hooks = await (plugin as any).server({ client: {}, directory: "/tmp", worktree: "/tmp" });
    expect(hooks["experimental.chat.system.transform"]).toBeDefined();
    // injecting into the system prompt, not into the message stream:
    // a chat.message would be captured by ingestLive and pollute the brain.
    const output: any = { system: ["existing"] };
    await hooks["experimental.chat.system.transform"]({}, output);
    expect(output.system.length).toBe(2);
    expect(output.system[1]).toContain("GROUND BEFORE DERIVING");
    expect(output.system[1]).toContain("--consolidation only");
    // idempotent: second call does not duplicate the reminder
    await hooks["experimental.chat.system.transform"]({}, output);
    expect(output.system.length).toBe(2);
  });

  test("server factory exports tools", async () => {
    const h = await (plugin as any).server({ client: {}, directory: "/tmp", worktree: "/tmp" });
    expect(h.tool["positronic.recall"]).toBeDefined();
    expect(h.tool["positronic.ask"]).toBeDefined();
    expect(h.tool["positronic.stats"]).toBeDefined();
  });

  test("tui is a function", () => {
    expect(typeof tui).toBe("function");
  });

  test("positronicCommands lists 12 verbs (PAI verbs minus legacy recall/ask)", () => {
    const verbs = positronicCommands.map((c) => c.value.replace("positronic:", ""));
    expect(verbs).toEqual([
      "init", "info", "stats", "config", "brain-test", "llm-stat",
      "llm-setup", "update", "delete", "query", "prune", "consolidate",
    ]);
  });
});