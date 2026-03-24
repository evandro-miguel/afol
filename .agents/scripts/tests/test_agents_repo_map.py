import contextlib
import importlib.util
import io
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_runner(path: Path, body: str) -> Path:
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


class AgentsRepoMapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script_path = Path(".agents/scripts/agents-repo-map.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        cls.repo_map = load_module("agents_repo_map_test", script_path)

    def test_dry_run_resolves_runner_and_repo(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()
            runner = make_runner(temp_root / "run-repo-map.sh", "#!/usr/bin/env bash\nexit 0\n")

            buf = io.StringIO()
            argv = ["agents-repo-map.py", str(repo_dir), "--dry-run"]
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False):
                with contextlib.redirect_stdout(buf):
                    code = self.repo_map.main()

            output = buf.getvalue()
            self.assertEqual(code, 0)
            self.assertIn(str(repo_dir), output)
            self.assertIn(str(runner), output)

    def test_run_succeeds_when_runner_writes_required_readme(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()
            runner = make_runner(
                temp_root / "run-repo-map.sh",
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                "mkdir -p \"$2\"\n"
                "cat > \"$2/README.md\" <<'EOF'\n"
                "---\n"
                "title: \"Map\"\n"
                "description: \"x\"\n"
                "doc_kind: \"map\"\n"
                "version: \"v2026-03-23_1\"\n"
                "created_at: \"2026-03-23T00:00:00Z\"\n"
                "updated_at: \"2026-03-23T00:00:00Z\"\n"
                "---\n"
                "\n"
                "# Map\n"
                "EOF\n",
            )

            buf = io.StringIO()
            argv = ["agents-repo-map.py", str(repo_dir)]
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False):
                with contextlib.redirect_stdout(buf):
                    code = self.repo_map.main()

            output = buf.getvalue()
            self.assertEqual(code, 0)
            self.assertIn("generated_artifacts:", output)
            readme_path = repo_dir / ".agents/arc/map/README.md"
            self.assertTrue(readme_path.exists())
            self.assertIn("current-state, descriptive", readme_path.read_text(encoding="utf-8"))

    def test_run_fails_when_required_docs_are_missing(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()
            runner = make_runner(temp_root / "run-repo-map.sh", "#!/usr/bin/env bash\nmkdir -p \"$2\"\n")

            buf = io.StringIO()
            argv = ["agents-repo-map.py", str(repo_dir)]
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False):
                with contextlib.redirect_stdout(buf):
                    code = self.repo_map.main()

            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("required map docs are missing", output)


if __name__ == "__main__":
    unittest.main()
