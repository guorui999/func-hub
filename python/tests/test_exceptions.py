import pytest
from funchub.exceptions import (
    ToolNotFoundError,
    VersionNotFoundError,
    ConflictError,
    RegistryError,
    NetworkError,
    ConfigError,
    LoadError,
    FuncHubError,
)


class TestExceptions:
    def test_tool_not_found(self):
        exc = ToolNotFoundError("my_tool")
        assert "my_tool" in str(exc)
        assert exc.tool_name == "my_tool"

    def test_version_not_found(self):
        exc = VersionNotFoundError("^1.0.0")
        assert "^1.0.0" in str(exc)
        assert exc.constraint == "^1.0.0"

    def test_conflict_error(self):
        exc = ConflictError("my_tool", "other_author")
        assert "my_tool" in str(exc)
        assert "other_author" in str(exc)
        assert exc.tool_name == "my_tool"
        assert exc.author == "other_author"

    def test_registry_error(self):
        exc = RegistryError("connection failed")
        assert "connection failed" in str(exc)

    def test_network_error(self):
        exc = NetworkError("timeout", attempts=3)
        assert "3 次" in str(exc)
        assert exc.attempts == 3

    def test_config_error(self):
        exc = ConfigError("invalid config")
        assert "invalid config" in str(exc)

    def test_load_error(self):
        exc = LoadError("module not found")
        assert "module not found" in str(exc)

    def test_all_are_funchub_errors(self):
        assert isinstance(ToolNotFoundError("x"), FuncHubError)
        assert isinstance(VersionNotFoundError("x"), FuncHubError)
        assert isinstance(ConflictError("x", "y"), FuncHubError)
        assert isinstance(RegistryError("x"), FuncHubError)
        assert isinstance(NetworkError("x"), FuncHubError)
        assert isinstance(ConfigError("x"), FuncHubError)
        assert isinstance(LoadError("x"), FuncHubError)
