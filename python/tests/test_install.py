import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from funchub.exceptions import ToolNotFoundError, VersionNotFoundError
from funchub.client import FuncHub
from funchub.models import ToolDefinition, ToolVersion


class TestFuncHubInstall:
    @pytest.fixture
    def hub(self, mock_home: Path) -> FuncHub:
        return FuncHub(registry="https://example.com/registry.json")

    @pytest.fixture
    def mock_registry_response(self, sample_registry_data: Dict[str, Any]):
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            yield mock_req

    def test_install_tool_not_found(self, hub: FuncHub, mock_registry_response):
        with pytest.raises(ToolNotFoundError):
            hub.install("nonexistent_tool")

    def test_install_version_not_found(self, hub: FuncHub, mock_registry_response):
        with pytest.raises(VersionNotFoundError):
            hub.install("web_scraper", constraint="^99.0.0")

    def test_install_loads_function(
        self, hub: FuncHub, mock_registry_response, mock_home: Path
    ):
        with patch("funchub.loader.Loader.load_function") as mock_load:
            mock_fn = MagicMock()
            mock_load.return_value = mock_fn
            result = hub.install("web_scraper", yes=True)
            assert result == mock_fn

    def test_install_cached_version_skips_loading(
        self, hub: FuncHub, mock_registry_response, mock_home: Path
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "web_scraper"
        cache_dir.mkdir(parents=True)
        version_file = cache_dir / ".version"
        version_file.write_text("2.1.0", encoding="utf-8")
        mock_fn = MagicMock()
        hub._funcs["web_scraper"] = mock_fn
        with patch("funchub.loader.Loader.load_function") as mock_load:
            result = hub.install("web_scraper", yes=True)
            mock_load.assert_not_called()
            assert result == mock_fn

    def test_install_cached_outdated_version_reloads(
        self, hub: FuncHub, mock_registry_response, mock_home: Path
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "web_scraper"
        cache_dir.mkdir(parents=True)
        version_file = cache_dir / ".version"
        version_file.write_text("1.0.0", encoding="utf-8")
        with patch("funchub.loader.Loader.load_function") as mock_load:
            mock_fn = MagicMock()
            mock_load.return_value = mock_fn
            result = hub.install("web_scraper", yes=True)
            assert result == mock_fn

    def test_install_with_at_syntax_parses_constraint(
        self, hub: FuncHub, mock_registry_response, mock_home: Path
    ):
        with patch("funchub.loader.Loader.load_function") as mock_load:
            mock_fn = MagicMock()
            mock_load.return_value = mock_fn
            result = hub.install("web_scraper@^1.0", yes=True)
            assert result == mock_fn

    def test_install_with_branch_constraint_skips_version_check(
        self, hub: FuncHub, mock_registry_response, mock_home: Path
    ):
        with patch("funchub.loader.Loader.load_function") as mock_load:
            mock_fn = MagicMock()
            mock_load.return_value = mock_fn
            result = hub.install("web_scraper@main", yes=True)
            assert result == mock_fn

    def test_list_installed_empty(self, hub: FuncHub, mock_home: Path):
        assert hub.list_installed() == []

    def test_list_installed_with_tools(
        self, hub: FuncHub, mock_home: Path
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "test_tool"
        cache_dir.mkdir(parents=True)
        (cache_dir / ".version").write_text("1.0.0", encoding="utf-8")
        (cache_dir / ".source_repo").write_text("https://github.com/test/repo.git", encoding="utf-8")
        items = hub.list_installed()
        assert len(items) == 1
        assert items[0]["name"] == "test_tool"
        assert items[0]["version"] == "1.0.0"

    def test_uninstall_removes_cache(
        self, hub: FuncHub, mock_home: Path
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "test_tool"
        cache_dir.mkdir(parents=True)
        (cache_dir / ".version").write_text("1.0.0", encoding="utf-8")
        assert hub.uninstall("test_tool") is True
        assert cache_dir.exists() is False

    def test_uninstall_not_installed(
        self, hub: FuncHub, mock_home: Path
    ):
        assert hub.uninstall("nonexistent") is False

    def test_search_finds_by_name(
        self, hub: FuncHub, mock_registry_response
    ):
        results = hub.search("web_scraper")
        assert len(results) > 0
        assert results[0].name == "web_scraper"

    def test_search_finds_by_description(
        self, hub: FuncHub, mock_registry_response
    ):
        results = hub.search("抓取")
        assert len(results) > 0
        assert "scraper" in results[0].name

    def test_search_no_match(
        self, hub: FuncHub, mock_registry_response
    ):
        results = hub.search("xyznonexistent123")
        assert len(results) == 0

    def test_get_tool_exists(
        self, hub: FuncHub, mock_registry_response
    ):
        tool = hub.get_tool("web_scraper")
        assert tool is not None
        assert tool.name == "web_scraper"

    def test_get_tool_not_found(
        self, hub: FuncHub, mock_registry_response
    ):
        tool = hub.get_tool("nonexistent")
        assert tool is None
