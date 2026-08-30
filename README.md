# positronic-opencode-plugin — Polytemporal Memory for opencode

> **Give your agent a memory that outlives the session.**

`positronic` is a federated, polytemporal `MemoryEngine` for [opencode](https://opencode.ai) — not another vector-store wrapper. It remembers *what mattered*, forgets what didn't, and reconstructs answers on demand. Every chat turn auto-ingests to a local SQLite brain (`.positronic/brains/<name>/memory.db`), survives months, and recalls in **0.5–2 ms** via FTS5 + RRF.

**Beta — invite only:** `beta` branch is for private testers. Public users use `main` (lexical tier) until `beta → main` merge + tag `v0.1.0`. Repo is public, gating is invite-based.

---

## Why another memory system?

Single-brain memory (one LLM or one embedding index decides everything) fails the way human memory doesn't: it stores verbatim, never forgets, and retrieves by brute-force context stuffing.

Positronic is a **federation of small, specialized subsystems** — salience gating, episodic encoding, semantic distillation, retention profiles — none intelligent alone, just like cortex. The thesis (see `positronic-research/papers/`):

> **Curation, not intelligence, is the hard problem of memory.**

What you get:

- **Polytemporal** — events accrue `tau` (logical time) with arousal/novelty, then decay under a *retention profile*. Not TTL, not FIFO — survival curves.
- **Federated** — one SQLite file per concern (`.positronic/brains/kairos`, `mail`, `research`…) — query one or RRF across all.
- **Local-first** — no cloud required. Tier 1 `lexical` (FTS5) works everywhere; Tier 3 `local` adds BGE-M3 semantic on your GPU; Tier 2 `remote` is optional.
- **Live by default** — `chat.message` hook auto-ingests every assistant turn. No manual `remember` calls.
- **Paper-grade, not demo-grade** — harness at `consumers/benchmarks` runs LongMemEval, RULER, and synthetic E7 with the *same* `SQLiteStore` + `MemoryEngine` your plugin uses.

### How it compares

| System | Storage | Forgetting | Retrieval | Latency (our bench) | GC / Cost |
|---|---|---|---|---|---|
| **Positronic** | SQLite + FTS5 + (opt. HNSW), one file per brain | **Retention profiles** `balanced/long_term/archival/short_term` `S_base 30/120/1e6` → `E7 55/55/35/7` at `wk78` | **FTS5 RRF + recency + salience** `top-8` snippets (`~50 tok/hit`) | **0.5–1.6 ms** `p50 0.49 ms` `p95 0.69 ms` @ `n=50` lexical | Local, no per-token embed cost; `1/18` tokens of full haystack |
| **Mem0** | Vector DB + graph, cloud | TTL / manual | Embed + LLM rerank | `~30–80 ms` embed + `~500 ms` LLM (reported) | Cloud embed + API calls |
| **Zep** | Postgres + vector + graph (temporal) | Summarization window | Hybrid search + summarizer LLM | `~20–40 ms` + summarizer | Cloud or self-host PG |
| **Letta / MemGPT** | Agent self-edits context + archival DB | Agent decides (self-modifying) | Agent loops over archival | Variable, agent-dependent | Extra LLM calls to manage memory |
| **LangGraph Memory / OpenAI Memory** | Key-value + thread store | Manual / TTL | Naive RAG | Depends on vector DB | Vendor-locked |

**Headline numbers — same `MemoryEngine` your install uses:**

- **LongMemEval synthetic `n=50` `balanced` `lexical`:** `recall@1 1.0` `fallback 0.0` `mean_rrf 0.0164` `p95 0.69 ms` `p50 0.49 ms` *(50 episodes, `results/longmemeval/run-1788007702/metrics.json`)*
- **Synthetic E7 replication `55 events → 78 wks`:** `archival 55/55` `long_term 55/55` `balanced 35/55` `short_term 7/55` `profile_order_ok true` — matches paper `E7 55/55/35/7` (`engine.py:48` `S_base 30/120/1e6/…`) *(`results/synthetic_e7/run-1788007709/metrics.json`)*
- **RULER 8k NIAH `n=5` `lexical`:** `recall@1 1.0` `token_ratio 0.0538` (`242 tok with` `vs 4496 tok without` → **1/18**) `p95 1.58 ms` `note: with=top-8 RRF vs without=full haystack` *(`results/ruler/run-1788009259/metrics.json`)*
- **Real LongMemEval `n=5` HF `THUDM/LongMemEval`:** `acc_with 1.0` `acc_without 0.0` `Δ 1.0` with only `~2k tok` injected (vs `~7.5k tok` haystack truncated) — lexical fallback gated, LLM judge recommended for final paper

> Ruler ratio headline: **1/16th at 32k** `top-8` (`200 chars/hit`); retention-profile invariance at `Δτ<5` (`balanced==archival==long_term` by design) — profile separation only appears at long horizons like E7.

Run them yourself:

```bash
pytest tests/ -q                          # 14 passed + 1 skipped (ruler real gated)
python3 -m suites.longmemeval.driver --n 5 --embed lexical --synthetic
python3 -m suites.synthetic_e7.driver --n 55
python3 -m suites.ruler.driver --n 5 --length 8000 --embed lexical
```

---

## Installation — one line, git-updatable, no vendor lock

### One-liner (recommended, CI/CD-friendly)

Clones via `git` so `git pull && npm run build` updates — no `npm` dist-tag needed:

```bash
curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash
# project-local instead of global:
curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash -s -- --project
# pin engram or plugin branch:
ENGRAM_TAG=main PLUGIN_BRANCH=beta bash <(curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh)
```

What it does (idempotent):

1. `git clone --depth 1 --branch beta` → `~/.local/share/positronic/positronic-opencode-plugin` (or `git pull --ff-only` if exists)
2. `git clone` → `~/.local/share/positronic/positronic-engram` (`ENGRAM_TAG` tag/branch or `main`)
3. `npm install && npm run build` (checks `dist/index.js` has `chat.message` hook, `PluginModule {id, server}`)
4. `pip install --break-system-packages -e engram/engine` (best-effort, provides `import memeng`)
5. Patches `~/.config/opencode/opencode.jsonc` (global, default) **or** `.opencode/opencode.json` (`--project`) with `file://` URI — preserves other plugins (e.g. `superpowers`)
6. Writes 10 slashes `~/.config/opencode/commands/positronic-*.md` (`init`, `info`, `stats`, `config`, `brain-test`, `llm-stat`, `llm-setup`, `update`, `delete`, `query`)
7. Verifies `node dist/cli.js info --json` `tiers: lexical ok` `chat.message hook present`

**Prerequisites:** `git`, `node >=18`, `npm`, `python3 >=3.10`, `pip`. No `llama.cpp`, no API key — Tier 1 lexical works out of the box.

**Update later (CI/CD):**

```bash
cd ~/.local/share/positronic/positronic-opencode-plugin && git pull && npm run build
# or re-run the curl | bash
```

### Manual (if you prefer `opencode plugin` or `file://`)

```bash
export ENGRAM_TAG=v0.2.0  # or main
git clone --depth 1 --branch $ENGRAM_TAG https://github.com/ShingWong/positronic-engram
pip install -e positronic-engram/engine  # or --break-system-packages on Debian

git clone --depth 1 --branch beta https://github.com/ShingWong/positronic-opencode-plugin.git
cd positronic-opencode-plugin && npm install && npm run build

# global (all projects):
opencode plugin add "positronic-opencode-plugin@file://$PWD" --global
# or project-local:
mkdir -p .opencode && printf '{\n  "$schema":"https://opencode.ai/config.json",\n  "plugin":["positronic-opencode-plugin@file://%s"]\n}\n' "$PWD" > .opencode/opencode.json

# verify
node dist/cli.js info --json
node dist/cli.js stats --json
```

**Troubleshooting:**

- `git dep preparation failed` on `opencode plugin add git+https` → use the `curl | bash` file:// method above (buns `git+https` needs `bun` CLI, not just opencode's bundled bun).
- `ModuleNotFoundError: No module named 'memeng'` → `pip install --break-system-packages -e ~/.local/share/positronic/positronic-engram/engine`
- `UnknownError` / model stream crash (`Qwen 27B undefined`) → unrelated to plugin (LLM provider), `~/.cache/positronic/ingest.log` still shows `chat.message ingest`
- No `/positronic:*` in TUI → restart `opencode` TUI after install (palette loads `~/.config/opencode/commands/` on start)

---

## Quick start — Tier 1 lexical (0 deps, 0.5 ms)

```bash
positronic init                                     # no args → explains choices, no side-effects
positronic init --brain kairos --profile balanced --embed lexical  # create brain
# If brain exists → warns "will be OVERWRITTEN ... Re-run with --force" — data WILL be lost
positronic init --brain mail --profile long_term --embed local --force
# Live ingestion is ON by default — every assistant turn → .positronic/brains/<name>/memory.db
positronic init --no-live                          # disable live ingestion
positronic stats --json
positronic query "memory engine" --brain kairos --k 8 --json
```

Then in opencode every `session.created` auto-wakes and `chat.message` (assistant) auto-ingests when `live:true` (`config.json`). Disable with `positronic config live false` or `positronic init --no-live`.

---

## Commands — palette + CLI + tools (see `docs/commands.md`)

Every command is three ways: slash `/positronic:*` in TUI, agentic `tool_call` `positronic.*`, and shell `positronic <verb>`. Same `src/commands/*: run` behind all three.

| Slash | Tool | CLI | Options & Effect | Output (`--json`) |
|---|---|---|---|---|
| `/positronic:init` | `positronic.init` | `positronic init` | `--brain <name>` name (default `kairos`); `--profile balanced\|long_term\|archival\|short_term` retention: `balanced` weeks ~35% kept, `long_term` months, `archival` never forgets (grows forever), `short_term` days; `--embed lexical\|local\|remote` how to find: `lexical` FTS5 no setup, `local` BGE-M3 `:8090`, `remote` API key; `--live`/`--no-live` live ingestion default `true`; `--force` overwrite existing (data loss); `--json` | No args → `{ok:false, warning:"Pick how..."}` (no side-effects); with args → `{ok, brains, created, existing, live, configPath}` or `{ok:false, warning:"will be OVERWRITTEN ... Re-run with --force"}` |
| `/positronic:info` | `positronic.info` | `positronic info` | `--dir <path>` project dir; `--json` | `{version, engram_tag, brains, tiers:{lexical,bge,llama,engram,pooling}}` |
| `/positronic:stats` | `positronic.stats` | `positronic stats` | `--brain <name>` filter one brain; `--dir`; `--json` | `{brains:{<name>:{episodes, profile, embed}}, _note if none}`; no arg = all `.positronic/brains/*` |
| `/positronic:config` | `positronic.config` | `positronic config` | `<key> [<value>]` get/set; `--brain <name>` scope; `--confirm` required for `profile=archival` (E7 55/55/35/7 gate); `--show-secrets` unmask `remote_key`; `--json` | Get: masked config; Set: `{changed, before, after, warning?}`; blocks `*.db`/`memory.db` |
| `/positronic:brain-test` | `positronic.brain-test` | `positronic brain-test` | `--brain kairos` brain; `--k 3` top-k recall; `--dir`; `--json` | `{ok, hits, encode_ms, recall_ms, fallback, rrf_score}` probe `positronic:probe` `new_event→activate` |
| `/positronic:query` | `positronic.query` | `positronic query` | `"<text>"` FTS5 RRF; `--brain`; `--k 8`; `--sql "<SQL>"` raw SQLite; `--cue "<text>"` semantic cue; `--anchors` durable `is_anchor=1`; `--objects` entity graph; `--sightings` episode↔object; `--json` | FTS: `{ms, hits, results:[{episode_id, rrf_score, snippet, tau, fallback}]}`; SQL/anchors/objects/sightings as JSON; `fallback:true` = pruned (switch to `archival`) |
| `/positronic:llm-stat` | `positronic.llm-stat` | `positronic llm-stat` | `--json` | `{bge, llama, lexical, engram, pooling:cls\|unknown}` `:8090` health, `bge-m3-Q8_0.gguf` dim 1024 |
| `/positronic:llm-setup` | `positronic.llm-setup` | `positronic llm-setup` | `--tier 1\|2\|3` guide; `--json` | `{tier, guide}` human slice of `docs/llama.md` (Tier 3: `606MB bge-m3` + `bge-embed.service Restart=always`) |
| `/positronic:update` | `positronic.update` | `positronic update` | `--check` dry `git ls-remote` `{behind,engramTagDiff}`; `--status <jobId>`; `--tail N`; `--pin v0.2.x`; `--json` (default spawns `~/.cache/positronic/update-<jobId>.log`) | `{jobId, status, logPath}` + `logTail` polling (not SSE) |
| `/positronic:delete` | `positronic.delete` | `positronic delete` | `--brain <name>`; `--force` confirm; `--dir`; `--json` | Warn before permanent `rm -rf .positronic/brains/<name>` |
| *(legacy)* | `positronic.recall` / `positronic.ask` | — | `dir, text, k` / `dir, object` | Thin wrappers over `activate`/`object_sighting`, superseded by `query` |

**Option effects in detail:**

- **Profile** (`engine.py:48` `S_base`): `balanced 30` (weeks), `long_term 120` (months, `0.35 @ Δτ126` ~4mo), `archival 1e6` (never, `∞`), `short_term 7` (days). Tested `E7 55/55/35/7` (`synthetic_e7`).
- **Embed**: `lexical` = FTS5 + recency (0.5 ms, always works); `local` = BGE-M3 `127.0.0.1:8090` dim 1024 pooling `cls` (18–35 ms, needs `bge-m3-Q8_0.gguf`); `remote` = `baseURL+apiKey` (Tier 2).
- **Live**: `true` (default) → `chat.message` hook (`opencode 1.18+`, interactive TTY only; `opencode run` non-TTY does NOT deliver `chat.message`) → `ingestLive` → `new_event` → `.positronic/brains/<name>/memory.db`. `false` → only manual `brain-test`/`query` writes. Check `~/.cache/positronic/ingest.log`.
- **Force**: required to overwrite existing `.positronic/brains/<name>/memory.db` — without it you get a warning, no write.

```bash
positronic init --json                  # help
positronic init --brain mail --profile long_term --embed local --json
positronic stats --brain kairos --json
positronic query "liqui-fire" --brain kairos --k 8 --json
positronic query --anchors --json       # durable high-salience
positronic query --objects --json       # entity graph
positronic query --sql "SELECT COUNT(*) c FROM episode" --json
```

Agentic `tool_call` equivalents: `{"positronic.init":{"brain":"mail","profile":"long_term"}}`, `{"positronic.query":{"text":"memory engine","k":8}}`, etc.

---

## Contribute — help us beat the baselines

Positronic is research-grade but beta — we need your workloads to make it production. Ways to help:

- **Test the installer** — run the one-liner on a fresh machine/VM and file an issue with `~/.cache/positronic/ingest.log` + `positronic info --json` + `positronic stats --json`.
- **Run benchmarks on your data** — `pytest` + `python3 -m suites.synthetic_e7.driver --n 55` and share `metrics.json`. Real `LongMemEval`/`RULER` with `--real` needs `datasets` + `HF_TOKEN` — we especially want `local` tier (`:8090` BGE-M3) numbers.
- **Try the edge cases** — `archival` vs `balanced` at long `Δτ`, `local` vs `lexical`, multi-brain federation (`kairos` + `mail` + `research`), `live:false` vs `live:true`.
- **PRs welcome** — `install.sh`, `src/commands/*`, `harness/`, `docs/` — run `npm run build && pytest tests/ -q && vitest run` before PR. PII firewall: never commit `*.db`, `memory.db`, `brain_henry/state`.

Issues & ideas: https://github.com/ShingWong/positronic-opencode-plugin/issues  
Research + benchmark plan: `positronic-research/docs/superpowers/plans/2026-08-29-positronic-benchmarks.md` and `consumers/benchmarks/README.md`  
Discussions: tag `@ShingWong` on the `beta` branch — we merge beta→main weekly.

If positronic saved you a context window, star the repo, tell a tester, and run `positronic brain-test --k 3 --json` — we'd love the `ms` numbers.

---

## Federation

Each brain is a SQLite file `.positronic/brains/{name}/memory.db` + `config.json` retention profile (`engine.py:48` — survival `55/55/35/7`).

## License

GPL-3.0-or-later — see `LICENSE`.
