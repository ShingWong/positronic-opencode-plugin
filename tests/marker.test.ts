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

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { composeMarker } from "../src/index.js";

function seed(dir: string) {
  execSync(`python3 -m positronic_ai init --brain kairos --profile balanced --embed lexical`, { cwd: dir, stdio: "ignore" });
}

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pos-marker-"));
  seed(dir);
  execSync(`python3 -m positronic_ai ingest "decided: ship the prune fix to main on web2" --arousal 1.0`, { cwd: dir, stdio: "ignore" });
  execSync(`python3 -m positronic_ai ingest "background note, not a decision" --arousal 0.1`, { cwd: dir, stdio: "ignore" });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("composeMarker", () => {
  test("composes marker from anchor body_text + object names (not the bare id)", () => {
    const m = composeMarker(dir, "ses_test");
    expect(m).toContain("ship the prune fix to main");
    expect(m).toContain("objects:");
    expect(m.length).toBeLessThanOrEqual(1000);
    expect(m).not.toBe("session compacted ses_test");
  });

  test("falls back to bare id when the span has no anchors", () => {
    const empty = mkdtempSync(join(tmpdir(), "pos-marker-empty-"));
    try {
      seed(empty);
      execSync(`python3 -m positronic_ai ingest "just a note" --arousal 0.1`, { cwd: empty, stdio: "ignore" });
      expect(composeMarker(empty, "ses_empty")).toBe("session compacted ses_empty");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});