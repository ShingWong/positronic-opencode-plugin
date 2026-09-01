#!/usr/bin/env node
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
import { spawnSync } from "node:child_process";
const usage = `Usage: positronic <verb> [--json] [--brain <name>] ...
  verbs: init | info | stats | config | brain-test | llm-stat | llm-setup | update | doctor | delete | query | prune | consolidate | ingest | recall | ask | wake
  examples:
    positronic info --json
    positronic stats --brain kairos --json
    positronic config profile archival --brain kairos --confirm --json
    positronic brain-test --k 3 --json
    positronic query "memory engine" --brain kairos --k 8 --json
    positronic query --sql "SELECT COUNT(*) AS n FROM episode" --brain kairos --json
    positronic query --anchors --brain kairos --json
    positronic query --objects --brain kairos --json
    positronic query --sightings --brain kairos --json
    positronic llm-stat --json
    positronic llm-setup --tier 3 --json
    positronic update --check --json | --tail 50 | --status <jobId>
    positronic delete --brain <name> --force
    positronic prune --json
    positronic consolidate "session summary text" --arousal 0.4 --json
    positronic ingest "remember this" --arousal 0.5 --json
    positronic recall "memory engine" --k 8 --json
    positronic ask "kairos" --json`;
const argv = process.argv.slice(2);
if (argv.length === 0) {
    console.log(usage);
    process.exit(1);
}
// Thin delegating wrapper: forward every verb to the PAI CLI (python -m).
// We spawn `python3 -m positronic_ai` rather than rely on PAI's console
// script PATH precedence to avoid a bin-name conflict between the two
// installs (opencode plugin `positronic` vs PAI `positronic`).
const r = spawnSync("python3", ["-m", "positronic_ai", ...argv], {
    encoding: "utf-8",
    timeout: 60000,
});
if (r.stdout)
    process.stdout.write(r.stdout);
if (r.stderr)
    process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
