# =====================================================================
# Project Positronic — Polytemporal Cognitive Engram Memory Substrate
# Copyright (C) 2026 Shing Wong. All Rights Reserved.
# =====================================================================
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://gnu.org>.
# =====================================================================

"""Python shim for multi-brain DB init (federation).

Consumes positronic-engram engine/src/memeng (SQLiteStore, MemoryEngine, retention_profiles).
"""
import sys

sys.path.insert(0, "/usr/local/devel/positronic/positronic-engram/engine/src")

from pathlib import Path
import json

from memeng.store import SQLiteStore
from memeng.engine import MemoryEngine

# Allowed retention profiles — mirrors engine.py:48
ALLOWED_PROFILES = {"balanced", "archival", "long_term", "short_term"}
ALLOWED_EMBEDS = {"lexical", "local", "remote"}
ENGRAM_TAG = "v0.2.0"


def _config_path(project_dir) -> Path:
    return Path(project_dir) / ".positronic" / "config.json"


def _ensure_config(project_dir) -> dict:
    p = _config_path(project_dir)
    if p.exists():
        try:
            data = json.loads(p.read_text())
        except Exception:
            data = {}
    else:
        data = {}
    # defaults
    if "brains" not in data:
        data["brains"] = {}
    if "engram_tag" not in data:
        data["engram_tag"] = ENGRAM_TAG
    return data


def load_config(project_dir) -> dict:
    """Read .positronic/config.json, return dict with defaults."""
    p = _config_path(project_dir)
    if not p.exists():
        return {"brains": {}, "engram_tag": ENGRAM_TAG}
    data = json.loads(p.read_text())
    # apply defaults like zod
    if "brains" not in data:
        data["brains"] = {}
    if "engram_tag" not in data:
        data["engram_tag"] = ENGRAM_TAG
    # validate each brain entry lightly (profile must be known if present)
    for name, cfg in data.get("brains", {}).items():
        prof = cfg.get("profile")
        if prof and prof not in ALLOWED_PROFILES:
            raise ValueError(f"unknown retention profile: {prof}")
    return data


def save_config(project_dir, cfg: dict) -> None:
    """Write .positronic/config.json (validates engram_tag default)."""
    # Validate brains profiles
    brains = cfg.get("brains", {})
    for name, bcfg in brains.items():
        prof = bcfg.get("profile")
        if prof and prof not in ALLOWED_PROFILES:
            raise ValueError(f"unknown retention profile: {prof}")
        embed = bcfg.get("embed")
        if embed and embed not in ALLOWED_EMBEDS:
            raise ValueError(f"unknown embed choice: {embed}")
    # ensure engram_tag default
    if "engram_tag" not in cfg:
        cfg = dict(cfg)
        cfg["engram_tag"] = ENGRAM_TAG
    if "brains" not in cfg:
        cfg = dict(cfg)
        cfg["brains"] = {}
    p = _config_path(project_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg, indent=2))


def get_brains(project_dir) -> dict:
    return load_config(project_dir).get("brains", {})


def init_brain(project_dir, name: str, profile: str, embed: str = "lexical", threshold=None) -> str:
    """Validate retention_profile, create .positronic/brains/{name}/memory.db and register domain.

    Also updates .positronic/config.json brains dict and ensures engram_tag pin.
    Returns path to memory.db as string.
    """
    if profile not in ALLOWED_PROFILES:
        raise ValueError(f"unknown retention profile: {profile}")
    if embed not in ALLOWED_EMBEDS:
        raise ValueError(f"unknown embed choice: {embed}")

    p = Path(project_dir) / ".positronic" / "brains" / name
    p.mkdir(parents=True, exist_ok=True)
    db_path = p / "memory.db"
    s = SQLiteStore(str(db_path))
    e = MemoryEngine(s)
    e.init_database()
    e.register_domain(name, retention_profile=profile)
    e.attach_stream(f"positronic:{name}", name)

    # update config
    cfg = _ensure_config(project_dir)
    cfg["brains"][name] = {"profile": profile, "embed": embed}
    if threshold is not None:
        cfg["brains"][name]["threshold"] = threshold
    # ensure engram_tag pinned
    if "engram_tag" not in cfg:
        cfg["engram_tag"] = ENGRAM_TAG
    # write back
    cp = _config_path(project_dir)
    cp.parent.mkdir(parents=True, exist_ok=True)
    cp.write_text(json.dumps(cfg, indent=2))

    return str(db_path)


if __name__ == "__main__":
    # CLI: python3 brains.py <project_dir> <name> <profile> [embed]
    if len(sys.argv) >= 4:
        print(init_brain(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "lexical"))
