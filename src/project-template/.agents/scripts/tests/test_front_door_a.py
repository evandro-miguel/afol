import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


class FrontDoorATests(unittest.TestCase):
    @staticmethod
    def _write_exec(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def _run_with_fake_agents(self, args: list[str], fake_body: str):
        source_wrapper = Path("a").resolve()
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

    def test_short_status_alias_maps_to_status(self):
        proc = self._run_with_fake_agents(
            ["s"],
            "#!/usr/bin/env bash\nprintf 'ARGS:%s\\n' \"$*\"\n",
        )
        self.assertEqual(proc.returncode, 0)
        self.assertIn("ARGS:status", proc.stdout)

    def test_json_shortcut_maps_to_status_json(self):
        proc = self._run_with_fake_agents(
            ["-j", "s"],
            "#!/usr/bin/env bash\nprintf 'ARGS:%s\\n' \"$*\"\n",
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


if __name__ == "__main__":
    unittest.main()
