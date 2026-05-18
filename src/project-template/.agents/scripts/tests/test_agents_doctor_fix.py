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

    def test_missing_active_session_is_ok_when_no_sessions_exist(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_active_session_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            wb_dir.mkdir(parents=True, exist_ok=True)

            original_active = agents_doctor.ACTIVE_SESSION_FILE
            original_wb = agents_doctor.WB_DIR
            agents_doctor.ACTIVE_SESSION_FILE = wb_dir / ".active_session"
            agents_doctor.WB_DIR = wb_dir
            try:
                doctor = agents_doctor.AgentsDoctor()
                doctor.check_active_session_pointer()
            finally:
                agents_doctor.ACTIVE_SESSION_FILE = original_active
                agents_doctor.WB_DIR = original_wb

            self.assertFalse(any("Active session file missing" in issue.message for issue in doctor.issues))

    def test_check_required_folders_reports_missing_folder(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_required_folders_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            (root / "docs").mkdir(parents=True, exist_ok=True)

            original_root = agents_doctor.ROOT_DIR
            original_required_folders = agents_doctor.REQUIRED_FOLDERS
            agents_doctor.ROOT_DIR = root
            agents_doctor.REQUIRED_FOLDERS = ["docs", "docs/missing"]
            try:
                doctor = agents_doctor.AgentsDoctor()
                doctor.check_required_folders()
            finally:
                agents_doctor.ROOT_DIR = original_root
                agents_doctor.REQUIRED_FOLDERS = original_required_folders

            self.assertTrue(any(issue.severity == "error" and issue.message == "Required folder missing" for issue in doctor.issues))
            self.assertTrue(any(issue.path.endswith("docs/missing") for issue in doctor.issues))

    def test_check_templates_reports_missing_template(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_missing_template_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            templates_dir = root / "docs" / "templates"
            templates_dir.mkdir(parents=True, exist_ok=True)

            original_root = agents_doctor.ROOT_DIR
            original_templates_dir = agents_doctor.TEMPLATES_DIR
            original_required_templates = agents_doctor.REQUIRED_TEMPLATES
            agents_doctor.ROOT_DIR = root
            agents_doctor.TEMPLATES_DIR = templates_dir
            agents_doctor.REQUIRED_TEMPLATES = ["missing-template.md"]
            try:
                doctor = agents_doctor.AgentsDoctor()
                doctor.check_templates()
            finally:
                agents_doctor.ROOT_DIR = original_root
                agents_doctor.TEMPLATES_DIR = original_templates_dir
                agents_doctor.REQUIRED_TEMPLATES = original_required_templates

            self.assertTrue(any(issue.severity == "error" and issue.message == "Required template missing" for issue in doctor.issues))
            self.assertTrue(any(issue.path.endswith("missing-template.md") for issue in doctor.issues))

    def test_check_templates_warns_when_template_lacks_frontmatter(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_template_frontmatter_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            templates_dir = root / "docs" / "templates"
            templates_dir.mkdir(parents=True, exist_ok=True)
            template_path = templates_dir / "template.md"
            template_path.write_text("# Template\n")

            original_root = agents_doctor.ROOT_DIR
            original_templates_dir = agents_doctor.TEMPLATES_DIR
            original_required_templates = agents_doctor.REQUIRED_TEMPLATES
            agents_doctor.ROOT_DIR = root
            agents_doctor.TEMPLATES_DIR = templates_dir
            agents_doctor.REQUIRED_TEMPLATES = ["template.md"]
            try:
                doctor = agents_doctor.AgentsDoctor()
                doctor.check_templates()
            finally:
                agents_doctor.ROOT_DIR = original_root
                agents_doctor.TEMPLATES_DIR = original_templates_dir
                agents_doctor.REQUIRED_TEMPLATES = original_required_templates

            self.assertTrue(any(issue.severity == "warning" and issue.message == "Template missing YAML frontmatter" for issue in doctor.issues))

    def test_check_active_session_pointer_reports_missing_folder(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_active_session_missing_folder_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            wb_dir.mkdir(parents=True, exist_ok=True)
            active_session_file = wb_dir / ".active_session"
            active_session_file.write_text("260404_0900_missing-session")

            original_wb = agents_doctor.WB_DIR
            original_active = agents_doctor.ACTIVE_SESSION_FILE
            agents_doctor.WB_DIR = wb_dir
            agents_doctor.ACTIVE_SESSION_FILE = active_session_file
            try:
                doctor = agents_doctor.AgentsDoctor()
                doctor.check_active_session_pointer()
            finally:
                agents_doctor.WB_DIR = original_wb
                agents_doctor.ACTIVE_SESSION_FILE = original_active

            self.assertTrue(any("Active session points to missing folder:" in issue.message for issue in doctor.issues))


if __name__ == "__main__":
    unittest.main()
