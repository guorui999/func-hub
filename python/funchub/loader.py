import importlib
import importlib.util
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from funchub.exceptions import LoadError, NetworkError
from funchub.models import ToolDefinition, ToolVersion
from funchub.version_parser import resolve_version


class Loader:
    _instances: Dict[str, Any] = {}

    @staticmethod
    def _git_retry(cmd: list, cwd: Optional[Path] = None, max_retries: int = 3) -> None:
        last_exc: Optional[Exception] = None
        for attempt in range(max_retries):
            try:
                result = subprocess.run(
                    cmd,
                    cwd=str(cwd) if cwd else None,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode == 0:
                    return
                last_exc = subprocess.CalledProcessError(
                    result.returncode, cmd, result.stdout, result.stderr
                )
            except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
                last_exc = exc
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
        raise NetworkError(str(last_exc), attempts=max_retries) from last_exc

    @staticmethod
    def ensure_tool(
        tool_def: ToolDefinition,
        target_version_str: str,
        cache_base: Path,
        yes: bool = False,
    ) -> Path:
        version_meta: Optional[ToolVersion] = None
        for v in tool_def.versions:
            if v.version == target_version_str:
                version_meta = v
                break
        if version_meta is None:
            raise LoadError(
                f"版本 {target_version_str} 在工具 {tool_def.name} 中未找到"
            )

        tool_cache = cache_base / tool_def.name
        version_file = tool_cache / ".version"
        source_repo_file = tool_cache / ".source_repo"

        if version_file.exists():
            cached_version = version_file.read_text(encoding="utf-8").strip()
            if cached_version == target_version_str:
                return tool_cache

        import warnings
        repo_url = version_meta.source_repo
        warnings.warn(
            f"安全警告: 此工具将从远程仓库 {repo_url} 下载并执行代码。\n"
            f"请确保您信任该仓库的作者，并在隔离环境中使用。\n"
            f"若要查看源码，请访问: {repo_url}"
        )

        if not yes:
            try:
                answer = input("继续安装请按 Y，取消请按 N: ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                raise LoadError("安装已取消")
            if answer != "y":
                raise LoadError("安装已取消")

        source_ref = version_meta.source_ref

        if tool_cache.exists():
            Loader._git_retry(
                ["git", "fetch", "--tags", "--depth", "1"],
                cwd=tool_cache,
            )
            Loader._git_retry(
                ["git", "checkout", source_ref],
                cwd=tool_cache,
            )
        else:
            tool_cache.mkdir(parents=True, exist_ok=True)
            Loader._git_retry(
                [
                    "git", "clone", "--depth", "1",
                    "--branch", source_ref,
                    version_meta.source_repo,
                    str(tool_cache),
                ]
            )

        if version_meta.dependencies:
            deps = version_meta.dependencies
            pip_cmd = [sys.executable, "-m", "pip", "install"] + deps
            Loader._git_retry(pip_cmd)

        version_file.write_text(target_version_str, encoding="utf-8")
        source_repo_file.write_text(version_meta.source_repo, encoding="utf-8")

        return tool_cache

    @staticmethod
    def load_function(
        tool_def: ToolDefinition,
        target_version: str,
        cache_base: Path,
        yes: bool = False,
    ) -> Callable:
        tool_cache = Loader.ensure_tool(
            tool_def, target_version, cache_base, yes=yes
        )

        entry = tool_def.entry_point
        if ":" not in entry:
            raise LoadError(f"entry_point 格式必须为 'module.sub:func_name'，got: {entry}")

        module_path, func_name = entry.split(":", 1)

        sys.path.insert(0, str(tool_cache))
        try:
            mod = importlib.import_module(module_path)
        except ImportError as exc:
            sys.path.pop(0)
            raise LoadError(f"无法加载模块 '{module_path}': {exc}") from exc

        if not hasattr(mod, func_name):
            sys.path.pop(0)
            raise LoadError(
                f"模块 '{module_path}' 中没有函数 '{func_name}'"
            )

        func = getattr(mod, func_name)

        if not callable(func):
            sys.path.pop(0)
            raise LoadError(f"'{module_path}:{func_name}' 不是可调用对象")

        sys.path.pop(0)
        return func
