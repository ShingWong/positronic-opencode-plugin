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
import plugin, { positronicCommands, tui, collectAssistantText } from "../src/index.js";

describe("plugin hooks", () => {
  test("exports PluginModule with server factory", async () => {
    expect(plugin.id).toBe("positronic-opencode-plugin");
    expect(typeof plugin.server).toBe("function");
  });

  test("server factory exports event hook", async () => {
    const hooks = await (plugin as any).server({ client: {}, directory: "/tmp", worktree: "/tmp" });
    expect(hooks["event"]).toBeDefined();
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

  test("collectAssistantText excludes reasoning parts but keeps the answer", () => {
    const parts = [
      { type: "reasoning", text: "The user is asking about valuation... Let me think about the market." },
      { type: "text", text: "Honest answer: the market value is well-understood." },
      { type: "reasoning", text: "Should I mention Mimecast? Maybe. But keep it short." },
      { type: "text", text: "Mimecast exited at $5.8B." },
    ];
    const out = collectAssistantText(parts, null);
    const joined = out.join("\n");
    expect(joined).toContain("Honest answer");
    expect(joined).toContain("Mimecast exited");
    expect(joined).not.toContain("Let me think about the market");
    expect(joined).not.toContain("Should I mention Mimecast");
    expect(out.length).toBe(2);
  });

  test("collectAssistantText skips nested reasoning part and keeps msg text", () => {
    const parts = [
      { type: "text", part: { type: "reasoning", text: "nested thinking trace" } },
      { type: "text", part: { type: "text", text: "nested answer" } },
    ];
    const out = collectAssistantText(parts, { text: "top-level answer" });
    const joined = out.join("\n");
    expect(joined).toContain("nested answer");
    expect(joined).toContain("top-level answer");
    expect(joined).not.toContain("nested thinking");
  });
});