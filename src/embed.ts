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

export type EmbedChoice = "lexical" | "local" | "remote";

export interface EmbedConfig {
  local_url?: string;
  remote_url?: string;
  remote_key?: string;
}

export type EmbedFn = (text: string) => Promise<number[]>;

export function resolveEmbed(choice: EmbedChoice, cfg?: EmbedConfig): string {
  switch (choice) {
    case "lexical":
      return "lexical";
    case "local":
      return cfg?.local_url ?? "http://127.0.0.1:8090";
    case "remote":
      return cfg?.remote_url ?? "remote";
    default:
      throw new Error(`unknown embed choice: ${choice}`);
  }
}

export async function getEmbedder(cfg: any): Promise<EmbedFn | null> {
  const first = Object.values((cfg?.brains ?? {}) as Record<string, any>)[0] as any;
  const mode: EmbedChoice = (first?.embed as EmbedChoice) || "lexical";
  if (mode === "lexical") return null;
  if (mode === "local") {
    const url = cfg?.embed?.local_url || "http://127.0.0.1:8090";
    return async (text: string) => {
      const r = await fetch(`${url}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      if (!r.ok) throw new Error(`embed ${r.status} ${await r.text()}`);
      const j = (await r.json()) as any;
      return j.data[0].embedding as number[];
    };
  }
  if (mode === "remote") {
    const url = cfg?.embed?.remote_url;
    const key = cfg?.embed?.remote_key;
    if (!url) throw new Error("remote_url required for remote embed");
    return async (text: string) => {
      const r = await fetch(`${url}/v1/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ input: text, model: "bge-m3" }),
      });
      if (!r.ok) throw new Error(`remote embed ${r.status} ${await r.text()}`);
      const j = (await r.json()) as any;
      return j.data[0].embedding as number[];
    };
  }
  return null;
}

export async function embedHealth(cfg: any): Promise<{ ok: boolean; url: string }> {
  const url = cfg?.embed?.local_url || "http://127.0.0.1:8090";
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    const j = (await r.json()) as any;
    return { ok: j?.status === "ok", url };
  } catch {
    return { ok: false, url };
  }
}
