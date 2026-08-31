# Positronic — Memory for opencode

### Federated, polytemporal, tensor-grounded memory that outlives the session

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![SQLite Powered](https://img.shields.io/badge/Storage-SQLite-lightgrey)]()
[![Local First](https://img.shields.io/badge/Local--First-success)]()
[![Recall](https://img.shields.io/badge/Recall-0.7ms%20store%20%E2%80%94%20real%20%CE%940.44-brightgreen)]()

Positronic gives your agent a memory that actually **remembers** — across sessions, weeks, and projects.

It's not a vector store wrapper, not a summarization window. It's a **polytemporal MemoryEngine** that decides what matters, keeps it, and recalls it fast.

Every assistant turn is saved to a local SQLite brain (`.positronic/brains/<name>/memory.db`) automatically.
No cloud. No manual `remember` calls. No opaque summarizers.
Just deterministic, auditable, tensor-grounded memory.

---

## Table of Contents

- [Why Positronic?](#why-positronic)
- [How fast is it?](#how-fast-is-it)
- [Polytemporal retention — every event carries a time vector](#polytemporal-retention--every-event-carries-a-time-vector)
- [Retention — pick a curve](#retention--pick-a-curve)
- [Logical time τ](#logical-time-τ)
- [Tensor-grounded objects — why recall is cheap](#tensor-grounded-objects--why-recall-is-cheap)
- [100% auditable](#100-auditable)
- [Real-world: email at scale](#real-world-email-at-scale)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Build with Positronic-Engram](#build-with-positronic-engram)
- [License](#license)

---

## Why Positronic?

Most agent memory stores everything, forgets nothing, and brute-forces the context window.
Positronic **curates** instead:

- **Federated** — one SQLite brain per concern (`kairos`, `mail`, `research`). Query one, or fuse across all with RRF.
- **Polytemporal retention** — `balanced` / `long_term` / `archival` / `short_term`. Not TTL, not FIFO — survival curves.
- **Tensor-grounded objects** — entities become evolving tensor objects that persist across episodes.
- **Structural recall efficiency** — objects eliminate multi-vector search, graph traversal, and reranking loops.
- **Local-first** — Tier 1 lexical (FTS5) works anywhere; Tier 3 semantic adds BGE-M3 on your GPU.
- **Live by default** — `chat.message` auto-ingests every turn.
- **Paper-grade** — validated on LongMemEval, RULER, and the E7 synthetic benchmark.

Deep dive lives in the research repo:
**[https://github.com/ShingWong?tab=repositories](https://github.com/ShingWong?tab=repositories)**

---

## How fast is it?

Two honest numbers, two different layers:

- **The store** — `p95 0.7 ms` on the synthetic harness.
  SQLite + FTS5 + RRF → the "0.5–2 ms" you see in demos.

- **The full pipeline** — `p95 ~210 s` end-to-end on real LongMemEval `n=50`
  (ingest ~550 messages, embed, two LLM passes, judge).
  Recall `0.58` with memory vs `0.14` without → **Δ 0.44**.

Bonus: top-8 retrieval uses a flat **~242 tokens** vs the full haystack (which grows from **~2,249** at 4k to **~18,000** at 32k) — about **1/10th to 1/74th** of the context, with recall@1 1.0.

> The store is instant. The pipeline takes what the LLMs take. Both are real.

---

## Polytemporal retention — every event carries a time vector

Most systems stamp an event with one timestamp and call it done.
Positronic stores **four**:

| Coordinate | What it is |
|---|---|
| `wall` | the human calendar time it happened |
| `mono` | the order it arrived in the stream |
| `tau` | the agent's **subjective** time — how much it felt like |
| `fuzz` | the confidence interval around "when" |

Decay doesn't run on wall-clock. It runs on **Δτ** — the subjective distance.
That's what makes retention a *curve*, not a TTL counter, and why quiet weeks and eventful weeks age differently.

---

## Retention — pick a curve

Same 55 messages, 78 weeks, four policies (`engine.py:48`):

| Profile | Horizon | @Week 78 |
|---|---|---|
| `balanced` | weeks | 35 / 55 |
| `long_term` | months | 55 / 55 |
| `archival` | forever | 55 / 55 |
| `short_term` | days | 7 / 55 |

`balanced` is the everyday default.
`archival` never forgets — it grows forever, so it's gated behind a confirm.

---

## Logical time τ

Positronic doesn't decay on wall-clock time.
Every event gets a **τ** — its position in the agent's subjective timeline — driven by novelty, prediction error, and arousal.

Quiet stretches barely move τ; surprises spike it.
Decay runs on **Δτ**, not timestamps.

Short horizons: all profiles behave alike.
Long horizons: the curves split — exactly what E7 shows.

---

## Tensor-grounded objects — why recall is cheap

Each message gets scanned for entities.
Those become **tensor-grounded objects** that live across episodes:

- first sighting creates them
- later sightings update them
- edges accumulate
- schemas emerge
- salience adjusts
- identity stabilizes

Recall often hits the object **directly** — no graph walk, no reranking loop, no multi-vector search.

**The tensor does the magic.**

Objects are SQLite rows with embeddings, characteristics, and update history — deterministic, auditable, stable for months or years.

---

## 100% auditable

Everything — episodes, objects, τ, salience, edges, embeddings — is a plain SQLite table.

`SELECT * FROM episode` works.
`SELECT * FROM object` works.
`SELECT * FROM object_sighting` works.

Great for debugging, compliance, reproducibility, or simply trusting your agent's memory.

---

## Real-world: email at scale

Positronic eats mailboxes:

- **38k messages**
- **2007 → 2026**
- one episode per message
- attachments as object-rich sub-episodes
- entities as tensor objects
- cross-episode edges automatically formed
- instant recall

*"Show every Liqui-Fire thread from last June."* → instant, local, auditable.

This is where polytemporal retention + tensor objects shine:
snapshot-like recall across decades of email.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash
```

Project-local:

```bash
curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash -s -- --project
```

Needs only `git`, `node >=18`, `npm`, `python3 >=3.10`.
Tier 1 (lexical) works with zero setup.

---

## Quick start

```bash
positronic init --brain kairos --profile balanced --embed lexical
positronic query "memory engine" --brain kairos --k 8 --json
positronic stats --json
```

---

## Commands

| Command | What it does |
|---|---|
| `positronic init` | create / configure a brain |
| `positronic info` | show installed tiers |
| `positronic stats` | episode counts + profiles |
| `positronic config` | retention, embed tier, live ingestion |
| `positronic query` | FTS5 + RRF retrieval (+ objects, anchors, sightings) |
| `positronic brain-test` | probe recall latency |
| `positronic llm-stat` | BGE / LLM tier health |
| `positronic update` | pull the latest plugin + engine |
| `positronic delete` | remove a brain |

Every command works three ways:
slash `/positronic:*`, agentic `positronic.*` tool, or the CLI.

Full reference: `docs/commands.md`.

---

## Build with Positronic-Engram

`positronic-engram` is the engine behind this plugin — polytemporal `time_vector`, τ, retention profiles, salience gating, tensor objects, deterministic recall.

It's **GPL-3** and ready to embed in your own agents.

Footprint: the SQLite core is **<50 MiB**.
Serving embeddings + an LLM adds BGE-M3 (~0.6 GiB) and Qwen3 (~15 GiB).
The core is tiny — the models are the models.

Explore the full ecosystem:
**[https://github.com/ShingWong?tab=repositories](https://github.com/ShingWong?tab=repositories)**

---

## License

GPL-3.0-or-later — see `LICENSE`.