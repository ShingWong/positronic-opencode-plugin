import * as fs from "node:fs";
import * as path from "node:path";
export async function run(opts = {}) {
    const tier = opts.tier || "3";
    const docPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../../docs/llama.md");
    let md = "";
    try {
        md = fs.readFileSync(docPath, "utf-8");
    }
    catch {
        md = "see docs/llama.md";
    }
    const slice = md.slice(0, 1500);
    const human = `llm-setup tier=${tier}\n` + slice + (slice.includes("606MB") ? "" : "\n606MB bge-m3-Q8_0.gguf");
    return { json: { tier, guide: md.slice(0, 500) }, human };
}
