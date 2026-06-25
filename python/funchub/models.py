from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolVersion(BaseModel):
    version: str = Field(..., description="语义化版本，如 '2.1.0'")
    source_repo: str = Field(..., description="完整 Git 仓库地址，含协议")
    source_ref: str = Field(..., description="Tag 或分支名，如 'v2.1.0'")
    dependencies: List[str] = Field(default_factory=list)
    released_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    is_prerelease: bool = Field(
        default=False, description="是否为 alpha/beta/rc 版本"
    )


class ToolDefinition(BaseModel):
    name: str = Field(
        ...,
        pattern=r"^[a-z][a-z0-9_\-]{1,50}$",
        description="仅小写字母、数字、下划线、连字符",
    )
    description: str = Field(..., max_length=200)
    parameters: Dict[str, Any] = Field(
        ..., description="标准 OpenAI 格式 JSON Schema"
    )
    author: str
    entry_point: str = Field(
        ..., description="'module.sub:func_name' 格式"
    )
    versions: List[ToolVersion] = Field(default_factory=list)
