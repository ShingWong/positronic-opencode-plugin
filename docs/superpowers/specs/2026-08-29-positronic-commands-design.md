# Positronic Commands — Flat Slash + Agentic Tools (v1) Design

> **Goal:** Flat `/positronic:<verb>` slash commands + 1:1 agentic `tool` endpoints for daily brain work, with `--json`, confirmation gates, and deferred `update` (poll/tail) — back-burnering `export`/`import` and grouped `test+verify` (`engram-verify` etc) to next feature, plus CI/CD for automated update.

**Decisions locked 2026-08-28/29:** Flat over subcommand (opencode `TuiCommand slash:{name}` is flat `tui.command.execute: string`), A = plugin-native commands (7 files `src/commands/*`), deferred `update` via log poll/tail not SSE, no `llama.cpp` auto-build, `--json` machine output, `config set` confirm gate, `export|import|prune|forget` deferred.

## 1. Command Surface (v1)

7 flat commands — human `/positronic:xxx` in opencode palette; same handler backs CLI `positronic xxx` for shell parity (optional, not required for v1 gate):

| Slash (`/` palette) | Tool (`tool_call`) | Flags | Output |
|---|---|---|---|
| `/positronic:info` | `positronic.info` | `[--brain <name>] [--json]` | `v + ENGRAM_TAG + brains (name→profile\|embed\|threshold) + tier legend + doctor summary` |
| `/positronic:stats` | `positronic.stats` | `[brain] [--json]` | Federated `{episodes, objects, sightings, rules, τ, mono, horizon hint}` per brain; no arg = all brains via `.positronic/brains/*/memory.db` + `kairos_brain.stats()` pattern |
| `/positronic:config` | `positronic.config` | `[get\|set <key>=<value> [--brain <name>] [--confirm] [--json]]` | View/edit `profile\|threshold\|embed\|local_url\|remote_url\|remote_key`; validates `engine.py:48` `balanced\|archival\|long_term\|short_term`; `profile` change warns `E7 55/55/35/7` and requires `--confirm`/`confirm:true` second call |
| `/positronic:brain-test` | `positronic.brain-test` | `[--k 3] [--brain <name>] [--json]` | Smoke: `new_event(subject="positronic:probe", arousal≈0.8) → activate(text="probe web2", k) → {ok, encode_ms, recall_ms, rrf_score, fallback, hits}`; probe marked `precision_src="probe"` for GC filtering; pass if `hits>0` |
| `/positronic:llm-stat` | `positronic.llm-stat` | `[--json]` | Focused doctor slice: `:8090/health` + `bge-m3-Q8_0.gguf` dim1024 + `pooling cls` vs `mean` warning + `llama-server --version` + `8090` port occupancy |
| `/positronic:llm-setup` | `positronic.llm-setup` | `[tier=1\|2\|3] [--json]` | Prints `docs/llama.md` tier (1 lexical 0 deps, 2 `remote baseURL+key 30ms`, 3 `curl 606MB + bge-embed.service Restart=always`); read-only guide, copy-paste, no exec |
| `/positronic:update` | `positronic.update` | `[--check] [--pin v0.2.x] [--status <jobId>] [--tail 50] [--json]` | Deferred job: see §3; lists diff, bumps `ENGRAM_TAG`, runs `pip -e` engram + `npm ci && npm run build`, returns `{jobId,status,exitCode,logPath}` |

Deferred to next feature (explicit out of scope for v1): `export [brain] (--format jsonl|sqlite)`, `import <file> [--dry-run]`, grouped `test+verify` (`engram-verify --deep` = `memeng` + `FTS + HNSW` + DB integrity suite), `prune [--tau]`, `forget <object>`, true streaming SSE.

## 2. Agentic Execution Contract

* **Dual entry:** Slash = human TUI `TuiCommand {title,value,slash:{name:"positronic:info"}}` palette; Tool = LLM `tool_call` JSON `{"positronic.brain-test":{"brain":"kairos","k":3,"json":true}}`. Both call same `src/commands/<verb>.ts: export async function run(opts):Promise<{json, human}>` — one interface, two surfaces. Keeps token cost low (tool returns structured JSON, slash renders `human` string).
* **Machine-readable:** Every command supports `--json` (palette checkbox; tool: JSON object). Example `stats --json` → `{"brains":{"kairos":{"episodes":12,"tau":7.2,"mono":42}},"tiers":{"lexical":"ok","bge":"down"}}`. Agents parse, don't grep.
* **Side-effect transparency:** Only `config set` and `update` write. They return `{changed:[keys], before:{}, after:{}, requiresRestart?:bool, warning?:string}` so agent can gate follow-ups. `brain-test` writes probe episodes but marks `subject_norm="positronic:probe"` + `precision_src="probe"` — GC (`prune` later) will filter; agent ignores `probe` subjects in stats.
* **Idempotence + confirmation:** `llm-setup` is read-only; `update --check` is dry-run `git ls-remote + diff` without pull. `config set profile=archival` first call returns `{warning:"Retention archival never forgets — E7 55/55/35/7 vs balanced. Re-invoke with confirm:true"}`, second `confirm:true` applies — mirrors human `[y/N]` for agents. `config set` also refuses `*.db` path writes (PII firewall).
* **Auth / beta:** Commands respect `ENGRAM_TAG` pin (plugin `src/config.ts: EngramTag v0.2.0`, installer `git clone --branch $ENGRAM_TAG`) and `.gitignore` `*.db / .positronic/brains/*/memory.db / brain_henry/state`; no secrets printed (`remote_key` masked `--json` unless `--show-secrets`).

## 3. Update: Deferred + Tail/Poll

* **Why not streaming:** Opencode `tool.execute` expects single JSON return (`ToolPart result` is one `result` field `sdk/dist/gen/types.gen.d.ts: tool part`); true SSE would need new channel (`positronic.update.stream`) + cancel semantics; TUI palette modal isn't a terminal scroll buffer; token fill from log shards. Deferred pattern is how long agentic scripts already work.
* **Job model:** `update` with no flags starts job: spawns background `bash -c 'git fetch; git diff; git pull --ff-only; pip install -e $ENGRAM_TAG; npm ci && npm run build; npx vitest run; node dist/cli.js doctor --json'` (scoped to `positronic-engram` pinned tag + `positronic-opencode-plugin` branch). Writes `~/.cache/positronic/update-<jobId>.log` (or `.positronic/` when cache unavailable, still gitignored). Returns `{jobId, status:"running", logPath}`.
* **Poll/tail:** `update --status <jobId>` reads log + returns `{status:"running"|"done", exitCode, duration_ms, logTail: last 200 lines}`. `update --tail 50 [--follow]` cats last N lines (or `--follow` via repeated poll every 1s until done). `update --check` does dry-run without spawning job: `git ls-remote origin beta/main` vs local `HEAD`, reports `behind: N, engramTagDiff, npmOutdated`.
* **Safety:** Refuses if `git status --porcelain` dirty (unless `--force`); writes `update.<jobId>.lock` to serialize; `update --cancel <jobId>` `kill` + `git reset --hard`.

## 4. Files + CI/CD

* **Files (A, flat):** `src/commands/{info,stats,config,brainTest,llmStat,llmSetup,update}.ts` each `export async function run(opts:{json?,...}):Promise<{json:any,human:string}>`. `src/index.ts` registers `TuiCommand[]` via `api.keymap.registerLayer({commands, bindings})` (fallback `api.command.register`) mapping `slash.name:"positronic:info"` → `run`; also exports `tools: Record<string, ToolDefinition>` `positronic.info|stats|...` wiring same `run`. `src/cli.ts` dispatches `positronic <verb> [args]` → same `run` (parity for `update --tail`). `src/commands/update.ts` owns job file helpers (`getLogPath`, `spawnJob`, `readStatus`). Reuse `src/config.ts: loadConfig/saveConfig`, `src/doctor.ts: doctor`, `src/embed.ts: embedHealth/getEmbedder`, `src/brains.ts: initBrain/getBrains`.
* **Docs:** `docs/commands.md` reference (7 commands, `--json` examples, agentic `tool_call` snippets), `AGENTS.md` tool table appended, `README.md` palette screenshots. `docs/llama.md` unchanged (consumed by `llm-setup`).
* **CI/CD:** `.github/workflows/ci.yml` on `push: [main,beta]` + PR: `actions/checkout`, `actions/setup-node`, `npm ci`, `npm run build`, `python -m pytest -q`, `npx vitest run`, `node dist/cli.js doctor --json` (gate `engram:missing` allowed when `positronic-engram` not checked out; `lexical:ok` required). `.github/workflows/release.yml` on `push tag v*`: same gate → `gh release create --generate-notes` + `npm publish --tag beta` if `*beta*` else `latest` (optional, skipped if `NPM_TOKEN` unset). `update --check` reuses `git ls-remote` locally; tagging is manual `git tag v0.2.0 && git push --tags` until auto-tag bot later.
* **Out of scope (v1):** `export|import`, grouped `test+verify` deep suite, `prune|forget`, Postgres/pgvector HNSW, true streaming SSE, CLI `brains: cp` bulk.

## Interfaces

* Consumes: `positronic-engram/engine/src/memeng (SQLiteStore, MemoryEngine, activate, stats)`, `bge-embed.service :8090/v1/embeddings (BGE-M3 Q8_0 dim1024, pooling cls)`, `opencode TuiCommand + ToolDefinition + tui.command.execute`.
* Produces: 7 flat `/positronic:*` slashes + 7 `positronic.*` tools (JSON), `positronic update` deferred job (`jobId|logPath|tail`), gateable CI.

## Acceptance

* `npx vitest run` covers each `commands/*.ts: run --json` shape; `python -m pytest -q` still passes (3 warnings only); `positronic doctor` shows `lexical:ok`; web2 smoke `runWizard → brain-test` pass; `update --check` reports `behind` without writing.
