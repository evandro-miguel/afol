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
        script_path = Path(__file__).resolve().parent.parent / "agents-repo-map.py"
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
            self.assertIn(str(repo_dir / "docs" / "map"), output)

    def test_dry_run_does_not_prepare_shadow_repo(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()
            runner = make_runner(temp_root / "run-repo-map.sh", "#!/usr/bin/env bash\nexit 0\n")

            argv = ["agents-repo-map.py", str(repo_dir), "--dry-run"]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False),
                mock.patch.object(self.repo_map, "_prepare_shadow_repo", side_effect=AssertionError("should not copy")),
            ):
                code = self.repo_map.main()

            self.assertEqual(code, 0)

    def test_dry_run_does_not_require_runner(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()

            buf = io.StringIO()
            argv = ["agents-repo-map.py", str(repo_dir), "--dry-run"]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": ""}, clear=False),
                mock.patch.object(self.repo_map, "_runner_candidates", return_value=iter([temp_root / "missing-runner.sh"])),
                contextlib.redirect_stdout(buf),
            ):
                code = self.repo_map.main()

            output = buf.getvalue()
            self.assertEqual(code, 0)
            self.assertIn("Analysis shadow repo: <dry-run skipped>", output)
            self.assertIn(str(temp_root / "missing-runner.sh"), output)

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
                "\n"
                "## Major Runtime Surfaces\n"
                "\n"
                "- `.agents/scripts`\n"
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
            readme_path = repo_dir / "docs" / "map" / "README.md"
            self.assertTrue(readme_path.exists())
            self.assertIn("current-state, descriptive", readme_path.read_text(encoding="utf-8"))

    def test_run_overwrites_existing_output_root(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()
            output_root = repo_dir / "docs" / "map"
            output_root.mkdir(parents=True)
            stale_file = output_root / "OLD.md"
            stale_file.write_text("stale", encoding="utf-8")
            runner = make_runner(
                temp_root / "run-repo-map.sh",
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                "mkdir -p \"$2\"\n"
                "rm -f \"$2/OLD.md\"\n"
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
                "\n"
                "## Major Runtime Surfaces\n"
                "\n"
                "- `.agents/scripts`\n"
                "EOF\n",
            )

            argv = ["agents-repo-map.py", str(repo_dir)]
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False):
                code = self.repo_map.main()

            self.assertEqual(code, 0)
            self.assertFalse(stale_file.exists())
            self.assertTrue((output_root / "README.md").exists())

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

    def test_run_fails_fast_when_standard_runner_prerequisites_are_missing(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            repo_dir = temp_root / "repo"
            repo_dir.mkdir()
            runner = make_runner(temp_root / "run-repo-map.sh", "#!/usr/bin/env bash\nexit 0\n")

            buf = io.StringIO()
            argv = ["agents-repo-map.py", str(repo_dir)]

            def fake_which(command: str):
                if command in {"ctags", "docker"}:
                    return None
                return f"/usr/bin/{command}"

            original_hint = self.repo_map.DEFAULT_RUNNER_HINT
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False),
                mock.patch.object(self.repo_map.shutil, "which", side_effect=fake_which),
                contextlib.redirect_stdout(buf),
            ):
                self.repo_map.DEFAULT_RUNNER_HINT = runner
                try:
                    code = self.repo_map.main()
                finally:
                    self.repo_map.DEFAULT_RUNNER_HINT = original_hint

            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("Repo map prerequisites missing", output)
            self.assertIn("ctags", output)
            self.assertIn("docker", output)

    def test_run_fails_when_dependency_graph_is_degenerate(self):
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
                "\n"
                "## Major Runtime Surfaces\n"
                "\n"
                "- `.agents/scripts`\n"
                "EOF\n"
                "cat > \"$2/DEPENDENCY_GRAPH.md\" <<'EOF'\n"
                "# Dependency Graph\n"
                "\n"
                "- `Processed 0 files (897ms) (16 warnings)`\n"
                "EOF\n",
            )

            buf = io.StringIO()
            argv = ["agents-repo-map.py", str(repo_dir)]
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {"AGENTS_REPO_MAP_RUNNER": str(runner)}, clear=False):
                with contextlib.redirect_stdout(buf):
                    code = self.repo_map.main()

            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("semantic validation failed", output)


if __name__ == "__main__":
    unittest.main()
