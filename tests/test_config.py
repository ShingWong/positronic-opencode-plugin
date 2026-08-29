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

def test_config_roundtrip(tmp_path):
    from src.config import save_config, load_config  # will be python shim
    save_config(tmp_path, {"brains": {"kairos": {"profile": "balanced", "embed": "lexical"}}})
    assert load_config(tmp_path)["brains"]["kairos"]["profile"] == "balanced"

def test_invalid_profile_rejected(tmp_path):
    from src.config import init_brain
    try:
        init_brain(tmp_path, "bad", profile="nonexistent", embed="lexical")
        assert False
    except ValueError as e:
        assert "unknown retention" in str(e)
