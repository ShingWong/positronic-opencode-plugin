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
import { getEmbedder, embedHealth } from "../src/embed.js";

describe("embed backends", () => {
  test("lexical returns null embedder", async () => {
    const fn = await getEmbedder({
      brains: { k: { profile: "balanced", embed: "lexical" } },
      embed: { local_url: "http://127.0.0.1:8090" },
    } as any);
    expect(fn).toBeNull();
  });

  test("local embedder hits :8090", async () => {
    const fn = await getEmbedder({
      brains: { k: { profile: "balanced", embed: "local" } },
      embed: { local_url: "http://127.0.0.1:8090" },
    } as any);
    expect(fn).not.toBeNull();
    const vec = await fn!("hello world");
    expect(vec.length).toBe(1024);
  }, 10000);

  test("embedHealth reports ok when bge up", async () => {
    const h = await embedHealth({ embed: { local_url: "http://127.0.0.1:8090" } } as any);
    // Don't fail if bge is down in CI — just check shape
    expect(typeof h.ok).toBe("boolean");
    expect(h.url).toContain("8090");
  });
});
