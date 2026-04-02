#!/usr/bin/env python3
"""
Semantic Version parsing and comparison for agentic system updates.
Follows SemVer 2.0.0 specification.
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Version:
    """Represents a semantic version."""

    major: int
    minor: int = 0
    patch: int = 0
    prerelease: Optional[str] = None
    build: Optional[str] = None

    # Pattern for parsing SemVer
    _PATTERN = re.compile(
        r"^(?P<major>0|[1-9]\d*)\."
        r"(?P<minor>0|[1-9]\d*)\."
        r"(?P<patch>0|[1-9]\d*)"
        r"(?:-(?P<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)"
        r"(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
        r"(?:\+(?P<buildmetadata>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
    )

    @classmethod
    def parse(cls, version_str: str) -> "Version":
        """Parse a version string into a Version object."""
        if version_str.startswith("v"):
            version_str = version_str[1:]

        match = cls._PATTERN.match(version_str)
        if not match:
            raise ValueError(f"Invalid version string: {version_str}")

        groups = match.groupdict()
        return cls(
            major=int(groups["major"]),
            minor=int(groups["minor"]),
            patch=int(groups["patch"]),
            prerelease=groups.get("prerelease"),
            build=groups.get("buildmetadata"),
        )

    def __str__(self) -> str:
        """Convert version to string."""
        version = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            version += f"-{self.prerelease}"
        if self.build:
            version += f"+{self.build}"
        return version

    def bump_major(self) -> "Version":
        """Return new version with bumped major."""
        return Version(self.major + 1, 0, 0)

    def bump_minor(self) -> "Version":
        """Return new version with bumped minor."""
        return Version(self.major, self.minor + 1, 0)

    def bump_patch(self) -> "Version":
        """Return new version with bumped patch."""
        return Version(self.major, self.minor, self.patch + 1)

    def is_prerelease(self) -> bool:
        """Check if this is a prerelease version."""
        return self.prerelease is not None

    def compare(self, other: "Version") -> int:
        """
        Compare two versions.
        Returns: -1 if self < other, 0 if equal, 1 if self > other
        """
        # Compare major.minor.patch
        for attr in ["major", "minor", "patch"]:
            self_val = getattr(self, attr)
            other_val = getattr(other, attr)
            if self_val < other_val:
                return -1
            elif self_val > other_val:
                return 1

        # Handle prerelease comparison
        self_pre = self.prerelease
        other_pre = other.prerelease

        if self_pre is None and other_pre is None:
            return 0
        if self_pre is None:
            return 1  # No prerelease > has prerelease
        if other_pre is None:
            return -1

        # Compare prerelease identifiers
        return self._compare_prerelease(self_pre, other_pre)

    def _compare_prerelease(self, a: str, b: str) -> int:
        """Compare two prerelease strings."""
        a_parts = a.split(".")
        b_parts = b.split(".")

        for a_part, b_part in zip(a_parts, b_parts):
            # Try numeric comparison first
            a_is_num = a_part.isdigit()
            b_is_num = b_part.isdigit()

            if a_is_num and b_is_num:
                a_int, b_int = int(a_part), int(b_part)
                if a_int < b_int:
                    return -1
                elif a_int > b_int:
                    return 1
            elif a_is_num:
                return -1  # Numeric < alphanumeric
            elif b_is_num:
                return 1
            else:
                # Alphanumeric comparison
                if a_part < b_part:
                    return -1
                elif a_part > b_part:
                    return 1

        # Shorter prerelease < longer prerelease
        if len(a_parts) < len(b_parts):
            return -1
        elif len(a_parts) > len(b_parts):
            return 1
        return 0

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        return self.compare(other) == 0

    def __lt__(self, other: "Version") -> bool:
        return self.compare(other) < 0

    def __le__(self, other: "Version") -> bool:
        return self.compare(other) <= 0

    def __gt__(self, other: "Version") -> bool:
        return self.compare(other) > 0

    def __ge__(self, other: "Version") -> bool:
        return self.compare(other) >= 0


class UpdateType:
    """Types of updates between versions."""

    NONE = "none"
    PATCH = "patch"
    MINOR = "minor"
    MAJOR = "major"
    UNKNOWN = "unknown"


def get_update_type(current: Version, upstream: Version) -> str:
    """
    Determine the type of update between two versions.

    Returns one of: UpdateType.NONE, PATCH, MINOR, MAJOR, UNKNOWN
    """
    if current == upstream:
        return UpdateType.NONE

    if upstream < current:
        return UpdateType.UNKNOWN  # Downgrade

    # Check major
    if upstream.major > current.major:
        return UpdateType.MAJOR

    # Check minor
    if upstream.minor > current.minor:
        return UpdateType.MINOR

    # Check patch
    if upstream.patch > current.patch:
        return UpdateType.PATCH

    return UpdateType.UNKNOWN


def format_version_diff(current: Version, upstream: Version) -> str:
    """Format a nice diff between two versions."""
    update_type = get_update_type(current, upstream)

    if update_type == UpdateType.NONE:
        return f"{current} (up to date)"

    symbols = {
        UpdateType.PATCH: "🟢",
        UpdateType.MINOR: "🟡",
        UpdateType.MAJOR: "🔴",
        UpdateType.UNKNOWN: "⚪",
    }

    symbol = symbols.get(update_type, "⚪")
    return f"{symbol} {current} → {upstream} ({update_type})"


if __name__ == "__main__":
    # Simple tests
    v1 = Version.parse("1.2.3")
    v2 = Version.parse("1.2.4")
    v3 = Version.parse("1.3.0")
    v4 = Version.parse("2.0.0")

    print(f"v1: {v1}")
    print(f"v1 < v2: {v1 < v2}")
    print(f"v2 < v3: {v2 < v3}")
    print(f"v3 < v4: {v3 < v4}")
    print(f"Update type v1->v2: {get_update_type(v1, v2)}")
    print(f"Update type v1->v4: {get_update_type(v1, v4)}")
    print(format_version_diff(v1, v2))
