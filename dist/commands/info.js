import { loadConfig } from "../config.js";
import { doctor } from "../doctor.js";
import * as fs from "node:fs";
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    let cfg = { brains: {}, engram_tag: "v0.2.0" };
    try {
        cfg = loadConfig(dir);
    }
    catch { }
    const doc = await doctor({ json: true }).catch(() => ({ tiers: { lexical: "ok" } }));
    const json = { version: JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url).pathname, "utf-8")).version, engram_tag: cfg.engram_tag, brains: cfg.brains, tiers: doc.tiers || doc };
    const human = `positronic v${json.version} ENGRAM_TAG=${json.engram_tag} brains:${Object.keys(json.brains).join(",") || "(none)"} tiers:${JSON.stringify(json.tiers)}`;
    return { json, human };
}
