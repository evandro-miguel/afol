import sys
from pathlib import Path
from datetime import timezone, timedelta

import pytest

sys.path.insert(0, str(Path(".agents/scripts").resolve()))

from lib.agents_config import parse_offset


def test_parse_offset_accepts_utc_shorthand():
    assert parse_offset("Z") == timezone.utc


def test_parse_offset_accepts_valid_offset():
    assert parse_offset("+03:30") == timezone(timedelta(hours=3, minutes=30))
    assert parse_offset("-00:45") == timezone(timedelta(minutes=-45))


def test_parse_offset_rejects_invalid_shape():
    with pytest.raises(ValueError, match="Invalid timezone offset format"):
        parse_offset("+3:00")


def test_parse_offset_rejects_hour_out_of_range():
    with pytest.raises(ValueError, match="Invalid timezone offset format"):
        parse_offset("+99:00")

