import importlib.util
import unittest
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT_PATH = Path(".agents/scripts/agents-session.py").resolve()


class SessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_module("agents_session_tests", SCRIPT_PATH)

    def test_build_parser_returns_argument_parser(self):
        """build_parser must return an ArgumentParser."""
        import argparse

        parser = self.session.build_parser()
        self.assertIsInstance(parser, argparse.ArgumentParser)

    def test_parse_catchup_args_returns_session(self):
        """Catchup subcommand must accept --session argument."""
        parser = self.session.build_parser()
        args = parser.parse_args(["catchup", "--session", "test-session"])
        self.assertEqual(args.command, "catchup")
        self.assertEqual(args.session, "test-session")

    def test_parse_close_args_returns_session(self):
        """Close subcommand must accept --session argument."""
        parser = self.session.build_parser()
        args = parser.parse_args(["close", "--session", "test-session"])
        self.assertEqual(args.command, "close")
        self.assertEqual(args.session, "test-session")
