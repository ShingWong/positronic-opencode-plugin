import { loadConfig, saveConfig } from "../config.js";
const PROFILES = new Set(["balanced", "archival", "long_term", "short_term"]);
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    const cfg = (() => { try {
        return loadConfig(dir);
    }
    catch {
        return { brains: {}, engram_tag: "v0.2.0" };
    } })();
    if (!opts.key) {
        const masked = JSON.parse(JSON.stringify(cfg));
        if (!opts.showSecrets && masked.embed?.remote_key)
            masked.embed.remote_key = "***";
        return { json: masked, human: JSON.stringify(masked, null, 2) };
    }
    // set: key is threshold|profile|embed|local_url|remote_url
    if (opts.key === "*.db" || opts.key.includes("memory.db") || opts.key.includes("brain_henry"))
        throw new Error("PII path blocked");
    const before = JSON.parse(JSON.stringify(cfg));
    if (opts.key === "profile") {
        if (!PROFILES.has(opts.value))
            throw new Error(`unknown profile ${opts.value}`);
        if (opts.value === "archival" && !opts.confirm) {
            return { json: { warning: "Retention archival never forgets — E7 55/55/35/7 vs balanced. Re-invoke with confirm:true", before }, human: "warning: archival never forgets — re-run with --confirm" };
        }
        if (opts.brain)
            cfg.brains[opts.brain].profile = opts.value;
        else
            Object.values(cfg.brains).forEach((b) => b.profile = opts.value);
    }
    else if (opts.key === "threshold") {
        const v = parseFloat(opts.value);
        if (opts.brain)
            cfg.brains[opts.brain].threshold = v;
        else
            Object.values(cfg.brains).forEach((b) => b.threshold = v);
    }
    else
        throw new Error(`unknown key ${opts.key}`);
    saveConfig(dir, cfg);
    const after = loadConfig(dir);
    return { json: { changed: [opts.key], before, after }, human: `set ${opts.key}=${opts.value}` };
}
