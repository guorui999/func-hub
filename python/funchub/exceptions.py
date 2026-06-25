class FuncHubError(Exception):
    pass


class ToolNotFoundError(FuncHubError):
    def __init__(self, tool_name: str) -> None:
        super().__init__(f"工具 '{tool_name}' 未在中央索引中找到")
        self.tool_name = tool_name


class VersionNotFoundError(FuncHubError):
    def __init__(self, constraint: str) -> None:
        super().__init__(f"未找到满足约束 '{constraint}' 的版本")
        self.constraint = constraint


class ConflictError(FuncHubError):
    def __init__(self, tool_name: str, author: str) -> None:
        super().__init__(f"工具 {tool_name} 已被 {author} 占用，使用 --force 覆盖")
        self.tool_name = tool_name
        self.author = author


class RegistryError(FuncHubError):
    def __init__(self, message: str) -> None:
        super().__init__(f"注册表错误: {message}")


class NetworkError(FuncHubError):
    def __init__(self, message: str, attempts: int = 3) -> None:
        super().__init__(f"网络请求失败 (已重试 {attempts} 次): {message}")
        self.attempts = attempts


class ConfigError(FuncHubError):
    def __init__(self, message: str) -> None:
        super().__init__(f"配置错误: {message}")


class LoadError(FuncHubError):
    def __init__(self, message: str) -> None:
        super().__init__(f"加载失败: {message}")
