import json
import re
import shutil
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from funchub.exceptions import (
    FuncHubError,
    ToolNotFoundError,
    VersionNotFoundError,
)
from funchub.github_client import (
    GitHubRegistryClient,
    load_config,
    resolve_registry,
    resolve_registry_repo,
    resolve_token,
    retry_request,
)
from funchub.loader import Loader
from funchub.models import ToolDefinition, ToolVersion
from funchub.version_parser import resolve_version


class FuncHub:
    def __init__(
        self,
        registry: Optional[str] = None,
        token: Optional[str] = None,
    ) -> None:
        self._registry_url = resolve_registry(registry)
        self._token = resolve_token(token)
        self._cache_base = Path.home() / ".funchub" / "cache"
        self._registry_cache_path = Path.home() / ".funchub" / "registry_cache.json"
        self._funcs: Dict[str, Callable] = {}

    def _fetch_registry(
        self, use_cache: bool = True
    ) -> Dict[str, ToolDefinition]:
        now = time.time()
        if use_cache and self._registry_cache_path.exists():
            raw = self._registry_cache_path.read_text(encoding="utf-8")
            try:
                cached = json.loads(raw)
                cache_time = cached.get("_cached_at", 0)
                if now - cache_time < 300:
                    tools_raw = cached.get("tools", {})
                    return {
                        k: ToolDefinition(**v)
                        for k, v in tools_raw.items()
                    }
            except (json.JSONDecodeError, TypeError):
                pass

        resp = retry_request("GET", self._registry_url)
        resp.raise_for_status()
        data = resp.json()

        tools_raw: Dict[str, Any] = {}
        if "tools" in data:
            tools_raw = data["tools"]
        else:
            tools_raw = data

        # Also load individual tool JSON files from tools/ directory
        m = re.match(
            r'https://raw\.githubusercontent\.com/(.+?)/(.+?)/main/(.*)',
            self._registry_url,
        )
        if m:
            owner, repo, _ = m.groups()
            tools_api = f"https://api.github.com/repos/{owner}/{repo}/contents/tools"
            try:
                file_list_resp = retry_request(
                    "GET",
                    tools_api,
                    headers={"Accept": "application/vnd.github.v3+json"},
                )
                if file_list_resp.status_code == 200:
                    file_list = file_list_resp.json()
                    for f in file_list:
                        if f.get("type") == "file" and f["name"].endswith(".json"):
                            tool_resp = retry_request("GET", f.get("download_url", ""))
                            if tool_resp.status_code == 200:
                                tool_data = tool_resp.json()
                                tool_name = tool_data.get(
                                    "name", f["name"].replace(".json", "")
                                )
                                tools_raw[tool_name] = tool_data
            except Exception:
                pass

        tools: Dict[str, ToolDefinition] = {}
        for k, v in tools_raw.items():
            if isinstance(v, dict):
                tools[k] = ToolDefinition(**v)

        cache_data = {
            "_cached_at": now,
            "tools": {k: v.model_dump() for k, v in tools.items()},
        }
        self._registry_cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._registry_cache_path.write_text(
            json.dumps(cache_data, indent=2), encoding="utf-8"
        )

        return tools

    def search(self, query: str) -> List[ToolDefinition]:
        registry = self._fetch_registry()
        q = query.lower()
        results = []
        for tool_def in registry.values():
            if q in tool_def.name.lower() or q in tool_def.description.lower():
                results.append(tool_def)
        return results

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        registry = self._fetch_registry()
        return registry.get(name)

    def install(
        self,
        tool_name: str,
        constraint: Optional[str] = None,
        include_prerelease: bool = False,
        yes: bool = False,
    ) -> Callable:
        if "@" in tool_name and constraint is None:
            parts = tool_name.split("@", 1)
            tool_name = parts[0]
            constraint = parts[1]
        registry = self._fetch_registry()
        tool_def = registry.get(tool_name)
        if tool_def is None:
            raise ToolNotFoundError(tool_name)

        available = [v.version for v in tool_def.versions]
        target_version = resolve_version(
            available, constraint or "latest", include_prerelease=include_prerelease
        )
        if target_version is None:
            raise VersionNotFoundError(constraint or "latest")

        cache_dir = self._cache_base / tool_name
        version_file = cache_dir / ".version"

        if version_file.exists():
            cached_version = version_file.read_text(encoding="utf-8").strip()
            if cached_version == target_version:
                func = self._funcs.get(tool_name)
                if func is not None:
                    return func

        func = Loader.load_function(
            tool_def, target_version, self._cache_base, yes=yes
        )
        self._funcs[tool_name] = func
        return func

    def publish(
        self,
        tool_def: ToolDefinition,
        force: bool = False,
        dry_run: bool = False,
    ) -> str:
        if self._token is None:
            raise FuncHubError(
                "请先运行 funchub login 配置 GitHub Token"
            )
        registry_repo = resolve_registry_repo()
        client = GitHubRegistryClient(self._token, registry_repo=registry_repo)
        return client.publish_tool(tool_def, force=force, dry_run=dry_run)

    def list_installed(self) -> List[Dict[str, str]]:
        if not self._cache_base.exists():
            return []
        result = []
        for child in self._cache_base.iterdir():
            if child.is_dir():
                version_file = child / ".version"
                source_file = child / ".source_repo"
                version = ""
                source = ""
                if version_file.exists():
                    version = version_file.read_text(encoding="utf-8").strip()
                if source_file.exists():
                    source = source_file.read_text(encoding="utf-8").strip()
                result.append({
                    "name": child.name,
                    "version": version,
                    "source_repo": source,
                })
        return result

    def update(
        self,
        tool_name: str,
        include_prerelease: bool = False,
        yes: bool = False,
    ) -> Optional[str]:
        registry = self._fetch_registry()
        tool_def = registry.get(tool_name)
        if tool_def is None:
            raise ToolNotFoundError(tool_name)

        available = [v.version for v in tool_def.versions]
        latest = resolve_version(
            available, "latest", include_prerelease=include_prerelease
        )
        if latest is None:
            raise VersionNotFoundError("latest")

        cache_dir = self._cache_base / tool_name
        version_file = cache_dir / ".version"

        if version_file.exists():
            current = version_file.read_text(encoding="utf-8").strip()
            if current == latest:
                return current

        self.install(tool_name, constraint=latest, include_prerelease=include_prerelease, yes=yes)
        return latest

    def update_all(
        self,
        include_prerelease: bool = False,
        yes: bool = False,
    ) -> List[str]:
        updated = []
        installed = self.list_installed()
        for item in installed:
            try:
                new_ver = self.update(
                    item["name"],
                    include_prerelease=include_prerelease,
                    yes=yes,
                )
                if new_ver and new_ver != item["version"]:
                    updated.append(f"{item['name']}: {item['version']} -> {new_ver}")
            except FuncHubError:
                pass
        return updated

    def info(self, tool_name: str) -> Optional[ToolDefinition]:
        return self.get_tool(tool_name)

    def uninstall(self, tool_name: str) -> bool:
        cache_dir = self._cache_base / tool_name
        if cache_dir.exists():
            shutil.rmtree(str(cache_dir))
            self._funcs.pop(tool_name, None)
            return True
        return False
