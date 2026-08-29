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

"""Python shim for config — re-exports from brains.py for test compatibility.

The TypeScript source of truth is src/config.ts (zod). This Python file mirrors
loadConfig/saveConfig/getBrains for pytest and for the Python bridge used by
Task 4 wizard / Task 5 hooks.

Tests import:
  from src.config import save_config, load_config, init_brain

We provide snake_case aliases and also re-export brains init logic.
"""
from src.brains import (
    ALLOWED_PROFILES,
    ALLOWED_EMBEDS,
    ENGRAM_TAG,
    load_config,
    save_config,
    get_brains,
    init_brain,
)

# camelCase aliases for TS parity (not used by Python tests but useful for bridge)
loadConfig = load_config
saveConfig = save_config
getBrains = get_brains
initBrain = init_brain

__all__ = [
    "ALLOWED_PROFILES",
    "ALLOWED_EMBEDS",
    "ENGRAM_TAG",
    "load_config",
    "save_config",
    "get_brains",
    "init_brain",
    "loadConfig",
    "saveConfig",
    "getBrains",
    "initBrain",
]
