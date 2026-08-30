#!/usr/bin/env bash
# positronic one-line installer — fetches from GitHub, zero deps beyond git/node/python3
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash -s -- --help
#   curl -fsSL ... | bash -s -- --global   # default: global (~/.config/opencode/opencode.jsonc)
#   curl -fsSL ... | bash -s -- --project  # project-local (.opencode/opencode.json)
set -euo pipefail

PLUGIN_REPO="https://github.com/ShingWong/positronic-opencode-plugin.git"
PLUGIN_BRANCH="${PLUGIN_BRANCH:-beta}"
ENGRAM_REPO="https://github.com/ShingWong/positronic-engram.git"
ENGRAM_REF="${ENGRAM_TAG:-main}"  # tag or branch; falls back to main if not found
INSTALL_ROOT="${POSITRONIC_HOME:-$HOME/.local/share/positronic}"
PLUGIN_DIR="$INSTALL_ROOT/positronic-opencode-plugin"
ENGRAM_DIR="$INSTALL_ROOT/positronic-engram"
CONFIG_GLOBAL="$HOME/.config/opencode/opencode.jsonc"
CONFIG_PROJECT=".opencode/opencode.json"
COMMANDS_DIR="$HOME/.config/opencode/commands"

MODE="global"
for arg in "$@"; do
  case "$arg" in
    --global) MODE="global" ;;
    --project) MODE="project" ;;
    --help|-h) echo "Usage: install.sh [--global|--project]"; echo "  --global  write to $CONFIG_GLOBAL (default, CID-friendly file://)"; echo "  --project write to $CONFIG_PROJECT"; exit 0 ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }
log() { printf "\033[1;34m[positronic]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[error]\033[0m %s\n" "$*"; exit 1; }

have git || die "git not found"
have node || die "node not found (need >=18)"
have npm || die "npm not found"
have python3 || die "python3 not found"

mkdir -p "$INSTALL_ROOT"
# --- plugin ---
if [ -d "$PLUGIN_DIR/.git" ]; then
  log "Updating plugin $PLUGIN_DIR ($PLUGIN_BRANCH)..."
  git -C "$PLUGIN_DIR" fetch origin "$PLUGIN_BRANCH" --depth 1 2>&1 | tail -n 5 || true
  git -C "$PLUGIN_DIR" checkout "$PLUGIN_BRANCH" 2>&1 | tail -n 5 || git -C "$PLUGIN_DIR" checkout -B "$PLUGIN_BRANCH" "origin/$PLUGIN_BRANCH" 2>&1 | tail -n 5 || true
  git -C "$PLUGIN_DIR" pull --ff-only 2>&1 | tail -n 5 || warn "git pull failed, using existing"
else
  log "Cloning plugin $PLUGIN_BRANCH -> $PLUGIN_DIR..."
  rm -rf "$PLUGIN_DIR"
  git clone --depth 1 --branch "$PLUGIN_BRANCH" "$PLUGIN_REPO" "$PLUGIN_DIR" 2>&1 | tail -n 5
fi
# --- engram ---
if [ -d "$ENGRAM_DIR/.git" ]; then
  log "Updating engram $ENGRAM_DIR..."
  git -C "$ENGRAM_DIR" fetch origin --depth 1 2>&1 | tail -n 5 || true
  # try tag/branch, else stay on main
  if git -C "$ENGRAM_DIR" rev-parse --verify "origin/$ENGRAM_REF" >/dev/null 2>&1; then
    git -C "$ENGRAM_DIR" checkout "$ENGRAM_REF" 2>&1 | tail -n 5 || true
  elif git -C "$ENGRAM_DIR" tag --list | grep -q "^$ENGRAM_REF$"; then
    git -C "$ENGRAM_DIR" checkout "tags/$ENGRAM_REF" 2>&1 | tail -n 5 || true
  fi
  git -C "$ENGRAM_DIR" pull --ff-only 2>&1 | tail -n 5 || true
else
  log "Cloning engram ($ENGRAM_REF) -> $ENGRAM_DIR..."
  rm -rf "$ENGRAM_DIR"
  if ! git clone --depth 1 --branch "$ENGRAM_REF" "$ENGRAM_REPO" "$ENGRAM_DIR" 2>&1 | tail -n 5; then
    warn "branch/tag $ENGRAM_REF not found, cloning main"
    git clone --depth 1 "$ENGRAM_REPO" "$ENGRAM_DIR" 2>&1 | tail -n 5
  fi
fi

log "Building plugin..."
# shellcheck disable=SC2164
cd "$PLUGIN_DIR"
npm install --silent 2>&1 | tail -n 5 || npm install 2>&1 | tail -n 20
npm run build 2>&1 | tail -n 10

# optional python dep (best-effort)
if [ -f "$ENGRAM_DIR/engine/pyproject.toml" ]; then
  log "Installing engram python package (best-effort)..."
  pip install -q -e "$ENGRAM_DIR/engine" 2>&1 | tail -n 5 || warn "pip install -e engram failed (you can run manually: pip install -e $ENGRAM_DIR/engine)"
fi

# --- opencode config ---
PLUGIN_URI="file://$PLUGIN_DIR"
mkdir -p "$(dirname "$CONFIG_GLOBAL")"
if [ "$MODE" = "global" ]; then
  TARGET="$CONFIG_GLOBAL"
else
  mkdir -p "$(dirname "$CONFIG_PROJECT")"
  TARGET="$CONFIG_PROJECT"
fi
log "Configuring $TARGET -> $PLUGIN_URI"

# create or patch JSONC/JSON (minimal jq-free)
if [ ! -f "$TARGET" ]; then
  printf '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugin": ["%s"]\n}\n' "$PLUGIN_URI" > "$TARGET"
else
  # if already contains plugin, replace; else inject
  if grep -q "positronic-opencode-plugin" "$TARGET" 2>/dev/null; then
    # replace existing line (file:// or git+https)
    # use python for safe JSONC patch (preserve comments best-effort via simple sed)
    python3 - "$TARGET" "$PLUGIN_URI" <<'PY' 2>/dev/null || true
import pathlib, re, sys, json
p, uri = pathlib.Path(sys.argv[1]), sys.argv[2]
t = p.read_text()
# replace any positronic plugin entry
t = re.sub(r'"[^"]*positronic-opencode-plugin[^"]*"', f'"{uri}"', t)
# if no entry was replaced but plugin array exists without it, inject
if '"positronic-opencode-plugin' not in t and '"plugin"' in t:
    t = re.sub(r'"plugin"\s*:\s*\[', f'"plugin": ["{uri}", ', t)
p.write_text(t)
print("patched")
PY
  else
    python3 - "$TARGET" "$PLUGIN_URI" <<'PY' 2>/dev/null || true
import pathlib, re, sys
p, uri = pathlib.Path(sys.argv[1]), sys.argv[2]
t = p.read_text()
if '"plugin"' in t:
    t = re.sub(r'"plugin"\s*:\s*\[', f'"plugin": ["{uri}", ', t)
else:
    t = t.rstrip().rstrip('}').rstrip(',') + f',\n  "plugin": ["{uri}"]\n}}\n'
p.write_text(t)
print("injected")
PY
  fi
  # fallback: if python patch didn't change, do simple append via node
  if ! grep -q "positronic-opencode-plugin" "$TARGET"; then
    warn "patch fallback: rewriting $TARGET minimally"
    node -e "const fs=require('fs'); const p=process.argv[1]; const uri=process.argv[2]; let j={}; try{let t=fs.readFileSync(p,'utf8'); j=JSON.parse(t.replace(/\/\/.*|\/\*[\s\S]*?\*\//g,''))}catch{}; j.plugin=j.plugin||[]; if(!j.plugin.includes(uri)) j.plugin.unshift(uri); j['\$schema']=j['\$schema']||'https://opencode.ai/config.json'; fs.writeFileSync(p, JSON.stringify(j,null,2));" "$TARGET" "$PLUGIN_URI" 2>&1 | tail -n 5 || true
  fi
fi
cat "$TARGET" | head -n 20

# --- slash commands ---
log "Installing slash commands -> $COMMANDS_DIR"
mkdir -p "$COMMANDS_DIR"
# generate from plugin's positronicCommands (or use template)
for name in init info stats config brain-test llm-stat llm-setup update delete query; do
  # map name to file: positronic-<name>.md
  file="$COMMANDS_DIR/positronic-$name.md"
  case "$name" in
    init) desc="Positronic init — create brain (warn if exists, --force)"; body="Call positronic.init to create a brain. Args: \$ARGUMENTS (e.g. --brain kairos --profile long_term --embed lexical --live --force)" ;;
    info) desc="Positronic info — version + brains + tiers"; body="Call positronic.info and summarize. Args: \$ARGUMENTS" ;;
    stats) desc="Positronic stats — federated episode counts per brain"; body="Call positronic.stats and summarize episodes per brain and horizon hint. Args: \$ARGUMENTS (optional --brain <name>)" ;;
    config) desc="Positronic config — get/set .positronic/config.json"; body="Call positronic.config. Args: \$ARGUMENTS" ;;
    brain-test) desc="Positronic brain-test — probe new_event -> activate"; body="Call positronic.brain-test. Args: \$ARGUMENTS" ;;
    llm-stat) desc="Positronic llm-stat — bge/llama tier health"; body="Call positronic.llm-stat. Args: \$ARGUMENTS" ;;
    llm-setup) desc="Positronic llm-setup — tier guide (606MB bge-m3)"; body="Call positronic.llm-setup. Args: \$ARGUMENTS" ;;
    update) desc="Positronic update — deferred update --check/--tail/--status"; body="Call positronic.update. Args: \$ARGUMENTS" ;;
    delete) desc="Positronic delete — delete brain (warn, --force)"; body="Call positronic.delete. Args: \$ARGUMENTS" ;;
    query) desc="Positronic query — FTS5/RRF recall, SQL, anchors, objects, sightings"; body="Use positronic.query to search brain memory. Examples: query \"<text>\" --k 8, --sql \"SELECT ...\", --anchors, --objects, --sightings. Args: \$ARGUMENTS" ;;
  esac
  cat > "$file" <<EOF
---
description: $desc
agent: build
model: openrouter/meta/muse-spark-1.2-contributor
---

$body
EOF
done
ls -1 "$COMMANDS_DIR"/positronic-*.md 2>&1 | head -n 20

# --- verify ---
log "Verifying..."
node "$PLUGIN_DIR/dist/cli.js" info --json 2>&1 | head -n 20 || warn "cli info failed"
if grep -q "positronic-opencode-plugin" "$TARGET"; then log "Config OK: $TARGET"; else warn "Config missing plugin entry"; fi
if [ -f "$COMMANDS_DIR/positronic-stats.md" ]; then log "Slash commands OK"; fi
if [ -f "$PLUGIN_DIR/dist/index.js" ] && grep -q "chat.message" "$PLUGIN_DIR/dist/index.js"; then log "Build OK: chat.message hook present"; else warn "Build missing chat.message"; fi

cat <<EOF

\033[1;32mDone.\033[0m One-line update for CI/CD:
  cd $PLUGIN_DIR && git pull && npm run build
  # or re-run: curl -fsSL https://raw.githubusercontent.com/ShingWong/positronic-opencode-plugin/beta/install.sh | bash

Next:
  positronic init --brain kairos --profile long_term --embed lexical   # or: /positronic:init in opencode TUI
  positronic stats --json
  # restart opencode TUI to see /positronic:* slashes

EOF
