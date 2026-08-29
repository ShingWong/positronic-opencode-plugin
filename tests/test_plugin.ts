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
import plugin from "../src/index.js";

describe("plugin hooks", () => {
  test("exports event hook", async () => {
    const hooks = await (plugin as any)({ client: {}, directory: "/tmp", worktree: "/tmp" });
    expect(hooks["event"]).toBeDefined();
  });

  test("exports tools", async () => {
    const h = await (plugin as any)({ client: {}, directory: "/tmp", worktree: "/tmp" });
    expect(h.tool["positronic.recall"]).toBeDefined();
    expect(h.tool["positronic.ask"]).toBeDefined();
    expect(h.tool["positronic.stats"]).toBeDefined();
  });
});
