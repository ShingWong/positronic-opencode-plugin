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

describe("migrated plugin shape (delegates to positronic_ai)", () => {
  test("default export is a PluginModule {id, server}", () => {
    expect(plugin.id).toBe("positronic-opencode-plugin");
    expect(typeof plugin.server).toBe("function");
  });

  test("server factory registers 14 positronic tools + event hook", async () => {
    const p: any = await (plugin as any).server({ client: {} as any, directory: "/tmp", worktree: "/tmp" } as any);
    expect(p["event"]).toBeDefined();
    const toolMap = p?.tool || p?.tools || {};
    const toolCount = Object.keys(toolMap).filter((k: string) => k.startsWith("positronic.")).length;
    expect(toolCount).toBe(14);
  });

  test("all 12 slash verbs map to tools (minus legacy recall/ask wrappers)", () => {
    const verbNames = positronicCommands.map((c) => c.value.replace("positronic:", ""));
    expect(verbNames).toHaveLength(12);
    expect(verbNames).toEqual(expect.arrayContaining(["info", "stats", "config", "query", "prune", "consolidate"]));
  });

  test("tui exposes slash palette via command register", async () => {
    const registered: any[] = [];
    const api: any = { command: { register: (fn: () => any) => { registered.push(...fn()); } } };
    await tui(api, {}, {});
    expect(registered.length).toBe(positronicCommands.length);
  });
});