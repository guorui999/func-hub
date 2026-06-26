import inspect
from typing import Any, Callable, Dict, List, Optional, Type, get_type_hints

from funchub.models import ToolDefinition, ToolVersion

_TYPE_MAP: Dict[type, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
    type(None): "null",
}


def _py_type_to_json_type(py_type: Type) -> str:
    return _TYPE_MAP.get(py_type, "string")


def _infer_parameters(func: Callable) -> Dict[str, Any]:
    sig = inspect.signature(func)
    hints = get_type_hints(func)
    properties: Dict[str, Dict[str, Any]] = {}
    required: List[str] = []

    for name, param in sig.parameters.items():
        if name in ("self", "cls"):
            continue
        param_type = hints.get(name, str)
        json_type = _py_type_to_json_type(param_type)
        prop: Dict[str, Any] = {"type": json_type}

        if param.default is not inspect.Parameter.empty:
            prop["default"] = param.default
            default_str = str(param.default)
            if json_type == "string":
                prop["description"] = f"Default: {default_str}"
        else:
            required.append(name)

        properties[name] = prop

    schema: Dict[str, Any] = {
        "type": "object",
        "properties": properties,
    }
    if required:
        schema["required"] = required
    return schema


def tool(
    name: Optional[str] = None,
    description: Optional[str] = None,
    author: str = "anonymous",
    version: str = "1.0.0",
    source_repo: str = "",
    source_ref: str = "",
    dependencies: Optional[List[str]] = None,
):
    def decorator(func: Callable) -> Callable:


        tool_name = name or func.__name__
        tool_desc = description or (func.__doc__ or "").strip() or tool_name
        parameters = _infer_parameters(func)
        tool_version = ToolVersion(
            version=version,
            source_repo=source_repo,
            source_ref=source_ref,
            dependencies=dependencies or [],
            is_prerelease="alpha" in version or "beta" in version or "rc" in version,
        )
        tool_def = ToolDefinition(
            name=tool_name,
            description=tool_desc,
            parameters=parameters,
            author=author,
            entry_point=f"{func.__module__}:{func.__name__}",
            versions=[tool_version],
        )
        func.__funchub_tool__ = tool_def
        return func

    return decorator


funchub_tool = tool
