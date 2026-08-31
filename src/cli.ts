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

import { runWizard } from "./wizard.js";

const cmd = process.argv[2];
const args = process.argv.slice(3);
const useJson = process.argv.includes("--json");
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean { return process.argv.includes(name); }

if (cmd === "init") {
  const { run } = await import("./commands/init.js");
  const force = has("--force");
  const noLive = has("--no-live");
  const liveFlag = has("--live");
  const live = noLive ? false : (liveFlag ? true : undefined);
  const dir = process.cwd();
  const brain = flag("--brain");
  const profile = flag("--profile");
  const embed = flag("--embed");
  // No options → show human-friendly help (no side-effects)
  const hasAnyBrainFlag = brain || profile || embed || live !== undefined;
  const out = hasAnyBrainFlag
    ? await run({ dir, force, json: useJson, live, brains: [{ name: brain || "kairos", profile: profile || "balanced", embed: embed || "lexical" }] })
    : await run({ dir, force, json: useJson, live, brains: undefined as any });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
  if (!out.json.ok && hasAnyBrainFlag) process.exitCode = 1;
  // help (no flags) exits 0
} else if (cmd === "doctor") {
  const { doctor } = await import("./doctor.js");
  const out = await doctor({ json: useJson });
  if (!useJson) {
    // doctor already printed
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
  void runWizard;
} else if (cmd === "info") {
  const m = await import("./commands/info.js");
  const out = await m.run({ dir: process.cwd(), json: true });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
} else if (cmd === "stats") {
  const m = await import("./commands/stats.js");
  const brain = flag("--brain");
  const out = await m.run({ dir: process.cwd(), brain, json: true });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
} else if (cmd === "config") {
  const m = await import("./commands/config.js");
  // positronic config [get] or positronic config set <key> <value> [--brain X] [--confirm] or positronic config <key> <value>
  const key = args.find((a) => !a.startsWith("-") ) || undefined;
  // second non-flag after key as value (support key=value or key value)
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  let k: string | undefined;
  let v: string | undefined;
  if (nonFlags.length === 1 && nonFlags[0].includes("=")) {
    const [kk, vv] = nonFlags[0].split("=", 2);
    k = kk; v = vv;
  } else if (nonFlags.length >= 1) {
    k = nonFlags[0];
    v = nonFlags[1];
  }
  const brain = flag("--brain");
  const confirm = has("--confirm");
  const showSecrets = has("--show-secrets");
  const out = await m.run({ dir: process.cwd(), brain, key: k, value: v, confirm, showSecrets, json: true });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
} else if (cmd === "brain-test" || cmd === "brainTest") {
  const m = await import("./commands/brainTest.js");
  const brain = flag("--brain") || "kairos";
  const k = flag("--k") ? parseInt(flag("--k") as string, 10) : 3;
  const out = await m.run({ dir: process.cwd(), brain, k, json: true });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
} else if (cmd === "llm-stat") {
  const m = await import("./commands/llmStat.js");
  const out = await m.run({ json: true });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
} else if (cmd === "llm-setup") {
  const m = await import("./commands/llmSetup.js");
  const tier = flag("--tier") || flag("--tier=") || args.find((a) => /^[123]$/.test(a)) || "3";
  const out = await m.run({ tier: tier.replace(/^--tier=/, ""), json: true });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
} else if (cmd === "update") {
  const m = await import("./commands/update.js");
  const check = has("--check");
  const pin = flag("--pin");
  const status = flag("--status");
  const tailRaw = flag("--tail");
  const tail = tailRaw !== undefined ? parseInt(tailRaw, 10) : (has("--tail") ? 50 : undefined);
  const out = await m.run({ check, pin, status, tail, json: true, dir: process.cwd() });
  if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
  } else if (cmd === "delete") {
    const m = await import("./commands/delete.js");
    const brain = flag("--brain");
    const force = has("--force");
    const out = await m.run({ dir: process.cwd(), brain, force, json: true });
    if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
    if (!out.json.ok) process.exitCode = 1;
  } else if (cmd === "query") {
    const { runQuery } = await import("./commands/query.js");
    const brain = flag("--brain") || "kairos";
    // positional text OR --sql <sql> OR --cue <text> (activate) OR --objects | --anchors | --sightings
    const qtext = args.find((a) => !a.startsWith("-")) || "";
    const sql = flag("--sql");
    const cue = flag("--cue");
    const objects = has("--objects");
    const anchors = has("--anchors");
    const sightings = has("--sightings");
    const k = flag("--k") ? parseInt(flag("--k") as string, 10) : 8;
    const out = await runQuery({ dir: process.cwd(), brain, qtext, sql, cue, objects, anchors, sightings, k, json: true });
    if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
  } else if (cmd === "prune") {
    const m = await import("./commands/prune.js");
    const out = await m.run({ dir: process.cwd(), json: true });
    if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
    if (!out.json.ok) process.exitCode = 1;
  } else if (cmd === "consolidate") {
    const m = await import("./commands/consolidate.js");
    const brain = flag("--brain");
    const arousal = flag("--arousal") ? parseFloat(flag("--arousal") as string) : 0.4;
    const text = args.find((a) => !a.startsWith("-")) || "";
    const out = await m.run({ dir: process.cwd(), brain, text, arousal, json: true });
    if (useJson) console.log(JSON.stringify(out.json, null, 2)); else console.log(out.human);
    if (!out.json.ok) process.exitCode = 1;
  } else {
  console.log("Usage: positronic <verb> [--json] [--brain <name>] ...");
    console.log("  verbs: info | stats | config | brain-test | llm-stat | llm-setup | update | doctor | init | delete | query | prune | consolidate");
  console.log("  examples:");
    console.log("    positronic info --json");
    console.log("    positronic stats --brain kairos --json");
    console.log("    positronic config profile archival --brain kairos --confirm --json");
    console.log("    positronic brain-test --k 3 --json");
    console.log("    positronic query \"memory engine\" --brain kairos --k 8 --json");
    console.log("    positronic query --sql \"SELECT COUNT(*) AS n FROM episode\" --brain kairos --json");
    console.log("    positronic query --anchors --brain kairos --json");
    console.log("    positronic query --objects --brain kairos --json");
    console.log("    positronic query --sightings --brain kairos --json");
    console.log("    positronic llm-stat --json");
    console.log("    positronic llm-setup --tier 3 --json");
    console.log("    positronic update --check --json | --tail 50 | --status <jobId>");
    console.log("    positronic delete --brain <name> --force");
    console.log("    positronic prune --json");
    console.log("    positronic consolidate \"session summary text\" --arousal 0.4 --json");
}
