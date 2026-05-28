import importlib.util
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


SCRIPT_PATH = Path(".agents/scripts/agents-fix-symlinks.py").resolve()


class SymlinkHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fsl = load_module("agents_fix_symlinks_helper_tests", SCRIPT_PATH)

    def test_ensure_parent_creates_dir(self):
        """ensure_parent creates missing parent directory."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "sub" / "file"
            with mock.patch("builtins.print"):
                self.fsl.ensure_parent(target, dry_run=False)
            self.assertTrue((Path(td) / "sub").exists())

    def test_ensure_parent_existing(self):
        """ensure_parent skips when parent exists."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "file"
            self.fsl.ensure_parent(target, dry_run=False)  # should not raise

    def test_ensure_parent_dry_run(self):
        """ensure_parent does not create dir in dry-run."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "sub" / "file"
            with mock.patch("builtins.print"):
                self.fsl.ensure_parent(target, dry_run=True)
            self.assertFalse((Path(td) / "sub").exists())

    def test_remove_target_symlink(self):
        """remove_target removes a symlink."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "link"
            target.symlink_to(td)
            self.fsl.remove_target(target, dry_run=False)
            self.assertFalse(target.exists())

    def test_remove_target_file(self):
        """remove_target removes a file."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "file.txt"
            target.write_text("hi")
            self.fsl.remove_target(target, dry_run=False)
            self.assertFalse(target.exists())

    def test_remove_target_dir(self):
        """remove_target removes a directory."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "dir"
            target.mkdir()
            (target / "f.txt").write_text("hi")
            self.fsl.remove_target(target, dry_run=False)
            self.assertFalse(target.exists())

    def test_remove_target_missing(self):
        """remove_target on missing path does nothing."""
        self.fsl.remove_target(Path("/nonexistent"), dry_run=False)

    def test_remove_target_dry_run(self):
        """remove_target in dry-run does not delete."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "file.txt"
            target.write_text("hi")
            with mock.patch("builtins.print"):
                self.fsl.remove_target(target, dry_run=True)
            self.assertTrue(target.exists())

    def test_same_symlink_valid(self):
        """same_symlink returns True for matching symlink."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            link = Path(td) / "link"
            link.symlink_to("src", target_is_directory=True)
            self.assertTrue(self.fsl.same_symlink(link, "src"))

    def test_same_symlink_invalid(self):
        """same_symlink returns False for mismatched symlink."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            link = Path(td) / "link"
            link.symlink_to("src", target_is_directory=True)
            self.assertFalse(self.fsl.same_symlink(link, "other"))

    def test_same_symlink_not_symlink(self):
        """same_symlink returns False for non-symlink."""
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "file"
            path.write_text("x")
            self.assertFalse(self.fsl.same_symlink(path, "anything"))

    def test_replicate_dir(self):
        """replicate_dir copies directory contents."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            (src / "f.txt").write_text("content")
            dst = Path(td) / "dst"
            with mock.patch("builtins.print"):
                self.fsl.replicate_dir(src, dst, dry_run=False)
            self.assertTrue((dst / "f.txt").exists())
            self.assertEqual((dst / "f.txt").read_text(), "content")

    def test_replicate_dir_dry_run(self):
        """replicate_dir does not copy in dry-run."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            (src / "f.txt").write_text("content")
            dst = Path(td) / "dst"
            with mock.patch("builtins.print"):
                self.fsl.replicate_dir(src, dst, dry_run=True)
            self.assertFalse(dst.exists())

    def test_replicate_dir_missing_source(self):
        """replicate_dir raises FileNotFoundError for missing source."""
        with self.assertRaises(FileNotFoundError):
            self.fsl.replicate_dir(Path("/nonexistent"), Path("/tmp/dst"), dry_run=False)

    def test_create_symlink(self):
        """create_symlink creates a directory symlink."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "link"
            with mock.patch("builtins.print"):
                self.fsl.create_symlink("src", target, dry_run=False)
            self.assertTrue(target.is_symlink())

    def test_create_symlink_dry_run(self):
        """create_symlink does nothing in dry-run."""
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "link"
            with mock.patch("builtins.print"):
                self.fsl.create_symlink("src", target, dry_run=True)
            self.assertFalse(target.exists())

    def test_create_symlink_or_replicate_symlink_success(self):
        """_create_symlink_or_replicate returns success when symlink succeeds."""
        src = Path("/tmp/src")
        target = Path("/tmp/target")
        with mock.patch.object(self.fsl, "create_symlink") as mock_symlink, \
             mock.patch.object(self.fsl, "replicate_dir") as mock_replicate:
            result = self.fsl._create_symlink_or_replicate(src, target, "src", dry_run=False)
        self.assertEqual(result, 0)
        mock_symlink.assert_called_once_with("src", target, False)
        mock_replicate.assert_not_called()

    def test_create_symlink_or_replicate_fallback_on_error(self):
        """_create_symlink_or_replicate falls back to replicate on OSError."""
        src = Path("/tmp/src")
        target = Path("/tmp/target")
        with mock.patch.object(self.fsl, "create_symlink", side_effect=OSError("no symlink")), \
             mock.patch.object(self.fsl, "replicate_dir") as mock_replicate, \
             mock.patch("builtins.print"):
            result = self.fsl._create_symlink_or_replicate(src, target, "src", dry_run=False)
        self.assertEqual(result, 0)
        mock_replicate.assert_called_once_with(src, target, False)


class SymlinkProcessMappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fsl = load_module("agents_fix_symlinks_process_tests", SCRIPT_PATH)

    def test_process_mapping_already_valid(self):
        """Valid symlink returns 0 immediately."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "link"
            target.symlink_to("src", target_is_directory=True)
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "src", "auto", False, False)
            self.assertEqual(result, 0)

    def test_process_mapping_symlink_mode_no_force(self):
        """Symlink mode without force skips existing target."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "target"
            target.mkdir()
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "src", "symlink", False, False)
            self.assertEqual(result, 1)

    def test_process_mapping_symlink_mode_force(self):
        """Symlink mode with force replaces existing target."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "target"
            target.mkdir()
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "src", "symlink", False, True)
            self.assertEqual(result, 0)
            self.assertTrue(target.is_symlink())

    def test_process_mapping_copy_mode_no_force_symlink(self):
        """Copy mode without force skips symlink target."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "link"
            target.symlink_to("src", target_is_directory=True)
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "other", "copy", False, False)
            self.assertEqual(result, 1)

    def test_process_mapping_copy_mode_force(self):
        """Copy mode with force replaces symlink."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            (src / "f.txt").write_text("content")
            target = Path(td) / "link"
            target.symlink_to("src", target_is_directory=True)
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "other", "copy", False, True)
            self.assertEqual(result, 0)
            self.assertTrue(target.is_dir())

    def test_process_mapping_auto_from_symlink_no_force(self):
        """Auto mode with broken symlink skips without force."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "link"
            target.symlink_to("nonexistent", target_is_directory=True)
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "src", "auto", False, False)
            self.assertEqual(result, 1)

    def test_process_mapping_auto_from_existing_file_no_force(self):
        """Auto mode with file target skips without force."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "file"
            target.write_text("x")
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "src", "auto", False, False)
            self.assertEqual(result, 1)

    def test_process_mapping_auto_from_missing_target(self):
        """Auto mode creates symlink for missing target."""
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            target = Path(td) / "link"
            with mock.patch("builtins.print"):
                result = self.fsl.process_mapping("test", src, target, "src", "auto", False, False)
            self.assertEqual(result, 0)
            self.assertTrue(target.is_symlink())


class SymlinkParseTargetsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fsl = load_module("agents_fix_symlinks_parse_tests", SCRIPT_PATH)

    def test_parse_targets_default(self):
        self.assertEqual(self.fsl.parse_targets("skills,rules"), {"skills", "rules"})

    def test_parse_targets_empty(self):
        self.assertEqual(self.fsl.parse_targets(""), {"skills", "rules"})

    def test_parse_targets_invalid(self):
        with self.assertRaises(ValueError):
            self.fsl.parse_targets("invalid")

    def test_parse_targets_skills_only(self):
        self.assertEqual(self.fsl.parse_targets("skills"), {"skills"})


class SymlinkMainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fsl = load_module("agents_fix_symlinks_main_tests", SCRIPT_PATH)

    def test_main_invalid_targets(self):
        """main returns 1 for invalid targets."""
        with mock.patch.object(self.fsl, "parse_args") as mock_args:
            mock_args.return_value = mock.Mock(targets="invalid", mode="auto", dry_run=False, force=False)
            with mock.patch("builtins.print"):
                result = self.fsl.main()
        self.assertEqual(result, 1)

    def test_main_no_mappings(self):
        """main returns 0 when no applicable targets found."""
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(self.fsl, "ROOT_DIR", Path(td)), \
                 mock.patch.object(self.fsl, "parse_args") as mock_args:
                mock_args.return_value = mock.Mock(targets="skills,rules", mode="auto", dry_run=False, force=False)
                with mock.patch("builtins.print"):
                    result = self.fsl.main()
        self.assertEqual(result, 0)
