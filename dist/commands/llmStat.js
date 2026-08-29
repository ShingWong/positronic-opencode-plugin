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
import { doctor } from "../doctor.js";
export async function run(opts = {}) {
    const d = await doctor({ json: true });
    const tiers = d.tiers || d;
    const json = { bge: tiers.bge, llama: tiers.llama, lexical: tiers.lexical, engram: tiers.engram, pooling: tiers.bge === "ok" ? "cls" : "unknown" };
    return { json, human: `llm-stat bge=${json.bge} llama=${json.llama} pooling=${json.pooling}` };
}
