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


class AgentsDoctorFixTests(unittest.TestCase):
    def test_validate_checkboxes_fix_rewrites_tight_markers(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            doc_file = Path(td) / "sample.md"
            doc_file.write_text(
                "# Sample\n\n"
                "-[X]Needs space\n"
                "- [x]ok\n"
            )

            doctor = agents_doctor.AgentsDoctor(fix=True)
            doctor.validate_checkboxes(doc_file)

            content = doc_file.read_text()
            self.assertIn("- [x] Needs space", content)
            self.assertIn("- [x] ok", content)
            self.assertTrue(
                any("Auto-fixed checkbox formatting issues (--fix)" in i.message for i in doctor.issues)
            )


if __name__ == "__main__":
    unittest.main()
