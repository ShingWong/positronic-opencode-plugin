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

**Delegation:** every verb is delegated to the PAI package `positronic_ai`
(`positronic-agent-interface`, Task 8). `src/index.ts` is a thin opencode glue
layer only — each tool/slash/hook handler calls
`spawnSync("python3", ["-m", "positronic_ai", verb, ...], {cwd})` and returns
the parsed stdout JSON. `src/cli.ts` forwards `positronic <verb>` the same way
(no `loadConfig`, no direct memeng/embed access, no zod config parsing in the
plugin). The old TS core (`src/commands/*`, `src/brains.ts`, `src/embed.ts`,
`src/doctor.ts`, `src/wizard.ts`, `src/config.ts`) was deleted.

The opencode plugin wires the same lifecycle:

- `session.created` → PAI `info --json` probe (delegated config probe; no `loadConfig`)
- `chat.message` → `ingestLive` every assistant turn (`tau` advances on arousal/novelty) — non-TTY `opencode run:1` does NOT deliver `chat.message:83:1`
- `event` → `session.compacted` → `compactBrain` (fire-and-forget): PAI `prune` the live brain + PAI `consolidate` a content-carrying boundary marker (`~/.cache/positronic/prune.log`; **marker text lives in `features_json.body_text`, not `subject_norm` — that truncates at 80 chars**)
- tools: `positronic.recall`, `positronic.ask`, `positronic.prune`, `positronic.consolidate` + flat `positronic.*` (see `docs/commands.md`)
- slashes: 12 flat `{ title: "positronic:*", slash: { name: "positronic:*" } }` palette entries (`src/index.ts` positronicCommands) — every handler spawns PAI
- CLI: `positronic <verb> --json | --sql | --anchors | --objects | --sightings` (`dist/cli.ts`) — thin delegate to `python3 -m positronic_ai <verb>`

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

### Polytemporal objects — recall returns a digest, `ask` reveals depth

An **object is a family of time-stamped sightings** (messages + consolidations
pointing at one canonical entity). The engine preserves the family; the agent
(the frontal lobe) decides how deep to dig:

- `recall "<cue>"` returns the live matches **plus an `object` block** when the
  cue fuzzy-matches an object. The block is a **digest, not the data**:
  `{canonical_name, kind, status, versions:{sighting_count, tau_span, latest_consolidation, oldest_tau}}`.
  Read the digest to know *polytemporal depth exists* — do not assume the
  latest consolidation is the whole truth.
- When the digest is not enough, **dig deeper**: `ask "<object>"` returns the
  full τ-ordered dossier — every sighting with its own `tau`, `wall`, `kind`.
  This is the same move as opening older commits when debugging which version
  caused a bug: read the headline first, then decide how far back to go.
- The **latest consolidation** is the distilled version of the object; older
  τ sightings are earlier truths. Which one answers the current query is the
  agent's call — that is the polytemporal judgment the engine cannot make.

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
| `/positronic:prune` | `positronic.prune` | `positronic prune --json` | run τ-decay `engine.prune()` on the live brain; `{scanned, day_merged, week_merged, expired, residues, objects_dormant, objects_forgotten}`; skips `live:false` |
| `/positronic:consolidate` | `positronic.consolidate` | `positronic consolidate "<summary>" [--arousal N] --json` | write `kind='consolidation'` event (`tau` advances; `{tau, encoded, episode_id}`); compaction auto-writes `"session compacted <id>"` marker |

Deferred next feature: `export`, `import`, grouped `test+verify` (`engram-verify --deep` suite) — post-v1 when `update` polling proves sufficient.

CLI parity: `dist/cli.js` delegates `positronic <verb>` → `python3 -m positronic_ai <verb>`; `docs/commands.md` is the reference.

## Pin & install

```bash
export ENGRAM_TAG=v0.2.0
git clone --depth 1 --branch $ENGRAM_TAG https://github.com/ShingWong/positronic-engram
pip install -e positronic-engram/engine
pip install -e /usr/local/devel/positronic/positronic-agent-interface   # PAI (positronic_ai)
opencode plugin add github:ShingWong/positronic-opencode-plugin#beta
positronic init --embed lexical
```

The plugin requires the PAI package installed (`python3 -m positronic_ai`)
to serve any verb. State lives at `.positronic/config.json` +
`.positronic/brains/{name}/memory.db` (unchanged).

Store: `.positronic/brains/*/memory.db` (gitignored, never commit — see `.gitignore:1` PII firewall)

Schema + semantics: `positronic-research/papers/temporal-perception-in-AI/25-polytemporal-schema.md` and `26-beyond-sql.md`. Retention profiles: `engine/src/memeng/engine.py:48` `balanced|archival|long_term|short_term` (E7 survival 55/55/35/7).
