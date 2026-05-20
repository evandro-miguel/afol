import importlib.util
import os
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


class AgentsConfigActiveSessionOverrideTests(unittest.TestCase):
    def test_find_repo_root_ignores_nested_scripts_agents_folder(self):
        script_path = Path(".agents/scripts/lib/agents_config.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_config = load_module("agents_config_root_discovery_test", script_path)

        root = Path.cwd().resolve()
        self.assertEqual(agents_config.find_repo_root(root / ".agents" / "scripts"), root)

    def test_active_session_file_uses_env_override(self):
        script_path = Path(".agents/scripts/lib/agents_config.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_config = load_module("agents_config_override_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = {"paths": {"active_session_file": ".agents/wb/.active_session"}}

            with mock.patch.dict(
                os.environ, {"AGENTS_ACTIVE_SESSION_FILE": "custom/.active_session"}
            ):
                resolved = agents_config.get_active_session_file_path(root, config)

            self.assertEqual(resolved, (root / "custom/.active_session").resolve())

    def test_active_session_file_falls_back_to_config(self):
        script_path = Path(".agents/scripts/lib/agents_config.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_config = load_module("agents_config_fallback_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = {"paths": {"active_session_file": ".agents/wb/.active_session"}}

            with mock.patch.dict(os.environ, {}, clear=False):
                os.environ.pop("AGENTS_ACTIVE_SESSION_FILE", None)
                resolved = agents_config.get_active_session_file_path(root, config)

            self.assertEqual(resolved, (root / ".agents/wb/.active_session").resolve())


if __name__ == "__main__":
    unittest.main()
