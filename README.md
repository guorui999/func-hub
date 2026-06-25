# FuncHub

> ⚠️ **安全警告**: FuncHub 动态加载并执行远程 Git 仓库中的代码。**请确保您信任每个工具的来源**，并在隔离环境中使用。

FuncHub 是一个双语言（Python + NestJS）工具注册表与动态加载器，专为 AI Agent 设计。它允许开发者发布、发现、安装和动态调用工具函数。

## 特性

- **双语言支持**: Python SDK + NestJS SDK，共享相同的设计理念
- **Semver 版本管理**: 支持 `^1.2.3`、`1.x`、`latest`、分支名等约束
- **GitHub 发布集成**: 自动 Fork + PR 发布流程（GitHub API v3）
- **缓存管理**: `.version` 文件追踪已安装版本
- **私有化部署**: 支持私有索引与镜像
- **安全确认**: 安装时交互式确认，`--yes` 跳过

## 快速开始

### Python

```bash
cd python
pip install -e ".[dev]"
funchub login --token ghp_xxxxx
funchub search scraper
funchub install web_scraper@^1.0
funchub list
```

### NestJS

```bash
cd nestjs
npm install
npx funchub login --token ghp_xxxxx
npx funchub search scraper
npx funchub install web_scraper@^1.0
npx funchub list
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `funchub login --token <PAT>` | 配置 GitHub PAT |
| `funchub config set <key> <value>` | 设置配置项 |
| `funchub publish --version v1.0.0` | 发布当前目录工具 |
| `funchub publish --version v1.0.0 --force` | 覆盖同名工具 |
| `funchub publish --version v1.0.0 --dry-run` | 预览不实际提交 |
| `funchub search <query>` | 搜索工具 |
| `funchub install <name>@<constraint>` | 安装工具 |
| `funchub install <name>@main` | 安装开发分支 |
| `funchub list` | 列出本地已安装工具 |
| `funchub update <name>` | 更新到最新版本 |
| `funchub update --all` | 更新所有工具 |
| `funchub info <name>` | 查看工具详情 |
| `funchub uninstall <name>` | 删除本地缓存 |

## 项目结构

```
funchub/
├── LICENSE
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── .github/workflows/
│   ├── ci.yml         # 并行跑 Python + Node 测试
│   └── publish.yml    # 打 Tag 时自动发布 PyPI + NPM
├── python/            # Python SDK
│   ├── funchub/       # 核心包
│   ├── tests/         # 测试（覆盖率 ≥ 85%）
│   └── pyproject.toml
└── nestjs/            # NestJS SDK
    ├── src/           # 核心源码
    ├── tests/         # 测试（覆盖率 ≥ 85%）
    └── package.json
```

## 许可

Apache License 2.0
