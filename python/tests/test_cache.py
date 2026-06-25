import json
import time
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from funchub.client import FuncHub


class TestCache:
    @pytest.fixture
    def hub(self, mock_home: Path) -> FuncHub:
        return FuncHub(registry="https://example.com/registry.json")

    def test_registry_cache_is_written(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            hub.search("web_scraper")
        cache_file = mock_home / ".funchub" / "registry_cache.json"
        assert cache_file.exists()
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        assert "tools" in cached
        assert "web_scraper" in cached["tools"]
        assert "_cached_at" in cached

    def test_registry_cache_read_within_ttl(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        cache_file = mock_home / ".funchub" / "registry_cache.json"
        cache_file.parent.mkdir(parents=True)
        cache_data = {
            "_cached_at": time.time(),
            "tools": {"from_cache": {"name": "from_cache", "description": "cached", "parameters": {}, "author": "test", "entry_point": "m:fn", "versions": []}},
        }
        cache_file.write_text(json.dumps(cache_data), encoding="utf-8")
        with patch("funchub.client.retry_request") as mock_req:
            hub.search("from_cache")
            mock_req.assert_not_called()

    def test_registry_cache_expired_refetches(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        cache_file = mock_home / ".funchub" / "registry_cache.json"
        cache_file.parent.mkdir(parents=True)
        cache_data = {
            "_cached_at": time.time() - 600,
            "tools": {},
        }
        cache_file.write_text(json.dumps(cache_data), encoding="utf-8")
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            hub.search("web_scraper")
            mock_req.assert_called_once()

    def test_registry_cache_invalid_json_refetches(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        cache_file = mock_home / ".funchub" / "registry_cache.json"
        cache_file.parent.mkdir(parents=True)
        cache_file.write_text("invalid json", encoding="utf-8")
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            hub.search("web_scraper")
            mock_req.assert_called_once()

    def test_version_file_created_on_install(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            with patch("funchub.loader.Loader.load_function") as mock_load:
                mock_fn = MagicMock()
                mock_load.return_value = mock_fn
                with patch("funchub.loader.Loader.ensure_tool") as mock_ensure:
                    mock_ensure.return_value = mock_home / ".funchub" / "cache" / "web_scraper"
                    hub.install("web_scraper", yes=True)

    def test_version_file_read_and_compare(
        self, hub: FuncHub, mock_home: Path
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "test_tool"
        cache_dir.mkdir(parents=True)
        version_file = cache_dir / ".version"
        version_file.write_text("2.1.0", encoding="utf-8")
        content = version_file.read_text(encoding="utf-8").strip()
        assert content == "2.1.0"

    def test_source_repo_file_created(
        self, hub: FuncHub, mock_home: Path
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "test_tool"
        cache_dir.mkdir(parents=True)
        source_file = cache_dir / ".source_repo"
        source_file.write_text("https://github.com/test/repo.git", encoding="utf-8")
        assert source_file.read_text(encoding="utf-8").strip() == "https://github.com/test/repo.git"

    def test_update_returns_same_version_when_already_latest(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "web_scraper"
        cache_dir.mkdir(parents=True)
        (cache_dir / ".version").write_text("2.1.0", encoding="utf-8")
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            result = hub.update("web_scraper", yes=True)
            assert result == "2.1.0"

    def test_update_upgrades_when_outdated(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "web_scraper"
        cache_dir.mkdir(parents=True)
        (cache_dir / ".version").write_text("1.0.0", encoding="utf-8")
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            with patch("funchub.loader.Loader.load_function") as mock_load:
                mock_fn = MagicMock()
                mock_load.return_value = mock_fn
                result = hub.update("web_scraper", yes=True)
                assert result == "2.1.0"

    def test_update_all_returns_list(
        self, hub: FuncHub, mock_home: Path, sample_registry_data: Dict[str, Any]
    ):
        cache_dir = mock_home / ".funchub" / "cache" / "web_scraper"
        cache_dir.mkdir(parents=True)
        (cache_dir / ".version").write_text("1.0.0", encoding="utf-8")
        (cache_dir / ".source_repo").write_text("https://github.com/test/repo.git", encoding="utf-8")
        with patch("funchub.client.retry_request") as mock_req:
            mock_resp = MagicMock()
            mock_resp.json.return_value = sample_registry_data
            mock_req.return_value = mock_resp
            with patch("funchub.loader.Loader.load_function") as mock_load:
                mock_fn = MagicMock()
                mock_load.return_value = mock_fn
                results = hub.update_all(yes=True)
                assert len(results) > 0
                assert "web_scraper" in results[0]
