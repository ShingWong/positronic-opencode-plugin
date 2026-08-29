# positronic-opencode-plugin — positron brain for opencode (beta invite only)

> Beta — invite only — `beta` branch is for private testers. Public users use `main` (lexical tier only) until `beta → main` merge + tag `v0.1.0`. Install gating is token-based, not GitHub ACL (public repo branches are world-readable).

Federated `MemoryEngine` brains for [opencode](https://opencode.ai) — `positronic-engram` stays in its own public repo, pinned via `ENGRAM_TAG` (no vendoring).

## Install (beta)

```bash
opencode plugin add github:ShingWong/positronic-opencode-plugin#beta
# or npm dist-tag (requires token for private beta):
# npm install positronic-opencode-plugin@beta
```

Engine dependency (pinned tag at install):

```bash
export ENGRAM_TAG=v0.2.0
git clone --depth 1 --branch $ENGRAM_TAG https://github.com/ShingWong/positronic-engram
pip install -e positronic-engram/engine  # provides `import memeng`
```

## Quick start — Tier 1 lexical (0 deps, 0.5ms)

Lexical tier uses FTS5 + recency only — no `llama.cpp`, no API key, always works:

```bash
positronic init                                     # no args → explains choices, no side-effects
positronic init --brain kairos --profile balanced --embed lexical  # create brain
# If brain exists → warns "will be OVERWRITTEN ... Re-run with --force" — data WILL be lost
positronic init --brain mail --profile long_term --embed local --force
# Live ingestion is ON by default — every session message is remembered automatically
positronic init --no-live                           # disable live ingestion (add --live to re-enable)
positronic doctor                                    # health checks: lexical/bge/llama/engram
```

Then in opencode every `session.created` auto-wakes and `message.updated` (assistant) auto-ingests to `.positronic/brains/<name>/memory.db` when `live:true` (`config.json`). Disable with `positronic init --no-live` or `positronic config live false`. Legacy `positronic-private/brain_henry/state/memory.db` (880 episodes) is test data — will be deleted before production.

```bash
# manual recall smoke
python3 -c "import sys; sys.path.insert(0,'positronic-engram/engine/src'); from memeng.store import SQLiteStore; from memeng.engine import MemoryEngine; print('lexical recall ok')"
```

**Profiles (how long to remember):** `balanced` (weeks, ~35% kept) · `long_term` (months) · `archival` (never) · `short_term` (days). See `/positronic:init` help or `docs/commands.md`.

**Embeds (how to find):** `lexical` (no setup) · `local` (BGE-M3 :8090) · `remote` (API key).

**Live (default: yes):** `--live` (default) / `--no-live` — wired to `message.updated` ingest (respects `live:false` in `.positronic/config.json`).

## Embed tiers

- **lexical** — FTS5 only (default, Tier 1)
- **local** — `http://127.0.0.1:8090/v1/embeddings` BGE-M3 dim 1024 (Tier 3, needs `llama.cpp` + `bge-embed.service`)
- **remote** — `baseURL + apiKey` (Tier 2, hosted BGE-M3 / OpenAI)

See `docs/llama.md` for Tier 2/3 setup and `docs/bge-embed.service` (proven 2026-08-28).

## Commands (palette + CLI + tools — see `docs/commands.md`)

In opencode TUI: `opencode` → `/` → type `positronic:` → Tab → e.g. `positronic:info --brain kairos --json` Enter.
Each slash has 1:1 agentic tool `positronic.info` → same handler, so `tool_call {"positronic.brain-test":{"brain":"kairos","k":3,"json":true}}` equals slash + `--json`. `positronic doctor` is the legacy health string; `llm-stat` is its focused BGE/llama slice.

Flat `/positronic:*` slashes in opencode (`TuiCommand slash:{name:"positronic:init"}`), 1:1 `positronic.*` tools, and `positronic <verb> --json` CLI parity:

| Palette | CLI | Example |
|---|---|---|
| `/positronic:init` | `positronic init [--brain mail --profile long_term --embed local [--live|--no-live] [--force]]` | no args → help; live default yes; warn on overwrite |
| `/positronic:info` | `positronic info --json` | version + ENGRAM_TAG + brains |
| `/positronic:stats` | `positronic stats --json` | federated `{episodes}` per brain |
| `/positronic:config` | `positronic config profile archival --confirm --json` | `E7 55/55/35/7` confirm gate |
| `/positronic:brain-test` | `positronic brain-test --k 3 --json` | probe `new_event → activate` |
| `/positronic:llm-stat` | `positronic llm-stat --json` | `bge/llama` tiers, pooling `cls` |
| `/positronic:llm-setup` | `positronic llm-setup --tier 3 --json` | guide `606MB bge-m3` |
| `/positronic:update` | `positronic update --check --json` | deferred `~/.cache/positronic/update-<jobId>.log` |
| `/positronic:delete` | `positronic delete --brain <name> [--force]` | warn before permanent delete |

Agentic tool_call: `{"positronic.brain-test":{"brain":"kairos","k":3,"json":true}}`.

> Deferred next feature: `/positronic:export` / `/positronic:import` (brain JSONL portability) + grouped `test+verify` (`engram-verify --deep`).

Legacy tools still present: `positronic.recall` / `positronic.ask` (thin wrappers over same `activate`/`object_sighting` handlers).

## Federation

Each brain is a SQLite file `.positronic/brains/{name}/memory.db` + `config.json` retention profile (`engine.py:48` — survival `55/55/35/7`).

## License

MIT
