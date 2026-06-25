from pathlib import Path
from typing import Any, Dict

import pytest
import yaml

from funchub.models import ToolDefinition, ToolVersion


@pytest.fixture
def sample_tool_def() -> ToolDefinition:
    return ToolDefinition(
        name="web_scraper",
        description="抓取网页标题",
        parameters={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "目标网址"}
            },
            "required": ["url"],
        },
        author="test_author",
        entry_point="index:main",
        versions=[
            ToolVersion(
                version="1.0.0",
                source_repo="https://github.com/test/web_scraper.git",
                source_ref="v1.0.0",
                dependencies=["requests"],
            ),
            ToolVersion(
                version="2.1.0",
                source_repo="https://github.com/test/web_scraper.git",
                source_ref="v2.1.0",
            ),
            ToolVersion(
                version="3.0.0-alpha.1",
                source_repo="https://github.com/test/web_scraper.git",
                source_ref="v3.0.0-alpha.1",
                is_prerelease=True,
            ),
        ],
    )


@pytest.fixture
def sample_registry_data(sample_tool_def: ToolDefinition) -> Dict[str, Any]:
    return {
        "tools": {
            "web_scraper": sample_tool_def.model_dump(),
            "image_resizer": {
                "name": "image_resizer",
                "description": "调整图片尺寸",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"}
                    },
                },
                "author": "other_author",
                "entry_point": "resizer:resize",
                "versions": [
                    {
                        "version": "1.0.0",
                        "source_repo": "https://github.com/other/image_resizer.git",
                        "source_ref": "v1.0.0",
                        "dependencies": ["pillow"],
                        "released_at": "2024-01-01T00:00:00",
                        "is_prerelease": False,
                    }
                ],
            },
        }
    }


@pytest.fixture
def sample_config_yaml(tmp_path: Path) -> Path:
    cfg = {"github_token": "ghp_test_token", "registry": "https://example.com/registry"}
    cfg_path = tmp_path / ".funchub" / "config.yaml"
    cfg_path.parent.mkdir(parents=True)
    cfg_path.write_text(yaml.dump(cfg), encoding="utf-8")
    return cfg_path


@pytest.fixture
def mock_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: home)
    return home
