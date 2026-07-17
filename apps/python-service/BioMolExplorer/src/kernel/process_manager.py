"""!

PhD research 2023~2026

@title 
    BioMolExplorer: Centralized Process Manager for Subprocesses

@info
    Tracks and manages running external subprocesses (docking, Vina, Chimera, etc.)
    and ensures clean OS termination on exit or cancellation.
"""

import subprocess
import threading
import os
import signal
import sys
import atexit
from typing import Optional, Dict, Tuple


class TaskCancelledException(BaseException):
    """Raised when a task is cancelled so inner Exception blocks do not swallow it."""
    pass


class ActiveSubprocesses:
    """
    Centralized process manager for tracking and terminating external subprocesses.
    Ensures that when the Flask server stops (Ctrl+C / SIGINT / SIGTERM) or a task
    is cancelled, all child process trees (setsid/process groups) are killed.
    """
    _lock = threading.Lock()
    _registry: Dict[int, dict] = {}
    cancelled_tasks = set()
    _registered_signals = False

    @classmethod
    def register_signal_handlers(cls):
        with cls._lock:
            if cls._registered_signals:
                return
            cls._registered_signals = True

        def _signal_handler(signum, frame):
            cls.kill_all(include_orphans=True)
            sys.exit(0)

        try:
            signal.signal(signal.SIGINT, _signal_handler)
            signal.signal(signal.SIGTERM, _signal_handler)
        except (ValueError, RuntimeError):
            pass

        atexit.register(lambda: cls.kill_all(include_orphans=True))

    @classmethod
    def register(cls, proc: subprocess.Popen, task_id: Optional[str] = None, command: str = ""):
        with cls._lock:
            cls._registry[proc.pid] = {
                'process': proc,
                'task_id': task_id,
                'command': command
            }

    @classmethod
    def unregister(cls, proc: subprocess.Popen):
        with cls._lock:
            cls._registry.pop(proc.pid, None)

    @classmethod
    def kill_process(cls, proc: subprocess.Popen):
        """Kills a process and its entire process group cleanly."""
        if proc.poll() is not None:
            return
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGKILL)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    @classmethod
    def kill_by_task_id(cls, task_id: str):
        """Terminates all registered subprocesses associated with a given task_id or unassigned."""
        with cls._lock:
            cls.cancelled_tasks.add(task_id)
            to_kill = [
                info['process'] for info in list(cls._registry.values())
                if info.get('task_id') == task_id or info.get('task_id') is None
            ]
        for proc in to_kill:
            cls.kill_process(proc)
        cls._kill_orphans()

    @classmethod
    def _kill_orphans(cls):
        """
        Fallback sweep to kill any orphaned docking/backend binaries
        (vina, chimera, antechamber, sqm, obabel) on Linux/Unix systems.
        """
        target_binaries = ('vina', 'chimera', 'antechamber', 'sqm', 'obabel')
        current_pid = os.getpid()
        try:
            output = subprocess.check_output(
                ['ps', '-u', str(os.getuid()), '-o', 'pid,comm,args'],
                stderr=subprocess.DEVNULL,
                text=True
            )
            for line in output.splitlines():
                parts = line.strip().split(None, 2)
                if len(parts) >= 2:
                    try:
                        pid = int(parts[0])
                        if pid == current_pid:
                            continue
                        comm = parts[1].lower()
                        args = parts[2].lower() if len(parts) > 2 else ""
                        if any(b in comm or b in args for b in target_binaries):
                            try:
                                pgid = os.getpgid(pid)
                                os.killpg(pgid, signal.SIGKILL)
                            except Exception:
                                try:
                                    os.kill(pid, signal.SIGKILL)
                                except Exception:
                                    pass
                    except ValueError:
                        continue
        except Exception:
            pass

    @classmethod
    def kill_all(cls, include_orphans: bool = True):
        """Terminates all registered subprocesses and optionally cleans up any leftover orphans."""
        with cls._lock:
            procs = [info['process'] for info in list(cls._registry.values())]
            cls._registry.clear()

        for proc in procs:
            cls.kill_process(proc)

        if include_orphans:
            cls._kill_orphans()

    @classmethod
    def run_subprocess(
        cls,
        command: str,
        cwd: Optional[str] = None,
        shell: bool = True,
        check: bool = False,
        task_id: Optional[str] = None,
        relay_output: bool = False
    ) -> Tuple[int, str, str]:
        """
        Runs a subprocess tracked by ActiveSubprocesses.
        Returns (returncode, stdout_str, stderr_str).
        """
        if task_id is None:
            task_id = getattr(threading.current_thread(), 'task_id', None)

        if task_id and task_id in cls.cancelled_tasks:
            raise TaskCancelledException(f"Task {task_id} was cancelled.")

        proc = subprocess.Popen(
            command,
            cwd=cwd,
            shell=shell,
            start_new_session=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True
        )
        cls.register(proc, task_id=task_id, command=command)

        try:
            out_str, err_str = proc.communicate()
            if relay_output:
                if out_str:
                    sys.stdout.write(out_str)
                    sys.stdout.flush()
                if err_str:
                    sys.stderr.write(err_str)
                    sys.stderr.flush()

            if task_id and task_id in cls.cancelled_tasks:
                raise TaskCancelledException(f"Task {task_id} was cancelled.")

            if check and proc.returncode != 0:
                raise subprocess.CalledProcessError(
                    proc.returncode,
                    command,
                    output=out_str,
                    stderr=err_str
                )
            return proc.returncode, out_str or "", err_str or ""
        finally:
            cls.unregister(proc)
