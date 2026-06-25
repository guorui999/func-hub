import base64
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests
import yaml

from funchub.exceptions import ConfigError, ConflictError, FuncHubError, NetworkError
from funchub.models import ToolDefinition


def get_config_dir() -> Path:
    return Path.home() / ".funchub"


def get_config_path() -> Path:
    return get_config_dir() / "config.yaml"


def load_config() -> Dict[str, Any]:
    config_path = get_config_path()
    if config_path.exists():
        raw = config_path.read_text(encoding="utf-8")
        return yaml.safe_load(raw) or {}
    return {}


def save_config(cfg: Dict[str, Any]) -> None:
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)
    config_path = get_config_path()
    config_path.write_text(yaml.dump(cfg), encoding="utf-8")


def resolve_registry(cli_registry: Optional[str] = None) -> str:
    if cli_registry:
        return cli_registry
    env_reg = os.environ.get("FUNCHUB_REGISTRY")
    if env_reg:
        return env_reg
    cfg = load_config()
    file_reg = cfg.get("registry")
    if file_reg:
        return file_reg
    return "https://raw.githubusercontent.com/funchub-registry/registry/main"


def resolve_token(cli_token: Optional[str] = None) -> Optional[str]:
    if cli_token:
        return cli_token
    env_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if env_token:
        return env_token
    cfg = load_config()
    return cfg.get("github_token")


def retry_request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json_data: Optional[Dict[str, Any]] = None,
    max_retries: int = 3,
) -> requests.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            resp = requests.request(
                method, url, headers=headers, json=json_data, timeout=30
            )
            if resp.status_code in (502, 503, 504):
                raise NetworkError(f"HTTP {resp.status_code}", attempts=attempt + 1)
            return resp
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
        except NetworkError as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    raise NetworkError(str(last_exc), attempts=max_retries) from last_exc


class GitHubRegistryClient:
    API_BASE = "https://api.github.com"

    def __init__(self, token: str) -> None:
        self.token = token
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        }
        self.registry_repo = "funchub-registry/registry"
        self.registry_branch = "main"

    def _api_url(self, path: str) -> str:
        return f"{self.API_BASE}{path}"

    def _check_write_permission(self) -> bool:
        url = self._api_url(f"/repos/{self.registry_repo}")
        resp = retry_request("GET", url, headers=self.headers)
        if resp.status_code == 200:
            data = resp.json()
            permissions = data.get("permissions", {})
            return permissions.get("push", False)
        return False

    def _get_user_login(self) -> str:
        url = self._api_url("/user")
        resp = retry_request("GET", url, headers=self.headers)
        resp.raise_for_status()
        return resp.json()["login"]

    def _fork_repository(self) -> Dict[str, Any]:
        url = self._api_url(f"/repos/{self.registry_repo}/forks")
        resp = retry_request("POST", url, headers=self.headers, json_data={})
        if resp.status_code in (200, 201, 202):
            return resp.json()
        raise FuncHubError(f"Fork 失败: HTTP {resp.status_code} {resp.text}")

    def _fetch_file(
        self, repo: str, path: str, branch: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        url = self._api_url(f"/repos/{repo}/contents/{path}")
        params = {}
        if branch:
            params["ref"] = branch
        resp = retry_request("GET", url, headers=self.headers)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "content" in data:
            decoded = base64.b64decode(data["content"]).decode("utf-8")
            return json.loads(decoded)
        return None

    def _get_default_branch_sha(self, repo: str) -> str:
        url = self._api_url(f"/repos/{repo}/git/refs/heads/{self.registry_branch}")
        resp = retry_request("GET", url, headers=self.headers)
        resp.raise_for_status()
        return resp.json()["object"]["sha"]

    def _create_branch(self, repo: str, branch_name: str) -> None:
        sha = self._get_default_branch_sha(repo)
        url = self._api_url(f"/repos/{repo}/git/refs")
        body = {"ref": f"refs/heads/{branch_name}", "sha": sha}
        resp = retry_request("POST", url, headers=self.headers, json_data=body)
        if resp.status_code not in (201, 200):
            existing = retry_request(
                "GET",
                self._api_url(f"/repos/{repo}/git/refs/heads/{branch_name}"),
                headers=self.headers,
            )
            if existing.status_code == 200:
                return
            raise FuncHubError(
                f"创建分支失败: HTTP {resp.status_code} {resp.text}"
            )

    def _commit_file(
        self, repo: str, branch: str, path: str, content_b64: str
    ) -> None:
        existing = self._fetch_file(repo, path, branch=branch)
        url = self._api_url(f"/repos/{repo}/contents/{path}")
        body: Dict[str, Any] = {
            "message": f"发布工具 {path.split('/')[-1].replace('.json', '')}",
            "content": content_b64,
            "branch": branch,
        }
        if existing and "sha" in existing:
            body["sha"] = existing["sha"]
        resp = retry_request("PUT", url, headers=self.headers, json_data=body)
        if resp.status_code not in (200, 201):
            raise FuncHubError(
                f"提交文件失败: HTTP {resp.status_code} {resp.text}"
            )

    def _create_pr(
        self, repo: str, branch: str, title: str
    ) -> str:
        url = self._api_url(f"/repos/{self.registry_repo}/pulls")
        body = {
            "title": title,
            "head": branch,
            "base": self.registry_branch,
        }
        resp = retry_request("POST", url, headers=self.headers, json_data=body)
        if resp.status_code in (200, 201):
            return resp.json()["html_url"]
        raise FuncHubError(f"创建 PR 失败: HTTP {resp.status_code} {resp.text}")

    def publish_tool(
        self,
        tool_def: ToolDefinition,
        force: bool = False,
        dry_run: bool = False,
    ) -> str:
        if dry_run:
            return f"[DRY RUN] 将提交到 {self.registry_repo}: tools/{tool_def.name}.json"
        has_write = self._check_write_permission()

        if not has_write:
            fork_data = self._fork_repository()
            fork_full_name = fork_data["full_name"]
            target_repo = fork_full_name
        else:
            target_repo = self.registry_repo

        current_content = self._fetch_file(
            target_repo, f"tools/{tool_def.name}.json"
        )

        if current_content and current_content.get("author") != tool_def.author:
            if not force:
                raise ConflictError(tool_def.name, current_content.get("author", "unknown"))

        new_content_json = tool_def.model_dump_json(indent=2)
        encoded = base64.b64encode(new_content_json.encode()).decode()

        branch = f"publish-{tool_def.name}"
        self._create_branch(target_repo, branch)
        self._commit_file(
            target_repo, branch, f"tools/{tool_def.name}.json", encoded
        )

        if not has_write:
            pr_url = self._create_pr(
                target_repo,
                f"{self._get_user_login()}:{branch}",
                f"发布工具: {tool_def.name}",
            )
            return pr_url
        return f"https://github.com/{self.registry_repo}/tree/{branch}/tools/{tool_def.name}.json"
