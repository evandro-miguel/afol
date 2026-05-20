"""Small helpers for compact CLI output."""

from __future__ import annotations

import json
from typing import Any


def to_json_text(payload: Any, *, pretty: bool = False, sort_keys: bool = True) -> str:
    kwargs: dict[str, Any] = {"sort_keys": sort_keys}
    if pretty:
        kwargs["indent"] = 2
    else:
        kwargs["separators"] = (",", ":")
    return json.dumps(payload, **kwargs)
