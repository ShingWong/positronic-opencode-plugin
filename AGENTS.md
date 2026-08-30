# AGENTS.md — positronic-opencode-plugin

## Brain access (federated, per-project)

Each project has federated brains under `.positronic/brains/{name}/memory.db` + `.positronic/config.json`. Same `kairos_brain` API as `positronic-private/AGENTS.md:12`, but store paths point to `.positronic/brains/`:

```python
import sys
sys.path.insert(0, "/usr/local/devel/positronic/positronic-engram/engine/src")
from memeng.store import SQLiteStore
from memeng.engine import MemoryEngine
from pathlib import Path

# Example: open a project brain
project_dir = Path.cwd() / ".positronic"
cfg = __import__("json").loads((project_dir / "config.json").read_text()) if (project_dir / "config.json").exists() else {"brains": {}}
# Positronic wizard equivalent of kairos_brain.remember / recall / ask:
#   remember("deployed memory engine v0", arousal=0.4)
#   recall("liqui-fire")            # fused fuzzy recall (RRF across brains)
#   ask("genesis stuff")             # full object dossier
#   stats()

# Direct engram usage (mirrors kairos_brain.py internals):
store = SQLiteStore(str(project_dir / "brains" / "kairos" / "memory.db"))
engine = MemoryEngine(store)
engine.init_database()
```

## Plugin equivalent (TypeScript via opencode hooks)

The opencode plugin (`src/index.ts`) wires the same lifecycle:

- `session.created` → `wake()` if `.positronic/brains/*/memory.db` exists else `positronic init` wizard
- `chat.message` → `ingestLive` every assistant turn (`tau` advances on arousal/novelty) — non-TTY `opencode run:1` does NOT deliver `chat.message:83:1`
- `event` → `session.created/session.compacted` diagnostics (TTY only)
- tools: `positronic.recall`, `positronic.ask` + flat `positronic.*` (see `docs/commands.md`)
- slashes: 9 flat `{ title: "positronic:*", slash: { name: "positronic:*" } }` palette entries (`src/index.ts:24:1` positronicCommands, `src/commands/*: run`)
- CLI: `positronic <verb> --json | --sql | --anchors | --objects | --sightings` (`dist/cli.ts`)

### Improving recall — use the `query` verb

The brain is a **polytemporal engram** — events accrue `tau` with arousal/novelty, decay under retention profiles. Before re-deriving anything, **query first**:

```bash
positronic query "liqui-fire engine" --brain kairos --k 8 --json
positronic query --anchors --brain kairos --json          # durable high-salience events
positronic query --objects --brain kairos --json        # extracted entity graph
positronic query --sightings --brain kairos --json      # which episode mentions which entity
positronic query --sql "SELECT COUNT(*) c FROM episode" --brain kairos --json
```

- `query "<text>"` → FTS5 vector-RRF recall `0.5-2ms:1` returns `{tau, rrf_score, snippet, wall, fallback:1}` (`engine.activate:352:1`)
- If empty + `fallback:1` → episode pruned (tau beyond `long_term S_base=120 ~4mo:1`); switch profile `archival:1` or `never prunes:1`
- Anchor events (`salience >= anchor_salience:1`, `is_anchor=1:1`) are the durable memory hooks — follow `anchor_edge.is_anchor:1`
- Objects (`get_or_create_object dedupe 610:1`) auto-extracted from anchor text — reuse node IDs

## Commands (flat, `--json` + tool_call)

| Slash (`/`) palette | Tool | CLI | Notes |
|---|---|---|---|
| `/positronic:info` | `positronic.info` | `positronic info --json` | version + ENGRAM_TAG + brains + tiers |
| `/positronic:stats` | `positronic.stats` | `positronic stats [--brain kairos] --json` | `{episodes}` per `.positronic/brains/*/memory.db` |
| `/positronic:config` | `positronic.config` | `positronic config [profile archival --confirm] --json` | `E7 55/55/35/7` confirm gate; blocks `*.db` |
| `/positronic:brain-test` | `positronic.brain-test` | `positronic brain-test --k 3 --json` | `{"positronic.brain-test":{"brain":"kairos","k":3,"json":true}}` |
| `/positronic:query` | `positronic.query` | `positronic query "<text>" --k 8 --json` | FTS5+RRF text search; `--sql --anchors --objects --sightings` |
| `/positronic:llm-stat` | `positronic.llm-stat` | `positronic llm-stat --json` | `bge/llama` tiers, pooling `cls` |
| `/positronic:llm-setup` | `positronic.llm-setup` | `positronic llm-setup --tier 3 --json` | guide `606MB bge-m3-Q8_0.gguf` |
| `/positronic:update` | `positronic.update` | `positronic update [--check|--tail 50|--status <jobId>] --json` | deferred `~/.cache/positronic/update-<jobId>.log` |
| `/positronic:delete` | `positronic.delete` | `positronic delete --brain <name> --force` | wipe brain + db |

Deferred next feature: `export`, `import`, grouped `test+verify` (`engram-verify --deep` suite) — post-v1 when `update` polling proves sufficient.

CLI parity: `dist/cli.js` dispatches `positronic <verb>` → same `commands/*: run`; `docs/commands.md` is the reference.

## Pin & install

```bash
export ENGRAM_TAG=v0.2.0
git clone --depth 1 --branch $ENGRAM_TAG https://github.com/ShingWong/positronic-engram
pip install -e positronic-engram/engine
opencode plugin add github:ShingWong/positronic-opencode-plugin#beta
positronic init --embed lexical
```

Store: `.positronic/brains/*/memory.db` (gitignored, never commit — see `.gitignore:1` PII firewall)

Schema + semantics: `positronic-research/papers/temporal-perception-in-AI/25-polytemporal-schema.md` and `26-beyond-sql.md`. Retention profiles: `engine/src/memeng/engine.py:48` `balanced|archival|long_term|short_term` (E7 survival 55/55/35/7).
