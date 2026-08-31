# Positronic Commands — `/positronic:*` + `positronic.*` tools

## Install (beta)

```bash
opencode plugin add github:ShingWong/positronic-opencode-plugin#beta
# or: opencode plugin add github:ShingWong/positronic-opencode-plugin
# then in opencode TUI: / → positronic: + Tab picks /positronic:info etc.
```

## Quick start — no options shows help (human-friendly)

`/positronic:init` with no args explains choices (no side-effects) — live ingestion default yes:

* **Name** — brain name (default `kairos`; use `mail`, `research` etc for multi-brain)
* **Profile — how long to remember:**
  `balanced` (weeks, ~35% kept) · `long_term` (months, mail) · `archival` (never forgets, grows forever) · `short_term` (days, scratch)
* **Embed — how to find:** `lexical` (no setup) · `local` (BGE-M3 :8090) · `remote` (API key)
* **Live — ingest live session (default: yes):** `--live` / `--no-live` flag — wired to `message.updated` auto-ingest; disable: `--no-live` (stored `live:false` in `.positronic/config.json`)

```bash
/positronic:init                          # → help table + examples (no brain created)
/positronic:init --brain mail --profile long_term --embed local
/positronic:init --brain mail --profile archival --force  # overwrites existing — data WILL be lost
/positronic:init --no-live                # disable live ingestion
positronic init                           # same help in shell
positronic init --brain research --profile archival --embed remote --force --json
# Every brain ingests live by default — /usr/local/devel/positronic lives, brain_henry/state/memory.db is test data (to be deleted)
```

11 flat commands. Same `src/commands/*: run` backs slash palette `/positronic:<verb>`, agentic `tool_call`, and shell `positronic <verb>`.

| Slash (palette ` /`) | Tool (`tool_call`) | CLI | Flags | Output (`--json`) |
|---|---|---|---|---|
| `/positronic:init` | `positronic.init` | `positronic init` | `[--brain <name>] [--profile balanced\|archival\|long_term\|short_term] [--embed lexical\|local\|remote] [--live\|--no-live] [--force] [--json]` | no args → help; with args → `{ok, brains, created, existing, live, configPath}` or `{ok:false, warning:"will be OVERWRITTEN ... Re-run with --force"}`; live default `true` |
| `/positronic:info` | `positronic.info` | `positronic info` | `[--json]` | `{version, engram_tag, brains, tiers}` |
| `/positronic:stats` | `positronic.stats` | `positronic stats` | `[--brain <name>] [--json]` | `{brains:{<name>:{episodes}}}`; no arg = all `.positronic/brains/*` |
| `/positronic:config` | `positronic.config` | `positronic config` | `[<key> [<value>] [--brain <name>] [--confirm] [--show-secrets] [--json]]` | get: masked config; set: `{changed, before, after, warning?}`; `profile=archival` requires `--confirm`/`confirm:true` (E7 55/55/35/7); blocks `*.db` |
| `/positronic:brain-test` | `positronic.brain-test` | `positronic brain-test` | `[--brain kairos] [--k 3] [--json]` | `{ok, hits, encode_ms, recall_ms, fallback, rrf_score}` probe `positronic:probe` |
| `/positronic:llm-stat` | `positronic.llm-stat` | `positronic llm-stat` | `[--json]` | `{bge, llama, lexical, engram, pooling:cls|unknown}` (:8090 health, `bge-m3-Q8_0.gguf` dim 1024, pooling `cls` warning) |
| `/positronic:llm-setup` | `positronic.llm-setup` | `positronic llm-setup` | `[--tier 1|2|3] [--json]` | `{tier, guide}` + human slice of `docs/llama.md` (Tier 3: `606MB bge-m3-Q8_0.gguf` + `bge-embed.service Restart=always`, no auto-build) |
| `/positronic:update` | `positronic.update` | `positronic update` | `[--check] [--status <jobId>] [--tail N] [--pin v0.2.x] [--json]` | `--check:{behind,engramTagDiff,npmOutdated}` dry `git ls-remote`; default spawns `~/.cache/positronic/update-<jobId>.log`, returns `{jobId,status,logPath}`; `--status/--tail` polls log |
| `/positronic:prune` | `positronic.prune` | `positronic prune` | `[--json]` | τ-decay `engine.prune()` on the live brain (skips `live:false`); `{ok, brain, scanned, day_merged, week_merged, expired, residues, objects_dormant, objects_forgotten}` |
| `/positronic:consolidate` | `positronic.consolidate` | `positronic consolidate "<summary>"` | `[--brain <name>] [--arousal N] [--json]` | writes `kind='consolidation'` event; `{ok, brain, tau, encoded, episode_id}`; empty summary → `{ok:false}` |

## `--json` examples

```bash
positronic init --json                  # no args → help {ok:false, warning:"Pick how..."}
positronic init --brain mail --profile long_term --embed local --json  # → {ok:true, brains:{mail:{profile:"long_term"}}}
positronic init --brain kairos --profile archival --force --json        # overwrite existing

positronic info --json
# {"version":"0.1.0-beta.1","engram_tag":"v0.2.0","brains":{...},"tiers":{"lexical":"ok","bge":"down","llama":"ok","engram":"ok"}}

positronic stats --json
positronic stats --brain kairos --json

positronic config --json
positronic config profile archival --brain kairos --json          # → {warning:"Retention archival never forgets — E7 55/55/35/7 ...", before:{}}
positronic config profile archival --brain kairos --confirm --json # → {changed:["profile"], before:{}, after:{brains:{kairos:{profile:"archival"}}}}
positronic config threshold 0.3 --brain kairos --json

positronic brain-test --k 3 --json
positronic brain-test --brain kairos --k 5 --json

positronic llm-stat --json   # {"bge":"down","llama":"ok","pooling":"unknown"}
positronic llm-setup --tier 3 --json  # guide slice mentions 606MB bge-m3-Q8_0.gguf

positronic update --check --json   # {"behind":0,"engramTagDiff":null,"npmOutdated":false,"logTail":[]}
positronic update --json            # {"jobId":"...","status":"running","logPath":"~/.cache/positronic/update-....log"}
positronic update --status <jobId> --json  # {"jobId":...,"status":"running|done","logTail":[...]}
positronic update --tail 50 --json         # {"logTail":[...]}
```

## Agentic `tool_call` (same handlers)

```json
{"positronic.init": {}}
{"positronic.init": {"brain": "mail", "profile": "long_term", "embed": "local", "force": false}}
{"positronic.init": {"brain": "kairos", "profile": "archival", "force": true, "json": true}}
{"positronic.info": {"json": true}}
{"positronic.stats": {"brain": "kairos", "json": true}}
{"positronic.config": {"brain": "kairos", "key": "profile", "value": "archival", "json": true}}
{"positronic.config": {"brain": "kairos", "key": "profile", "value": "archival", "confirm": true, "json": true}}
{"positronic.brain-test": {"brain": "kairos", "k": 3, "json": true}}
{"positronic.llm-stat": {"json": true}}
{"positronic.llm-setup": {"tier": "3", "json": true}}
{"positronic.update": {"check": true, "json": true}}
{"positronic.update": {"tail": 50, "json": true}}
```

## Notes

- Plugin `src/index.ts` registers `TuiCommand slash:{name:"positronic:*"}` (11 slashes) and `tool: Record<string,ToolDefinition>` `positronic.init|info|stats|config|brain-test|llm-stat|llm-setup|update|delete|query|prune|consolidate` (plus legacy `positronic.recall|ask` thin wrappers over same `activate`/`object_sighting` handlers).
- CLI `dist/cli.js` dispatches `positronic <verb>` → same `run` (parity `--tail/--check/--status`).
- `session.compacted` → `compactBrain`: `prune` live brain + `"session compacted <id>"` consolidation marker (`~/.cache/positronic/prune.log`).
- PII: `config` refuses `*.db` / `memory.db` / `brain_henry`; `remote_key` masked unless `--show-secrets`.
- Deferred `update` uses `~/.cache/positronic/update-<jobId>.log` + `.lock`, polled not SSE.

## Deferred next feature

`export [brain] (--format jsonl|sqlite)`, `import <file> [--dry-run]`, grouped `test+verify` (`engram-verify --deep` = `memeng` + `FTS + HNSW` + DB integrity suite), `forget <object>`, true streaming SSE — all post-v1 when `update` polling proves sufficient. `docs/llama.md` unchanged (consumed by `llm-setup`).

Legacy tools still present: `positronic.recall` / `positronic.ask` (thin wrappers) superseded by flat commands for daily use.
