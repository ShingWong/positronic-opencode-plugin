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

import * as fs from "node:fs";
import * as path from "node:path";
export async function run(opts:{tier?:string, json?:boolean}={}): Promise<{json:any,human:string}> {
  const tier = opts.tier || "3";
  const docPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../../docs/llama.md");
  let md = "";
  try { md = fs.readFileSync(docPath, "utf-8"); } catch { md = "see docs/llama.md"; }
  const slice = md.slice(0,1500);
  const human = `llm-setup tier=${tier}\n` + slice + (slice.includes("606MB") ? "" : "\n606MB bge-m3-Q8_0.gguf");
  return { json: { tier, guide: md.slice(0,500) }, human };
}
