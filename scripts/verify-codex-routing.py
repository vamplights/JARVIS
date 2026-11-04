#!/usr/bin/env python3
"""Validate project routing without starting model turns (Python 3.11+)."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import tomllib


ROLES = {
    "luna": ("gpt-6-luna", "xhigh"),
    "terra": ("gpt-6.1-terra", "high"),
    "sol": ("gpt-6.1-sol", "medium"),
    "astra": ("gpt-6-astra", "high"),
}
DEFAULTS = {"model": "gpt-6-luna", "model_reasoning_effort": "xhigh"}
AGENTS = {
    "enabled": True,
    "default_subagent_model": "gpt-6-luna",
    "default_subagent_reasoning_effort": "xhigh",
    "max_concurrent_threads_per_session": 4,
}


def check(report, name, passed, detail):
    report["checks"].append({"name": name, "passed": bool(passed), "detail": detail})


def read_toml(path, report):
    try:
        with path.open("rb") as stream:
            value = tomllib.load(stream)
        check(report, f"parse:{path.name}", True, str(path))
        return value
    except (OSError, tomllib.TOMLDecodeError) as exc:
        check(report, f"parse:{path.name}", False, str(exc))
        return {}


def expected_fields(report, label, actual, expected):
    for key, value in expected.items():
        found = actual.get(key)
        check(report, f"{label}:{key}", type(found) is type(value) and found == value,
              {"expected": value, "actual": found})


def local_checks(root, report):
    check(report, "root-instructions", (root / "AGENTS.md").is_file(), "AGENTS.md exists")
    config = read_toml(root / ".codex/config.toml", report)
    expected_fields(report, "project", config, DEFAULTS)
    agents = config.get("agents", {})
    expected_fields(report, "project:agents", agents if isinstance(agents, dict) else {}, AGENTS)
    role_dir = root / ".codex/agents"
    names = sorted(p.stem for p in role_dir.glob("*.toml"))
    check(report, "exactly-four-role-files", names == sorted(ROLES), names)
    for role, (model, effort) in ROLES.items():
        value = read_toml(role_dir / f"{role}.toml", report)
        expected_fields(report, role, value,
                        {"name": role, "model": model, "model_reasoning_effort": effort})
        for key in ("description", "developer_instructions"):
            field = value.get(key)
            check(report, f"{role}:{key}", isinstance(field, str) and bool(field.strip()),
                  "required nonempty string")
    catalog_path = Path.home() / ".codex/models_cache.codex_work_desktop.json"
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        models = {item["slug"]: item for item in catalog["models"]}
        report["catalog"] = {"path": str(catalog_path), "fetched_at": catalog.get("fetched_at"),
                             "client_version": catalog.get("client_version")}
        for role, (model, effort) in ROLES.items():
            supported = [v["effort"] for v in models.get(model, {}).get("supported_reasoning_levels", [])]
            check(report, f"catalog:{role}", effort in supported,
                  {"model": model, "requested_effort": effort, "supported_efforts": supported})
        report["warnings"].append("Cached catalog support does not prove live model access or execution.")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        check(report, "catalog", False, str(exc))


class Rpc:
    """Newline JSON RPC with bounded reads and continuously drained stderr."""

    def __init__(self, exe, root, timeout):
        self.timeout = timeout
        self.messages = queue.Queue()
        self.stderr_lines = 0
        self.diagnostics = set()
        self.next_id = 0
        self.process = subprocess.Popen(
            [str(exe), "app-server", "--stdio", "--strict-config"], cwd=root,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        threading.Thread(target=self.read_stdout, daemon=True).start()
        threading.Thread(target=self.drain_stderr, daemon=True).start()

    def read_stdout(self):
        for line in self.process.stdout:
            try:
                self.messages.put(json.loads(line))
            except ValueError:
                continue
        self.messages.put(None)

    def drain_stderr(self):
        # Do not record arbitrary native logs: they can include private config.
        for line in self.process.stderr:
            self.stderr_lines += 1
            for marker, label in (
                ("Access is denied", "filesystem access denied"),
                ("failed to initialize sqlite state runtime", "SQLite state runtime initialization failed"),
                ("unknown field", "unrecognized configuration field"),
                ("unexpected argument", "unsupported command-line argument"),
            ):
                if marker in line:
                    self.diagnostics.add(label)

    def send(self, message):
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def request(self, method, params):
        self.next_id += 1
        request_id = self.next_id
        self.send({"id": request_id, "method": method, "params": params})
        deadline = time.monotonic() + self.timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"{method} exceeded {self.timeout:g}s")
            try:
                message = self.messages.get(timeout=remaining)
            except queue.Empty:
                raise TimeoutError(f"{method} exceeded {self.timeout:g}s") from None
            if message is None:
                try:
                    self.process.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    pass
                raise RuntimeError(f"app-server exited before {method} response (exit {self.process.poll()})")
            if message.get("id") != request_id:
                continue
            if "error" in message:
                # Save code only; arbitrary server error messages may contain private config.
                raise RuntimeError(f"{method} failed with RPC code {message['error'].get('code')}")
            return message["result"]

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=3)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()


def native_checks(exe, root, timeout, report):
    rpc = None
    report["native"] = {"executable": str(exe), "requested_methods": ["initialize", "config/read"]}
    try:
        if not exe.is_absolute() or not exe.is_file():
            raise ValueError("--codex must name an existing absolute executable path")
        rpc = Rpc(exe, root, timeout)
        initialized = rpc.request("initialize", {
            "clientInfo": {"name": "codex-routing-validator", "version": "1.0"},
            "capabilities": {"experimentalApi": True}})
        report["native"]["user_agent"] = initialized.get("userAgent")
        rpc.send({"method": "initialized", "params": {}})
        result = rpc.request("config/read", {"cwd": str(root), "includeLayers": True})
        config = result.get("config", {})
        expected_fields(report, "native:effective", config, DEFAULTS)
        agents = config.get("agents", {})
        expected_fields(report, "native:agents", agents if isinstance(agents, dict) else {}, AGENTS)
        layers = result.get("layers") or []
        project_layers = [layer for layer in layers if layer.get("name", {}).get("type") == "project"
                          and os.path.normcase(os.path.normpath(layer["name"].get("dotCodexFolder", "")))
                          == os.path.normcase(str(root / ".codex"))]
        active = [layer for layer in project_layers if not layer.get("disabledReason")]
        check(report, "native:project-layer-loaded", bool(active),
              {"matching_layers": len(project_layers), "active_layers": len(active)})
        if active:
            expected_fields(report, "native:project-layer", active[-1].get("config", {}), DEFAULTS)
        report["native"]["effective"] = {**{k: config.get(k) for k in DEFAULTS},
                                           "agents": {k: agents.get(k) for k in AGENTS}
                                           if isinstance(agents, dict) else None}
        report["native"]["project_layer_active"] = bool(active)
        check(report, "native:read-only-protocol", True, "initialize and config/read completed")
        report["warnings"].append(
            "config/read verifies effective defaults, but does not expose custom-role discovery. "
            "Standalone role loading and worker model execution remain unverified; no model turn was started.")
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, TimeoutError) as exc:
        check(report, "native:read-only-protocol", False, str(exc))
    finally:
        if rpc is not None:
            rpc.close()
            report["native"]["stderr_line_count"] = rpc.stderr_lines
            report["native"]["startup_diagnostics"] = sorted(rpc.diagnostics)
            if rpc.diagnostics:
                report["warnings"].append("Native startup diagnostics: " + "; ".join(sorted(rpc.diagnostics)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex", type=Path, help="absolute native Codex executable; enables read-only app-server verification")
    parser.add_argument("--output", type=Path, default=Path("work/codex-routing/validation.json"),
                        help="compact JSON evidence path, relative to project root by default")
    parser.add_argument("--timeout", type=float, default=15, help="timeout per native RPC in seconds (1-60; default 15)")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 60:
        parser.error("--timeout must be between 1 and 60 seconds")
    root = Path(__file__).resolve().parents[1]
    report = {"timestamp": datetime.now(timezone.utc).isoformat(), "project": str(root),
              "checks": [], "warnings": []}
    local_checks(root, report)
    if args.codex:
        native_checks(args.codex, root, args.timeout, report)
    else:
        report["warnings"].append("Native effective config, project trust and custom-role discovery were not checked; use --codex.")
    report["passed"] = all(item["passed"] for item in report["checks"])
    output = args.output if args.output.is_absolute() else root / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    failed = [item for item in report["checks"] if not item["passed"]]
    print(f"{'PASS' if report['passed'] else 'FAIL'}: {len(report['checks']) - len(failed)}/{len(report['checks'])} checks; evidence: {output}")
    for item in failed:
        print(f"FAIL {item['name']}: {item['detail']}")
    for warning in report["warnings"]:
        print(f"WARN {warning}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
