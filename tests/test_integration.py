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

def test_fresh_clone_lexical_recall(tmp_path):
    from src.brains import init_brain
    import sys

    sys.path.insert(0, "/usr/local/devel/positronic/positronic-engram/engine/src")
    from memeng.store import SQLiteStore
    from memeng.engine import MemoryEngine
    from memeng.models import Event
    from datetime import datetime, timezone

    db = init_brain(tmp_path, "kairos", "balanced", "lexical")
    s = SQLiteStore(db)
    e = MemoryEngine(s)
    e.new_event(
        Event(
            stream="positronic:kairos",
            kind="message",
            persons=["p_kairos"],
            wall=datetime.now(timezone.utc),
            features={"subject_norm": "web2 deploy", "body_text": "deployed on web2"},
        )
    )
    assert len(e.activate({"text": "web2"}, k=3)) > 0
