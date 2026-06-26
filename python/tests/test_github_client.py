import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
import responses
import yaml

from funchub.exceptions import ConflictError, FuncHubError
from funchub.github_client import (
    GitHubRegistryClient,
    load_config,
    resolve_registry,
    resolve_token,
    retry_request,
    save_config,
)
from funchub.models import ToolDefinition


class TestConfig:
    def test_load_config_no_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        cfg = load_config()
        assert cfg == {}

    def test_save_and_load_config(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        cfg = {"github_token": "ghp_test", "registry": "https://example.com"}
        save_config(cfg)
        loaded = load_config()
        assert loaded["github_token"] == "ghp_test"
        assert loaded["registry"] == "https://example.com"

    def test_resolve_registry_cli_first(self):
        assert resolve_registry("https://cli.example.com") == "https://cli.example.com"

    def test_resolve_registry_env_var(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("FUNCHUB_REGISTRY", "https://env.example.com")
        assert resolve_registry(None) == "https://env.example.com"

    def test_resolve_registry_default(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.delenv("FUNCHUB_REGISTRY", raising=False)
        assert resolve_registry(None) == "https://raw.githubusercontent.com/funchub-registry/registry/main/registry.json"

    def test_resolve_token_cli_first(self):
        assert resolve_token("cli_token") == "cli_token"

    def test_resolve_token_env_var(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("GITHUB_TOKEN", "env_token")
        assert resolve_token(None) == "env_token"

    def test_resolve_token_gh_env(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("GH_TOKEN", "gh_env_token")
        assert resolve_token(None) == "gh_env_token"

    def test_resolve_token_config_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("GITHUB_TOKEN", "")
        monkeypatch.setenv("GH_TOKEN", "")
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        cfg_dir = tmp_path / ".funchub"
        cfg_dir.mkdir()
        cfg = {"github_token": "file_token"}
        (cfg_dir / "config.yaml").write_text(yaml.dump(cfg), encoding="utf-8")
        assert resolve_token(None) == "file_token"


class TestRetryRequest:
    @responses.activate
    def test_retry_success_first_attempt(self):
        responses.get("https://api.example.com/test", json={"ok": True}, status=200)
        resp = retry_request("GET", "https://api.example.com/test")
        assert resp.json() == {"ok": True}
        assert len(responses.calls) == 1

    @responses.activate
    def test_retry_retries_on_502(self):
        responses.get(
            "https://api.example.com/test",
            status=502,
            body="Bad Gateway",
        )
        responses.get(
            "https://api.example.com/test",
            status=502,
            body="Bad Gateway",
        )
        responses.get(
            "https://api.example.com/test",
            status=200,
            json={"ok": True},
        )
        resp = retry_request("GET", "https://api.example.com/test")
        assert resp.json() == {"ok": True}
        assert len(responses.calls) == 3

    @responses.activate
    def test_retry_exhausted_raises(self):
        responses.get(
            "https://api.example.com/test",
            status=502,
            body="Bad Gateway",
        )
        responses.get(
            "https://api.example.com/test",
            status=502,
            body="Bad Gateway",
        )
        responses.get(
            "https://api.example.com/test",
            status=502,
            body="Bad Gateway",
        )
        with pytest.raises(FuncHubError, match="网络请求失败"):
            retry_request("GET", "https://api.example.com/test")
        assert len(responses.calls) == 3


class TestGitHubRegistryClient:
    @pytest.fixture
    def client(self) -> GitHubRegistryClient:
        return GitHubRegistryClient(token="ghp_test_token")

    @responses.activate
    def test_check_write_permission_has_push(self, client: GitHubRegistryClient):
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry",
            json={"permissions": {"push": True}},
            status=200,
        )
        assert client._check_write_permission() is True

    @responses.activate
    def test_check_write_permission_no_push(self, client: GitHubRegistryClient):
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry",
            json={"permissions": {"push": False}},
            status=200,
        )
        assert client._check_write_permission() is False

    @responses.activate
    def test_get_user_login(self, client: GitHubRegistryClient):
        responses.get(
            "https://api.github.com/user",
            json={"login": "test_user"},
            status=200,
        )
        assert client._get_user_login() == "test_user"

    @responses.activate
    def test_fork_repository(self, client: GitHubRegistryClient):
        responses.post(
            "https://api.github.com/repos/funchub-registry/registry/forks",
            json={"full_name": "test_user/registry"},
            status=202,
        )
        result = client._fork_repository()
        assert result["full_name"] == "test_user/registry"

    @responses.activate
    def test_fetch_file_exists(self, client: GitHubRegistryClient):
        content = json.dumps({"name": "test_tool", "author": "test_user"}).encode()
        import base64
        encoded = base64.b64encode(content).decode()
        responses.get(
            "https://api.github.com/repos/test_user/registry/contents/tools/test_tool.json",
            json={"content": encoded, "sha": "abc123"},
            status=200,
        )
        result = client._fetch_file("test_user/registry", "tools/test_tool.json")
        assert result is not None
        assert result["name"] == "test_tool"

    @responses.activate
    def test_fetch_file_not_found(self, client: GitHubRegistryClient):
        responses.get(
            "https://api.github.com/repos/test_user/registry/contents/tools/missing.json",
            status=404,
        )
        result = client._fetch_file("test_user/registry", "tools/missing.json")
        assert result is None

    @responses.activate
    def test_create_branch_success(self, client: GitHubRegistryClient):
        responses.get(
            "https://api.github.com/repos/test_user/registry/git/refs/heads/main",
            json={"object": {"sha": "base_sha_123"}},
            status=200,
        )
        responses.post(
            "https://api.github.com/repos/test_user/registry/git/refs",
            json={"ref": "refs/heads/publish-test-tool"},
            status=201,
        )
        client._create_branch("test_user/registry", "publish-test-tool")

    @responses.activate
    def test_create_branch_already_exists(self, client: GitHubRegistryClient):
        responses.get(
            "https://api.github.com/repos/test_user/registry/git/refs/heads/main",
            json={"object": {"sha": "base_sha_123"}},
            status=200,
        )
        responses.post(
            "https://api.github.com/repos/test_user/registry/git/refs",
            status=422,
        )
        responses.get(
            "https://api.github.com/repos/test_user/registry/git/refs/heads/publish-test-tool",
            json={"ref": "refs/heads/publish-test-tool"},
            status=200,
        )
        client._create_branch("test_user/registry", "publish-test-tool")

    @responses.activate
    def test_create_pr(self, client: GitHubRegistryClient):
        responses.post(
            "https://api.github.com/repos/funchub-registry/registry/pulls",
            json={"html_url": "https://github.com/funchub-registry/registry/pull/1"},
            status=201,
        )
        url = client._create_pr(
            "test_user:branch", "publish-branch", "发布工具: test_tool"
        )
        assert url == "https://github.com/funchub-registry/registry/pull/1"

    @responses.activate
    def test_publish_tool_no_write_permission_creates_fork_and_pr(
        self, client: GitHubRegistryClient, sample_tool_def: ToolDefinition
    ):
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry",
            json={"permissions": {"push": False}},
            status=200,
        )
        responses.post(
            "https://api.github.com/repos/funchub-registry/registry/forks",
            json={"full_name": "test_user/registry"},
            status=202,
        )
        responses.get(
            "https://api.github.com/repos/test_user/registry/contents/tools/web_scraper.json",
            status=404,
        )
        responses.get(
            "https://api.github.com/user",
            json={"login": "test_user"},
            status=200,
        )
        responses.get(
            "https://api.github.com/repos/test_user/registry/git/refs/heads/main",
            json={"object": {"sha": "base_sha"}},
            status=200,
        )
        responses.post(
            "https://api.github.com/repos/test_user/registry/git/refs",
            json={},
            status=201,
        )
        responses.put(
            "https://api.github.com/repos/test_user/registry/contents/tools/web_scraper.json",
            json={},
            status=201,
        )
        responses.post(
            "https://api.github.com/repos/funchub-registry/registry/pulls",
            json={"html_url": "https://github.com/funchub-registry/registry/pull/42"},
            status=201,
        )
        result = client.publish_tool(sample_tool_def)
        assert "pull/42" in result

    @responses.activate
    def test_publish_tool_with_write_permission(
        self, client: GitHubRegistryClient, sample_tool_def: ToolDefinition
    ):
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry",
            json={"permissions": {"push": True}},
            status=200,
        )
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry/contents/tools/web_scraper.json",
            status=404,
        )
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry/git/refs/heads/main",
            json={"object": {"sha": "base_sha"}},
            status=200,
        )
        responses.post(
            "https://api.github.com/repos/funchub-registry/registry/git/refs",
            json={},
            status=201,
        )
        responses.put(
            "https://api.github.com/repos/funchub-registry/registry/contents/tools/web_scraper.json",
            json={},
            status=201,
        )
        result = client.publish_tool(sample_tool_def)
        assert "funchub-registry/registry/tree/publish-web_scraper" in result

    @responses.activate
    def test_publish_tool_conflict_raises(
        self, client: GitHubRegistryClient, sample_tool_def: ToolDefinition
    ):
        import base64
        existing = {"name": "web_scraper", "author": "other_user"}
        content = json.dumps(existing).encode()
        encoded = base64.b64encode(content).decode()
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry",
            json={"permissions": {"push": True}},
            status=200,
        )
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry/contents/tools/web_scraper.json",
            json={"content": encoded, "sha": "abc"},
            status=200,
        )
        with pytest.raises(ConflictError):
            client.publish_tool(sample_tool_def)

    @responses.activate
    def test_publish_tool_dry_run(
        self, client: GitHubRegistryClient, sample_tool_def: ToolDefinition
    ):
        result = client.publish_tool(sample_tool_def, dry_run=True)
        assert "[DRY RUN]" in result

    @responses.activate
    def test_publish_tool_conflict_with_force_ok(
        self, client: GitHubRegistryClient, sample_tool_def: ToolDefinition
    ):
        import base64
        existing = {"name": "web_scraper", "author": "other_user"}
        content = json.dumps(existing).encode()
        encoded = base64.b64encode(content).decode()
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry",
            json={"permissions": {"push": True}},
            status=200,
        )
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry/contents/tools/web_scraper.json",
            json={"content": encoded, "sha": "abc"},
            status=200,
        )
        responses.get(
            "https://api.github.com/repos/funchub-registry/registry/git/refs/heads/main",
            json={"object": {"sha": "base_sha"}},
            status=200,
        )
        responses.post(
            "https://api.github.com/repos/funchub-registry/registry/git/refs",
            json={},
            status=201,
        )
        responses.put(
            "https://api.github.com/repos/funchub-registry/registry/contents/tools/web_scraper.json",
            json={},
            status=201,
        )
        result = client.publish_tool(sample_tool_def, force=True)
        assert "funchub-registry/registry" in result
