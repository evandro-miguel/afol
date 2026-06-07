import importlib.util
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsKnowledgeTests(unittest.TestCase):
    def test_search_finds_research_documents(self):
        script_path = Path(__file__).resolve().parent.parent / "agents-knowledge.py"
        sys.path.insert(0, str(script_path.parent))
        knowledge = load_module("agents_knowledge_search_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            session_dir = wb_dir / "260306_0000_sample"
            session_dir.mkdir(parents=True, exist_ok=True)
            (session_dir / "260306_0000_sample_research_01.md").write_text(
                "---\n"
                "doc_type: research\n"
                "id: 260306_0000_sample_research_01\n"
                "theme: sample\n"
                "status: active\n"
                "---\n\n"
                "# Research: sample\n\n"
                "Runtime discovery notes for OpenCode.\n"
            )

            original_wb = knowledge.WB_DIR
            knowledge.WB_DIR = wb_dir
            try:
                buffer = io.StringIO()
                with redirect_stdout(buffer):
                    result = knowledge.cmd_search(
                        type("Args", (), {"query": "OpenCode", "limit": 5})()
                    )
            finally:
                knowledge.WB_DIR = original_wb

            self.assertEqual(result, 0)
            self.assertIn("260306_0000_sample_research_01", buffer.getvalue())

    def test_index_generates_knowledge_index(self):
        script_path = Path(__file__).resolve().parent.parent / "agents-knowledge.py"
        sys.path.insert(0, str(script_path.parent))
        knowledge = load_module("agents_knowledge_index_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            knowledge_dir = root / ".agents" / "a-docs" / "knowledge"
            session_dir = wb_dir / "260306_0000_sample"
            session_dir.mkdir(parents=True, exist_ok=True)
            (session_dir / "260306_0000_sample_postmortem_01.md").write_text(
                "---\n"
                "doc_type: postmortem\n"
                "id: 260306_0000_sample_postmortem_01\n"
                "theme: sample\n"
                "status: final\n"
                "---\n\n"
                "# Postmortem: sample\n\n"
                "Useful discovery retained.\n"
            )

            original_wb = knowledge.WB_DIR
            original_dir = knowledge.KNOWLEDGE_DIR
            original_index = knowledge.INDEX_FILE
            knowledge.WB_DIR = wb_dir
            knowledge.KNOWLEDGE_DIR = knowledge_dir
            knowledge.INDEX_FILE = knowledge_dir / "INDEX.md"
            try:
                result = knowledge.cmd_index(type("Args", (), {})())
            finally:
                knowledge.WB_DIR = original_wb
                knowledge.KNOWLEDGE_DIR = original_dir
                knowledge.INDEX_FILE = original_index

            self.assertEqual(result, 0)
            self.assertTrue((knowledge_dir / "INDEX.md").exists())
            self.assertIn(
                "260306_0000_sample_postmortem_01", (knowledge_dir / "INDEX.md").read_text()
            )

    def test_pull_returns_compact_reuse_digest(self):
        script_path = Path(__file__).resolve().parent.parent / "agents-knowledge.py"
        sys.path.insert(0, str(script_path.parent))
        knowledge = load_module("agents_knowledge_pull_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            session_dir = wb_dir / "260306_0000_sample"
            session_dir.mkdir(parents=True, exist_ok=True)
            (session_dir / "260306_0000_sample_research_01.md").write_text(
                "---\n"
                "doc_type: research\n"
                "id: 260306_0000_sample_research_01\n"
                "theme: sample\n"
                "status: active\n"
                "---\n\n"
                "# Research: sample\n\n"
                "OpenCode skills are discovered from project and compatible agent folders.\n"
                "Use compact summaries before opening full documents.\n"
            )

            original_wb = knowledge.WB_DIR
            knowledge.WB_DIR = wb_dir
            try:
                buffer = io.StringIO()
                args = type("Args", (), {"query": "OpenCode", "limit": 5, "snippets": 2})()
                with redirect_stdout(buffer):
                    result = knowledge.cmd_pull(args)
            finally:
                knowledge.WB_DIR = original_wb

            output = buffer.getvalue()
            self.assertEqual(result, 0)
            self.assertIn("# Knowledge Pull: OpenCode", output)
            self.assertIn("snippet", output)
            self.assertIn("knowledge show 260306_0000_sample_research_01", output)

    def test_index_is_idempotent_when_knowledge_docs_unchanged(self):
        script_path = Path(".agents/scripts/agents-knowledge.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        knowledge = load_module("agents_knowledge_idempotent_test", script_path)

        class FakeDateTime:
            tick = 0

            @classmethod
            def now(cls, _tz):
                base = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
                value = base + timedelta(seconds=cls.tick)
                cls.tick += 1
                return value

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            knowledge_dir = root / "docs" / "knowledge"
            session_dir = wb_dir / "260306_0000_sample"
            session_dir.mkdir(parents=True, exist_ok=True)
            (session_dir / "260306_0000_sample_report_01.md").write_text(
                "---\n"
                "doc_type: report\n"
                "id: 260306_0000_sample_report_01\n"
                "theme: sample\n"
                "status: active\n"
                "---\n\n"
                "# Report: sample\n\n"
                "Stable summary content.\n"
            )

            original_wb = knowledge.WB_DIR
            original_dir = knowledge.KNOWLEDGE_DIR
            original_index = knowledge.INDEX_FILE
            original_datetime = knowledge.datetime
            knowledge.WB_DIR = wb_dir
            knowledge.KNOWLEDGE_DIR = knowledge_dir
            knowledge.INDEX_FILE = knowledge_dir / "INDEX.md"
            knowledge.datetime = FakeDateTime
            try:
                self.assertEqual(knowledge.cmd_index(type("Args", (), {})()), 0)
                first = (knowledge_dir / "INDEX.md").read_text()
                self.assertEqual(knowledge.cmd_index(type("Args", (), {})()), 0)
                second = (knowledge_dir / "INDEX.md").read_text()
            finally:
                knowledge.WB_DIR = original_wb
                knowledge.KNOWLEDGE_DIR = original_dir
                knowledge.INDEX_FILE = original_index
                knowledge.datetime = original_datetime

            self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
