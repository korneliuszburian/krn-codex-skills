"""Terminal-Bench agent for the KRN lanes.

The host opencode binary and a per-lane home (auth plus the enabled KRN
surfaces) are copied into the task container; the agent then runs
``opencode run`` in the task workspace. ``lane`` selects the surfaces:
``vanilla`` copies only auth, ``full`` adds the skills and the contract, and the
single-surface lanes subtract one. The KRN plugin is not carried because its
imports resolve inside the release tree; that is recorded as a non-proof.
"""

from __future__ import annotations

import os
import shlex
import shutil
import tempfile
from pathlib import Path

from terminal_bench.agents.installed_agents.abstract_installed_agent import (
    AbstractInstalledAgent,
)
from terminal_bench.terminal.models import TerminalCommand

HOST_HOME = Path(os.path.expanduser("~"))
MEMORY_INSTRUCTION = (
    "Before editing, run `krn memory recall --root <repository> --changed <path>` "
    "and apply the lesson it returns.\n"
)


class KrnLaneAgent(AbstractInstalledAgent):
    @staticmethod
    def name() -> str:
        return "krn-lane"

    def __init__(self, model_name: str, lane: str = "full", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._model = model_name
        self._lane = lane
        self._home: Path | None = None

    @property
    def _env(self) -> dict[str, str]:
        return {}

    @property
    def _install_agent_script_path(self) -> Path:
        return Path(__file__).with_name("terminal_bench_setup.sh")

    def _prepare_home(self) -> Path:
        home = Path(tempfile.mkdtemp(prefix="krn-tb-home-"))
        (home / ".config" / "opencode").mkdir(parents=True, exist_ok=True)
        (home / ".local" / "share" / "opencode").mkdir(parents=True, exist_ok=True)
        # A minimal config: the host config's MCP secret path does not exist in
        # the task container, so only the schema and the autoupdate flag travel.
        (home / ".config" / "opencode" / "opencode.json").write_text(
            '{ "$schema": "https://opencode.ai/config.json", "autoupdate": false }\n',
            encoding="utf-8",
        )
        shutil.copy(HOST_HOME / ".local/share/opencode/auth.json", home / ".local/share/opencode/auth.json")
        if self._lane != "vanilla":
            contract = HOST_HOME / ".config/opencode/AGENTS.md"
            if contract.exists():
                shutil.copy(contract, home / ".config" / "opencode" / "AGENTS.md")
        if self._lane == "full":
            shutil.copytree(HOST_HOME / ".agents", home / ".agents", symlinks=False, dirs_exist_ok=True)
        if self._lane in {"full", "no-skills"}:
            with open(home / ".config" / "opencode" / "AGENTS.md", "a", encoding="utf-8") as handle:
                handle.write(MEMORY_INSTRUCTION)
        return home

    def perform_task(self, instruction, session, logging_dir=None):
        session.copy_to_container(
            HOST_HOME / ".opencode/bin/opencode",
            container_dir="/installed-agent",
            container_filename="opencode",
        )
        self._home = self._prepare_home()
        session.copy_to_container(self._home, container_dir="/installed-agent", container_filename="home")
        return super().perform_task(instruction, session, logging_dir)

    def _run_agent_commands(self, instruction: str) -> list[TerminalCommand]:
        home = "/installed-agent/home"
        command = (
            f"cd /app && HOME={home} XDG_CONFIG_HOME={home}/.config "
            f"XDG_DATA_HOME={home}/.local/share XDG_CACHE_HOME={home}/.cache "
            f"/installed-agent/opencode run --model {shlex.quote(self._model)} "
            f"--format json --auto --dir /app {shlex.quote(instruction)} "
            "> /logs/events.jsonl 2>&1; echo AGENT_DONE"
        )
        return [TerminalCommand(command=command, min_timeout_sec=0.0, max_timeout_sec=1200, block=True, append_enter=True)]
