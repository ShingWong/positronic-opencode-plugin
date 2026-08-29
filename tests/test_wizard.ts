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
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runWizard } from "../src/wizard.js";

describe("wizard", () => {
  test("creates 2 brains with profiles", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-wizard-"));
    await runWizard(dir, {
      answers: [
        { name: "kairos", profile: "balanced", embed: "lexical" },
        { name: "mail", profile: "long_term", embed: "local" },
      ],
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, ".positronic", "config.json"), "utf-8"));
    expect(cfg.brains.kairos.profile).toBe("balanced");
    expect(cfg.brains.mail.profile).toBe("long_term");
    expect(cfg.brains.kairos.embed).toBe("lexical");
    expect(cfg.brains.mail.embed).toBe("local");
    expect(fs.existsSync(path.join(dir, ".positronic", "brains", "kairos", "memory.db"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".positronic", "brains", "mail", "memory.db"))).toBe(true);
  });
});
