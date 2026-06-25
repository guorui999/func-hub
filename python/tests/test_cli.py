import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from funchub.cli import cli


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


class TestCliLogin:
    def test_login_saves_token(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.cli.load_config", return_value={}):
            with patch("funchub.cli.save_config") as mock_save:
                result = runner.invoke(cli, ["login", "--token", "ghp_test123"])
                assert result.exit_code == 0
                mock_save.assert_called_once()
                saved = mock_save.call_args[0][0]
                assert saved["github_token"] == "ghp_test123"


class TestCliConfig:
    def test_config_set_key_value(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.cli.load_config", return_value={}):
            with patch("funchub.cli.save_config") as mock_save:
                result = runner.invoke(cli, ["config", "registry", "https://my-registry.com"])
                assert result.exit_code == 0
                mock_save.assert_called_once()
                saved = mock_save.call_args[0][0]
                assert saved["registry"] == "https://my-registry.com"


class TestCliSearch:
    def test_search_finds_results(self, runner: CliRunner, mock_home: Path, sample_registry_data: Dict[str, Any]):
        with patch("funchub.client.FuncHub._fetch_registry") as mock_fetch:
            tools = {k: MagicMock(name=k, description=v["description"]) for k, v in sample_registry_data["tools"].items()}
            tools["web_scraper"].name = "web_scraper"
            tools["web_scraper"].description = "抓取网页标题"
            tools["image_resizer"].name = "image_resizer"
            tools["image_resizer"].description = "调整图片尺寸"
            mock_fetch.return_value = tools
            result = runner.invoke(cli, ["search", "scraper"])
            assert result.exit_code == 0
            assert "web_scraper" in result.output

    def test_search_no_results(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub._fetch_registry", return_value={}):
            result = runner.invoke(cli, ["search", "nonexistent"])
            assert result.exit_code == 0
            assert "未找到" in result.output


class TestCliList:
    def test_list_empty(self, runner: CliRunner, mock_home: Path):
        result = runner.invoke(cli, ["list"])
        assert result.exit_code == 0
        assert "未安装" in result.output

    def test_list_with_tools(self, runner: CliRunner, mock_home: Path):
        cache_dir = mock_home / ".funchub" / "cache" / "test_tool"
        cache_dir.mkdir(parents=True)
        (cache_dir / ".version").write_text("1.0.0", encoding="utf-8")
        (cache_dir / ".source_repo").write_text("https://example.com/repo.git", encoding="utf-8")
        result = runner.invoke(cli, ["list"])
        assert result.exit_code == 0
        assert "test_tool@1.0.0" in result.output


class TestCliPublish:
    def test_publish_dry_run(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.publish") as mock_publish:
            mock_publish.return_value = "[DRY RUN] test"
            with runner.isolated_filesystem():
                Path("funchub-tool.yaml").write_text(
                    "name: my_tool\ndescription: test\nauthor: me\nentry_point: mod:fn\nsource_repo: https://example.com",
                    encoding="utf-8",
                )
                result = runner.invoke(cli, ["publish", "--version", "1.0.0", "--dry-run"])
                assert result.exit_code == 0

    def test_publish_no_tool_file(self, runner: CliRunner, mock_home: Path):
        with runner.isolated_filesystem():
            result = runner.invoke(cli, ["publish", "--version", "1.0.0"])
            assert result.exit_code != 0
            assert "funchub-tool.yaml" in result.output


class TestCliInstall:
    def test_install_tool(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.install") as mock_install:
            mock_install.return_value = MagicMock()
            result = runner.invoke(cli, ["install", "web_scraper", "--yes"])
            assert result.exit_code == 0
            assert "安装成功" in result.output

    def test_install_not_found(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.install") as mock_install:
            from funchub.exceptions import ToolNotFoundError
            mock_install.side_effect = ToolNotFoundError("nonexistent")
            result = runner.invoke(cli, ["install", "nonexistent", "--yes"])
            assert result.exit_code != 0
            assert "未在中央索引" in result.output


class TestCliInfo:
    def test_info_tool_exists(self, runner: CliRunner, mock_home: Path, sample_registry_data: Dict[str, Any]):
        with patch("funchub.client.FuncHub.info") as mock_info:
            mock_def = MagicMock()
            mock_def.name = "web_scraper"
            mock_def.description = "test tool"
            mock_def.author = "test_author"
            mock_def.entry_point = "index:main"
            mock_def.versions = [MagicMock(version="1.0.0", is_prerelease=False)]
            mock_info.return_value = mock_def
            result = runner.invoke(cli, ["info", "web_scraper"])
            assert result.exit_code == 0
            assert "web_scraper" in result.output

    def test_info_not_found(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.info", return_value=None):
            result = runner.invoke(cli, ["info", "nonexistent"])
            assert result.exit_code == 0
            assert "未找到" in result.output


class TestCliUpdate:
    def test_update_tool(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.update") as mock_update:
            mock_update.return_value = "2.0.0"
            result = runner.invoke(cli, ["update", "web_scraper", "--yes"])
            assert result.exit_code == 0
            assert "已更新" in result.output

    def test_update_all(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.update_all") as mock_update:
            mock_update.return_value = ["web_scraper: 1.0.0 -> 2.0.0"]
            result = runner.invoke(cli, ["update", "--all", "--yes"])
            assert result.exit_code == 0


class TestCliUninstall:
    def test_uninstall(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.uninstall", return_value=True):
            result = runner.invoke(cli, ["uninstall", "web_scraper"])
            assert result.exit_code == 0
            assert "已卸载" in result.output

    def test_uninstall_not_installed(self, runner: CliRunner, mock_home: Path):
        with patch("funchub.client.FuncHub.uninstall", return_value=False):
            result = runner.invoke(cli, ["uninstall", "nonexistent"])
            assert result.exit_code == 0
            assert "未安装" in result.output
