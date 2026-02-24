#!/usr/bin/env python3
"""
Lock management for agentic system updates.
Prevents concurrent update operations.
"""

import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional


class LockError(Exception):
    """Raised when lock cannot be acquired."""

    pass


class UpdateLock:
    """
    File-based lock for update operations.
    Uses atomic file creation for exclusivity.
    """

    DEFAULT_LOCK_NAME = "agents-update.lock"
    DEFAULT_TIMEOUT = 300  # 5 minutes
    STALE_THRESHOLD = 3600  # 1 hour - consider lock stale after this

    def __init__(
        self,
        agents_dir: Path,
        lock_name: str = DEFAULT_LOCK_NAME,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.agents_dir = agents_dir
        self.lock_file = agents_dir / lock_name
        self.timeout = timeout
        self._acquired = False
        self._pid = os.getpid()
        self._start_time: Optional[datetime] = None

    def acquire(self, blocking: bool = True, poll_interval: float = 1.0) -> bool:
        """
        Acquire the lock.

        Args:
            blocking: If True, wait until lock is available
            poll_interval: Seconds between checks when blocking

        Returns:
            True if lock acquired, False if non-blocking and lock exists

        Raises:
            LockError: If lock is stale or cannot be acquired
        """
        start = time.time()

        while True:
            # Try to acquire lock
            if self._try_acquire():
                return True

            # Check if lock is stale
            if self._is_stale():
                self._force_release()
                if self._try_acquire():
                    return True

            if not blocking:
                return False

            # Check timeout
            if time.time() - start > self.timeout:
                raise LockError(
                    f"Timeout waiting for lock after {self.timeout}s. "
                    f"Lock held by: {self._get_lock_info()}"
                )

            time.sleep(poll_interval)

    def _try_acquire(self) -> bool:
        """Try to acquire lock atomically."""
        try:
            # Use O_EXCL for atomic creation
            fd = os.open(str(self.lock_file), os.O_CREAT | os.O_EXCL | os.O_WRONLY)

            # Write lock info
            lock_info = {
                "pid": self._pid,
                "start_time": datetime.now().isoformat(),
                "hostname": os.uname().nodename if hasattr(os, "uname") else "unknown",
            }

            import json

            os.write(fd, json.dumps(lock_info).encode())
            os.close(fd)

            self._acquired = True
            self._start_time = datetime.now()
            return True

        except FileExistsError:
            return False

    def release(self) -> bool:
        """
        Release the lock.

        Returns:
            True if lock was released, False if not owned by us
        """
        if not self._acquired:
            return False

        try:
            if self.lock_file.exists():
                # Verify we own this lock
                lock_info = self._get_lock_info()
                if lock_info and lock_info.get("pid") == self._pid:
                    self.lock_file.unlink()
                    self._acquired = False
                    return True
                else:
                    # Lock owned by someone else
                    return False
        except (OSError, IOError):
            pass

        self._acquired = False
        return False

    def _is_stale(self) -> bool:
        """Check if lock is stale (holder crashed or hung)."""
        try:
            if not self.lock_file.exists():
                return False

            stat = self.lock_file.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime)
            age = datetime.now() - mtime

            if age > timedelta(seconds=self.STALE_THRESHOLD):
                return True

            # Check if process still exists
            lock_info = self._get_lock_info()
            if lock_info and "pid" in lock_info:
                try:
                    os.kill(lock_info["pid"], 0)  # Signal 0 checks if process exists
                    return False
                except ProcessLookupError:
                    return True  # Process doesn't exist

            return False

        except (OSError, IOError):
            return False

    def _force_release(self) -> bool:
        """Force release a stale lock."""
        try:
            if self.lock_file.exists():
                self.lock_file.unlink()
                return True
        except (OSError, IOError):
            pass
        return False

    def _get_lock_info(self) -> Optional[dict]:
        """Get information about current lock holder."""
        try:
            if not self.lock_file.exists():
                return None

            import json

            with open(self.lock_file, "r") as f:
                return json.load(f)
        except (OSError, IOError, json.JSONDecodeError):
            return None

    def is_locked(self) -> bool:
        """Check if lock is currently held."""
        return self.lock_file.exists()

    def get_holder_info(self) -> Optional[str]:
        """Get human-readable info about lock holder."""
        info = self._get_lock_info()
        if not info:
            return "unknown process"

        pid = info.get("pid", "?")
        hostname = info.get("hostname", "?")
        start = info.get("start_time", "?")
        return f"PID {pid} on {hostname} (started {start})"

    def __enter__(self):
        """Context manager entry."""
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - always release lock."""
        self.release()
        return False

    def get_duration(self) -> Optional[timedelta]:
        """Get duration since lock was acquired."""
        if self._start_time:
            return datetime.now() - self._start_time
        return None


def check_lock(agents_dir: Path) -> bool:
    """
    Quick check if update is in progress.

    Returns:
        True if locked, False otherwise
    """
    lock = UpdateLock(agents_dir)
    return lock.is_locked()


def get_lock_status(agents_dir: Path) -> dict:
    """
    Get detailed lock status.

    Returns:
        Dict with 'locked', 'holder', 'stale' keys
    """
    lock = UpdateLock(agents_dir)

    status = {"locked": lock.is_locked(), "holder": None, "stale": False}

    if status["locked"]:
        status["holder"] = lock.get_holder_info()
        status["stale"] = lock._is_stale()

    return status


if __name__ == "__main__":
    import tempfile

    # Test lock
    with tempfile.TemporaryDirectory() as tmpdir:
        agents_dir = Path(tmpdir)

        # Test basic lock
        lock = UpdateLock(agents_dir)
        print(f"Initial locked: {lock.is_locked()}")

        # Acquire
        acquired = lock.acquire()
        print(f"Acquired: {acquired}")
        print(f"Locked: {lock.is_locked()}")
        print(f"Holder: {lock.get_holder_info()}")

        # Try second lock (should fail non-blocking)
        lock2 = UpdateLock(agents_dir)
        acquired2 = lock2.acquire(blocking=False)
        print(f"Second lock acquired: {acquired2}")

        # Release
        lock.release()
        print(f"After release locked: {lock.is_locked()}")

        # Context manager
        with UpdateLock(agents_dir) as lock_obj:
            print(f"In context locked: {lock_obj.is_locked()}")
        print(f"After context locked: {lock.is_locked()}")
