import importlib.util
import io
import sys
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


class AgentsMemoryTests(unittest.TestCase):
    def test_status_shows_auxiliary_boundary(self):
        script_path = Path(".agents/scripts/agents-memory.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        memory = load_module("agents_memory_status_test", script_path)

        original_config = memory.CONFIG
        memory.CONFIG = {
            "memory": {
                "enabled": True,
                "required": False,
                "provider": "basic_memory",
                "mode": "contract",
                "authority": "auxiliary",
                "project": "main",
                "runtime_server": "basic_memory",
            }
        }
        try:
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                result = memory.cmd_status(type("Args", (), {})())
        finally:
            memory.CONFIG = original_config

        output = buffer.getvalue()
        self.assertEqual(result, 0)
        self.assertIn("- authority: auxiliary", output)
        self.assertIn("repo-local `knowledge` remain canonical", output)

    def test_search_emits_basic_memory_contract(self):
        script_path = Path(".agents/scripts/agents-memory.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        memory = load_module("agents_memory_search_test", script_path)

        original_config = memory.CONFIG
        memory.CONFIG = {"memory": {"enabled": True, "provider": "basic_memory", "project": "main"}}
        try:
            buffer = io.StringIO()
            args = type(
                "Args",
                (),
                {"query": "agent memory", "project": None, "runtime": "codex", "search_type": "hybrid", "limit": 5},
            )()
            with redirect_stdout(buffer):
                result = memory.cmd_search(args)
        finally:
            memory.CONFIG = original_config

        output = buffer.getvalue()
        self.assertEqual(result, 0)
        self.assertIn("`basic_memory`", output)
        self.assertIn('"query": "agent memory"', output)
        self.assertIn('"search_type": "hybrid"', output)

    def test_context_without_url_emits_two_step_flow(self):
        script_path = Path(".agents/scripts/agents-memory.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        memory = load_module("agents_memory_context_test", script_path)

        original_config = memory.CONFIG
        memory.CONFIG = {"memory": {"enabled": True, "provider": "basic_memory", "project": "main"}}
        try:
            buffer = io.StringIO()
            args = type(
                "Args",
                (),
                {
                    "topic": "persistent planning memory",
                    "project": None,
                    "runtime": "codex",
                    "url": None,
                    "depth": 1,
                    "max_related": 3,
                    "limit": 5,
                },
            )()
            with redirect_stdout(buffer):
                result = memory.cmd_context(args)
        finally:
            memory.CONFIG = original_config

        output = buffer.getvalue()
        self.assertEqual(result, 0)
        self.assertIn("Two-step MCP flow", output)
        self.assertIn('"url": "memory://<selected-permalink>"', output)
        self.assertIn("`build_context`", output)

    def test_show_rejects_unsupported_provider(self):
        script_path = Path(".agents/scripts/agents-memory.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        memory = load_module("agents_memory_provider_test", script_path)

        original_config = memory.CONFIG
        memory.CONFIG = {"memory": {"enabled": True, "provider": "unknown"}}
        try:
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                result = memory.main(["show", "x"])
        finally:
            memory.CONFIG = original_config

        self.assertEqual(result, 1)


if __name__ == "__main__":
    unittest.main()
