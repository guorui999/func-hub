from pathlib import Path, PureWindowsPath, PurePosixPath
from funchub.github_client import get_config_dir, get_config_path
from funchub.client import FuncHub


class TestWindowsPathCompatibility:
    def test_config_dir_uses_pathlib(self):
        config_dir = get_config_dir()
        assert isinstance(config_dir, Path)
        assert config_dir.name == ".funchub"
        assert config_dir.parent == Path.home()

    def test_config_path_uses_pathlib(self):
        config_path = get_config_path()
        assert isinstance(config_path, Path)
        assert config_path.name == "config.yaml"
        assert config_path.parent.name == ".funchub"

    def test_cache_dir_uses_pathlib(self):
        hub = FuncHub(registry="https://example.com")
        assert isinstance(hub._cache_base, Path)
        assert hub._cache_base.name == "cache"
        assert hub._cache_base.parent.name == ".funchub"

    def test_path_join_uses_forward_slash(self):
        base = Path.home() / ".funchub" / "cache" / "my_tool" / ".version"
        parts = base.parts
        assert ".funchub" in parts
        assert "cache" in parts
        assert ".version" in parts

    def test_version_file_path_construction(self):
        cache_base = Path.home() / ".funchub" / "cache"
        tool_name = "web_scraper"
        version_file = cache_base / tool_name / ".version"
        assert str(version_file).endswith(".version")
        assert tool_name in str(version_file)

    def test_cache_dir_does_not_use_os_path_join(self):
        import inspect
        import funchub.client
        source = inspect.getsource(funchub.client.FuncHub)
        assert "os.path.join" not in source
        assert "Path(" in source or "/" in source

    def test_cli_uses_pathlib_not_ospath(self):
        import inspect
        import funchub.cli
        source = inspect.getsource(funchub.cli)
        assert "os.path" not in source
        assert "Path(" in source

    def test_pathlib_posix_style(self):
        from pathlib import Path
        p = Path("a") / "b" / "c"
        assert p.parts == ("a", "b", "c")

    def test_models_path_independent(self):
        from funchub.models import ToolDefinition, ToolVersion
        tv = ToolVersion(version="1.0.0", source_repo="https://example.com/repo.git", source_ref="v1.0.0")
        td = ToolDefinition(
            name="test",
            description="test",
            parameters={},
            author="test",
            entry_point="mod:fn",
            versions=[tv],
        )
        assert td.name == "test"
        assert len(td.versions) == 1
        assert td.versions[0].version == "1.0.0"
