import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsToolsCatalogTests(unittest.TestCase):
    def test_load_tools_rejects_duplicate_keys(self):
        script_path = Path(".agents/scripts/agents-tools.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        tools_mod = load_module("agents_tools_catalog_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            bad_tools = Path(td) / "tools.json"
            bad_tools.write_text(
                "{\n"
                '  "version": "1",\n'
                '  "updated_at": "2026-02-24T00:00:00Z",\n'
                '  "description": "x",\n'
                '  "tools": [],\n'
                '  "tool_categories": {},\n'
                '  "justfile_targets": {},\n'
                '  "tools": [{"id": "duplicate"}]\n'
                "}\n"
            )

            original = tools_mod.TOOLS_JSON
            tools_mod.TOOLS_JSON = bad_tools
            try:
                with self.assertRaises(ValueError):
                    tools_mod.load_tools()
            finally:
                tools_mod.TOOLS_JSON = original

    def test_load_tools_rejects_non_object_catalog(self):
        script_path = Path(".agents/scripts/agents-tools.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        tools_mod = load_module("agents_tools_catalog_type_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            bad_tools = Path(td) / "tools.json"
            bad_tools.write_text("[1,2,3]\n", encoding="utf-8")

            original = tools_mod.TOOLS_JSON
            tools_mod.TOOLS_JSON = bad_tools
            with self.assertRaisesRegex(ValueError, "Tools catalog must be a JSON object"):
                tools_mod.load_tools()
            tools_mod.TOOLS_JSON = original

    def test_tools_catalog_includes_memory_tool(self):
        script_path = Path(".agents/scripts/agents-tools.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        tools_mod = load_module("agents_tools_memory_catalog_test", script_path)

        tools = tools_mod.load_tools()
        memory_tool = next((tool for tool in tools["tools"] if tool["id"] == "memory"), None)

        self.assertIsNotNone(memory_tool)
        self.assertEqual(memory_tool["tool"], "agents-memory.py")
        self.assertIn("memory status", memory_tool["commands"][0]["usage"])


if __name__ == "__main__":
    unittest.main()
