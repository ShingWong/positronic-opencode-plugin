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

import { describe, it, expect } from "vitest";
import { BrainCfg, PositronicCfg } from "./config.js";

describe("config zod", () => {
  it("parses balanced lexical", () => {
    const cfg = PositronicCfg.parse({ brains: { kairos: { profile: "balanced", embed: "lexical" } } });
    expect(cfg.brains.kairos.profile).toBe("balanced");
    expect(cfg.engram_tag).toBe("v0.2.0");
  });
  it("rejects invalid profile", () => {
    expect(() => BrainCfg.parse({ profile: "nonexistent", embed: "lexical" })).toThrow();
  });
});
