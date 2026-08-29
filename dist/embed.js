export function resolveEmbed(choice, cfg) {
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
export async function getEmbedder(cfg) {
    const first = Object.values((cfg?.brains ?? {}))[0];
    const mode = first?.embed || "lexical";
    if (mode === "lexical")
        return null;
    if (mode === "local") {
        const url = cfg?.embed?.local_url || "http://127.0.0.1:8090";
        return async (text) => {
            const r = await fetch(`${url}/v1/embeddings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: text }),
            });
            if (!r.ok)
                throw new Error(`embed ${r.status} ${await r.text()}`);
            const j = (await r.json());
            return j.data[0].embedding;
        };
    }
    if (mode === "remote") {
        const url = cfg?.embed?.remote_url;
        const key = cfg?.embed?.remote_key;
        if (!url)
            throw new Error("remote_url required for remote embed");
        return async (text) => {
            const r = await fetch(`${url}/v1/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(key ? { Authorization: `Bearer ${key}` } : {}),
                },
                body: JSON.stringify({ input: text, model: "bge-m3" }),
            });
            if (!r.ok)
                throw new Error(`remote embed ${r.status} ${await r.text()}`);
            const j = (await r.json());
            return j.data[0].embedding;
        };
    }
    return null;
}
export async function embedHealth(cfg) {
    const url = cfg?.embed?.local_url || "http://127.0.0.1:8090";
    try {
        const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        const j = (await r.json());
        return { ok: j?.status === "ok", url };
    }
    catch {
        return { ok: false, url };
    }
}
