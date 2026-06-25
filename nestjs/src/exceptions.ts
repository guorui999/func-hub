export class FuncHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FuncHubError';
  }
}

export class ToolNotFoundError extends FuncHubError {
  constructor(public readonly toolName: string) {
    super(`工具 '${toolName}' 未在中央索引中找到`);
    this.name = 'ToolNotFoundError';
  }
}

export class VersionNotFoundError extends FuncHubError {
  constructor(public readonly constraint: string) {
    super(`未找到满足约束 '${constraint}' 的版本`);
    this.name = 'VersionNotFoundError';
  }
}

export class ConflictError extends FuncHubError {
  constructor(
    public readonly toolName: string,
    public readonly author: string,
  ) {
    super(`工具 ${toolName} 已被 ${author} 占用，使用 --force 覆盖`);
    this.name = 'ConflictError';
  }
}

export class RegistryError extends FuncHubError {
  constructor(message: string) {
    super(`注册表错误: ${message}`);
    this.name = 'RegistryError';
  }
}

export class NetworkError extends FuncHubError {
  constructor(message: string, public readonly attempts: number = 3) {
    super(`网络请求失败 (已重试 ${attempts} 次): ${message}`);
    this.name = 'NetworkError';
  }
}

export class ConfigError extends FuncHubError {
  constructor(message: string) {
    super(`配置错误: ${message}`);
    this.name = 'ConfigError';
  }
}

export class LoadError extends FuncHubError {
  constructor(message: string) {
    super(`加载失败: ${message}`);
    this.name = 'LoadError';
  }
}
