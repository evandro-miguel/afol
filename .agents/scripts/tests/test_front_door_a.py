import os
import json
import stat
import subprocess
import tempfile
import unittest
from shutil import copy2
from pathlib import Path


class FrontDoorATests(unittest.TestCase):
    @staticmethod
    def _write_exec(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def _run_with_fake_agents(self, args: list[str], fake_body: str, source_wrapper: Path | None = None):
        source_wrapper = Path("a").resolve() if source_wrapper is None else source_wrapper.resolve()
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wrapper = root / "a"
            wrapper.write_text(source_wrapper.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper.chmod(wrapper.stat().st_mode | stat.S_IXUSR)

            fake_agents = root / ".agents" / "agents"
            self._write_exec(fake_agents, fake_body)

            proc = subprocess.run(
                [str(wrapper), *args],
                cwd=root,
                capture_output=True,
                text=True,
                env=os.environ.copy(),
                check=False,
            )
        return proc

    def _run_kernel_with_fake_project(
        self,
        args: list[str],
        fake_body: str,
        *,
        config_name: str = "config.json",
        source_wrapper: Path | None = None,
        nested_cwd: bool = False,
    ):
        source_wrapper = Path("a").resolve() if source_wrapper is None else source_wrapper.resolve()
        kernel_source = Path("cli/main.ts").resolve()
        validate_contract_source = Path("cli/validate/contract.ts").resolve()

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wrapper = root / "a"
            wrapper.write_text(source_wrapper.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper.chmod(wrapper.stat().st_mode | stat.S_IXUSR)

            (root / "cli" / "validate").mkdir(parents=True, exist_ok=True)
            copy2(kernel_source, root / "cli" / "main.ts")
            copy2(validate_contract_source, root / "cli" / "validate" / "contract.ts")

            agents_dir = root / ".agents"
            agents_dir.mkdir(parents=True, exist_ok=True)
            self._write_exec(agents_dir / "agents", fake_body)
            (agents_dir / config_name).write_text(
                json.dumps({"schema_version": 1, "project": {"name": "tmp"}}),
                encoding="utf-8",
            )
            (agents_dir / "lock.json").write_text(
                json.dumps({"schema_version": 1, "project": "tmp", "locked": True}),
                encoding="utf-8",
            )

            run_cwd = root
            if nested_cwd:
                run_cwd = root / "nested" / "one"
                run_cwd.mkdir(parents=True, exist_ok=True)

            proc = subprocess.run(
                [str(wrapper), *args],
                cwd=run_cwd,
                capture_output=True,
                text=True,
                env=os.environ.copy(),
                check=False,
            )
        return proc

    def test_short_status_alias_maps_to_status(self):
        proc = self._run_with_fake_agents(
            ["s"],
            "#!/usr/bin/env bash\nprintf 'ARGS:%s\\n' \"$*\"\n",
        )
        self.assertEqual(proc.returncode, 0)
        self.assertIn("ARGS:status", proc.stdout)

    def test_json_shortcut_variants_map_to_status_json(self):
        fake_body = "#!/usr/bin/env bash\nprintf 'ARGS:%s\\n' \"$*\"\n"
        for args in (["-j"], ["--json"], ["-j", "s"], ["--json", "status"], ["s", "-j"], ["status", "--json"]):
            with self.subTest(args=args):
                proc = self._run_with_fake_agents(args, fake_body)
                self.assertEqual(proc.returncode, 0)
                self.assertIn("ARGS:status --json", proc.stdout)

    def test_template_wrapper_json_shortcut_uses_template_source(self):
        proc = self._run_with_fake_agents(
            ["--json", "status"],
            "#!/usr/bin/env bash\nprintf 'ARGS:%s\\n' \"$*\"\n",
            source_wrapper=Path("src/project-template/a"),
        )
        self.assertEqual(proc.returncode, 0)
        self.assertIn("ARGS:status --json", proc.stdout)

    def test_passthrough_preserves_exit_stdout_and_stderr(self):
        proc = self._run_with_fake_agents(
            ["status"],
            "#!/usr/bin/env bash\necho OUT:$*\necho ERR:$* >&2\nexit 7\n",
        )
        self.assertEqual(proc.returncode, 7)
        self.assertIn("OUT:status", proc.stdout)
        self.assertIn("ERR:status", proc.stderr)

    def test_kernel_accepts_agents_config_and_delegates_from_nested_cwd(self):
        proc = self._run_kernel_with_fake_project(
            ["s"],
            "#!/usr/bin/env bash\nprintf 'PWD:%s\\n' \"$PWD\"\nprintf 'ARGS:%s\\n' \"$*\"\n",
            config_name="agents.config",
            nested_cwd=True,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertIn("ARGS:status", proc.stdout)
        self.assertIn("PWD:", proc.stdout)


if __name__ == "__main__":
    unittest.main()
