import importlib.util
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsSkillsSyncTests(unittest.TestCase):
    def test_check_warns_when_pool_missing_and_sync_optional(self):
        script_path = Path(".agents/scripts/agents-skills-sync.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        skills_sync = load_module("agents_skills_sync_optional_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            skills_sync.ROOT_DIR = root
            skills_sync.CONFIG = {
                "skills_sync": {
                    "enabled": True,
                    "required": False,
                    "pool_dir": ".agents/cache/universal-skills",
                    "project_dir": ".agents/skills",
                    "manifest_file": ".agents/skills-sync.manifest.json",
                    "default_skills": ["writing-skills"],
                }
            }

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                skills_sync.cmd_check(type("Args", (), {"skills": None})())

            output = buffer.getvalue()
            self.assertIn("WARN: skills pool not initialized", output)


if __name__ == "__main__":
    unittest.main()
