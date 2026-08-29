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
import * as os from "node:os";
import { spawn, spawnSync } from "node:child_process";
export function getLogPath(jobId) {
    const base = process.env.POSITRONIC_CACHE || path.join(os.homedir(), ".cache", "positronic");
    fs.mkdirSync(base, { recursive: true });
    return path.join(base, `update-${jobId}.log`);
}
export function getLockPath(jobId) { return getLogPath(jobId) + ".lock"; }
export async function readStatus(jobId) {
    const logPath = getLogPath(jobId);
    const exists = fs.existsSync(logPath);
    const tail = exists ? fs.readFileSync(logPath, "utf-8").split("\n").slice(-200) : [];
    const lock = fs.existsSync(getLockPath(jobId));
    const status = lock ? "running" : exists ? "done" : "running";
    return { jobId, status, exitCode: null, logTail: tail, logPath };
}
export function spawnJob(jobId, cmd) {
    const logPath = getLogPath(jobId);
    const lockPath = getLockPath(jobId);
    fs.writeFileSync(lockPath, String(process.pid));
    const child = spawn("bash", ["-c", `${cmd} 2>&1 | tee ${JSON.stringify(logPath)}; echo $? > ${JSON.stringify(logPath + ".exit")}`], { detached: true, stdio: "ignore" });
    child.unref();
    // cleanup lock on exit is deferred to readStatus; v1 leaves lock until next poll
    void child;
    return logPath;
}
export async function run(opts = {}) {
    const dir = opts.dir || process.cwd();
    if (opts.check) {
        const r = spawnSync("bash", ["-c", `git -C ${JSON.stringify(dir)} ls-remote --heads origin 2>&1 | head; echo "---"; git -C ${JSON.stringify(dir)} rev-list --count HEAD..origin/beta 2>&1 | head -1`], { encoding: "utf-8" });
        const behind = parseInt((r.stdout.match(/\d+/) || ["0"])[0], 10) || 0;
        const json = { behind, engramTagDiff: null, npmOutdated: false, logTail: [] };
        return { json, human: `update --check behind=${behind}` };
    }
    if (opts.status) {
        const st = await readStatus(opts.status);
        return { json: st, human: JSON.stringify(st, null, 2) };
    }
    if (opts.tail !== undefined) {
        const st = await readStatus("default");
        const tail = st.logTail.slice(-(opts.tail || 50));
        return { json: { logTail: tail }, human: tail.join("\n") };
    }
    // spawn job
    const jobId = Date.now().toString(36);
    spawnJob(jobId, `cd ${JSON.stringify(dir)} && git fetch && git diff --stat; npm ci && npm run build; npx vitest run`);
    return { json: { jobId, status: "running", logPath: getLogPath(jobId) }, human: `update job ${jobId} running` };
}
