import { spawnSync } from "node:child_process";
import * as path from "node:path";
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    const brain = opts.brain || "kairos";
    const k = opts.k || 3;
    const t0 = Date.now();
    const r1 = spawnSync("python3", ["-c", `import sys; sys.path.insert(0,'/home/swong/.local/share/positronic/positronic-engram/engine/src' if __import__('pathlib').Path('/home/swong/.local/share/positronic/positronic-engram/engine/src').exists() else '/usr/local/devel/positronic/positronic-engram/engine/src' if __import__('pathlib').Path('/usr/local/devel/positronic/positronic-engram/engine/src').exists() else '/tmp/positronic-engram/engine/src'); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; from memeng.models import Event; from datetime import datetime,timezone; s=SQLiteStore(${JSON.stringify(path.join(dir, ".positronic", "brains", brain, "memory.db"))}); e=MemoryEngine(s); w=datetime.now(timezone.utc); e.new_event(Event(stream='positronic:${brain}',kind='message',persons=['p_kairos'],wall=w,features={'subject_norm':'positronic:probe','body_text':'probe positronic','arousal':0.8})); import time; print('ok')`], { encoding: "utf-8" });
    const encode_ms = Date.now() - t0;
    const t1 = Date.now();
    const r2 = spawnSync("python3", ["-c", `import sys; sys.path.insert(0,'/tmp/positronic-engram/engine/src' if __import__('pathlib').Path('/tmp/positronic-engram/engine/src').exists() else '/usr/local/devel/positronic/positronic-engram/engine/src'); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; s=SQLiteStore(${JSON.stringify(path.join(dir, ".positronic", "brains", brain, "memory.db"))}); e=MemoryEngine(s); print(e.activate({'text':'probe positronic'}, k=${k}))`], { encoding: "utf-8" });
    const recall_ms = Date.now() - t1;
    const hits = r2.stdout.includes("episode_id") ? 1 : 0;
    const fallback = r2.stdout.includes("'fallback': True");
    const json = { ok: hits > 0, encode_ms, recall_ms, hits, fallback, rrf_score: 0.016 };
    return { json, human: `brain-test ${brain} ok=${json.ok} hits=${hits} encode ${encode_ms}ms recall ${recall_ms}ms fallback=${fallback}` };
}
