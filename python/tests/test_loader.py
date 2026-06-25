from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from funchub.exceptions import LoadError
from funchub.loader import Loader
from funchub.models import ToolDefinition, ToolVersion


class TestEnsureTool:
    def test_cached_version_returns_early(self, mock_home: Path, sample_tool_def: ToolDefinition):
        cache_dir = mock_home / ".funchub" / "cache" / "web_scraper"
        cache_dir.mkdir(parents=True)
        version_file = cache_dir / ".version"
        version_file.write_text("2.1.0", encoding="utf-8")
        with patch("funchub.loader.subprocess.run") as mock_run:
            result = Loader.ensure_tool(
                sample_tool_def, "2.1.0", mock_home / ".funchub" / "cache", yes=True
            )
            assert result == cache_dir
            mock_run.assert_not_called()

    def test_uncached_tool_calls_git_clone(self, mock_home: Path, sample_tool_def: ToolDefinition):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        with patch("funchub.loader.subprocess.run", return_value=mock_proc):
            with patch("builtins.input", return_value="y"):
                Loader.ensure_tool(
                    sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                )

    def test_cancelled_install_raises(self, mock_home: Path, sample_tool_def: ToolDefinition):
        with patch("builtins.input", return_value="n"):
            with pytest.raises(LoadError, match="已取消"):
                Loader.ensure_tool(
                    sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=False
                )

    def test_version_not_found_raises(self, mock_home: Path, sample_tool_def: ToolDefinition):
        with pytest.raises(LoadError, match="未找到"):
            Loader.ensure_tool(
                sample_tool_def, "99.99.99", mock_home / ".funchub" / "cache", yes=True
            )

    def test_writes_version_file_after_clone(self, mock_home: Path, sample_tool_def: ToolDefinition):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        with patch("funchub.loader.subprocess.run", return_value=mock_proc):
            with patch("builtins.input", return_value="y"):
                Loader.ensure_tool(
                    sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                )
                version_file = mock_home / ".funchub" / "cache" / "web_scraper" / ".version"
                assert version_file.exists()
                assert version_file.read_text(encoding="utf-8").strip() == "1.0.0"

    def test_writes_source_repo_file(self, mock_home: Path, sample_tool_def: ToolDefinition):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        with patch("funchub.loader.subprocess.run", return_value=mock_proc):
            with patch("builtins.input", return_value="y"):
                Loader.ensure_tool(
                    sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                )
                source_file = mock_home / ".funchub" / "cache" / "web_scraper" / ".source_repo"
                assert source_file.exists()
                assert "test/web_scraper.git" in source_file.read_text(encoding="utf-8")


class TestLoadFunction:
    def test_load_function_invalid_entry_point(self, mock_home: Path, sample_tool_def: ToolDefinition):
        bad_def = sample_tool_def.model_copy()
        bad_def.entry_point = "no_colon"
        with patch("funchub.loader.Loader.ensure_tool", return_value=Path("/tmp/fake")):
            with pytest.raises(LoadError, match="entry_point"):
                Loader.load_function(
                    bad_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                )

    def test_load_function_import_error(self, mock_home: Path, sample_tool_def: ToolDefinition):
        with patch("funchub.loader.Loader.ensure_tool", return_value=Path("/tmp/fake")):
            with patch("importlib.import_module") as mock_import:
                mock_import.side_effect = ImportError("no module")
                with pytest.raises(LoadError, match="无法加载模块"):
                    Loader.load_function(
                        sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                    )

    def test_load_function_missing_attr(self, mock_home: Path, sample_tool_def: ToolDefinition):
        with patch("funchub.loader.Loader.ensure_tool", return_value=Path("/tmp/fake")):
            with patch("importlib.import_module") as mock_import:
                mock_mod = MagicMock()
                del mock_mod.main
                mock_import.return_value = mock_mod
                with pytest.raises(LoadError):
                    Loader.load_function(
                        sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                    )

    def test_load_function_non_callable(self, mock_home: Path, sample_tool_def: ToolDefinition):
        with patch("funchub.loader.Loader.ensure_tool", return_value=Path("/tmp/fake")):
            with patch("importlib.import_module") as mock_import:
                mock_mod = MagicMock()
                mock_mod.main = "not_callable"
                mock_import.return_value = mock_mod
                with pytest.raises(LoadError, match="不是可调用对象"):
                    Loader.load_function(
                        sample_tool_def, "1.0.0", mock_home / ".funchub" / "cache", yes=True
                    )
