import { doctor } from "../doctor.js";
export async function run(opts = {}) {
    const d = await doctor({ json: true });
    const tiers = d.tiers || d;
    const json = { bge: tiers.bge, llama: tiers.llama, lexical: tiers.lexical, engram: tiers.engram, pooling: tiers.bge === "ok" ? "cls" : "unknown" };
    return { json, human: `llm-stat bge=${json.bge} llama=${json.llama} pooling=${json.pooling}` };
}
