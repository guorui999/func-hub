# FuncHub

> ⚠️ **Security Warning**: FuncHub dynamically loads and executes code from remote Git repositories. **Ensure you trust every tool source** and use in isolated environments.

FuncHub is a dual-language (Python + NestJS) tool registry and dynamic loader designed for AI Agents. It allows developers to publish, discover, install, and dynamically invoke tool functions.

FuncHub 是一个双语言（Python + NestJS）工具注册表与动态加载器，专为 AI Agent 设计。它允许开发者发布、发现、安装和动态调用工具函数。

## Installation / 安装

### Python SDK

```bash
pip install funchub-sdk
```

Import / 导入:

```python
from funchub import funchub_tool

@funchub_tool
def my_tool(name: str) -> str:
    return f"Hello, {name}!"
```

### NestJS SDK

```bash
npm install funchub-nestjs
```

Usage / 使用:

```typescript
import { FunchubModule } from 'funchub-nestjs';
```

## Quick Start / 快速开始

### Python

```bash
# Login with your GitHub PAT
funchub login --token ghp_xxxxx

# Search tools in the registry
funchub search scraper

# Install a tool
funchub install web_scraper@^1.0

# List installed tools
funchub list

# Publish a tool (from a directory with funchub-tool.yaml)
cd my-tool/
funchub publish --version 1.0.0
```

### NestJS

```bash
funchub login --token ghp_xxxxx
funchub search scraper
funchub install web_scraper@^1.0
funchub list
```

## Configuration / 配置

| Config Key | Description | Default |
|-----------|-------------|---------|
| `registry_repo` | Registry repository (org/repo) | `funchub-registry/registry` |

```bash
# Custom registry repo
funchub config set registry_repo my-org/my-registry
# Or via environment variable
set FUNCHUB_REGISTRY_REPO=my-org/my-registry
```

## Commands / 命令参考

| Command | Description |
|---------|-------------|
| `funchub login --token <PAT>` | Configure GitHub PAT |
| `funchub config set <key> <value>` | Set config option |
| `funchub publish --version v1.0.0` | Publish tool from current directory |
| `funchub publish --version v1.0.0 --force` | Overwrite existing tool |
| `funchub publish --version v1.0.0 --dry-run` | Preview without committing |
| `funchub search <query>` | Search tools in registry |
| `funchub install <name>@<constraint>` | Install a tool |
| `funchub install <name>@main` | Install from a branch |
| `funchub list` | List installed tools |
| `funchub update <name>` | Update to latest version |
| `funchub update --all` | Update all tools |
| `funchub info <name>` | View tool details |
| `funchub uninstall <name>` | Remove local cache |

## Demo Tools / 示例工具

See `demo-tools/` for example tool projects with `funchub-tool.yaml`:

- `demo-tools/python-tool/` — Python tool example
- `demo-tools/nestjs-tool/` — NestJS tool example

## Project Structure / 项目结构

```
funchub/
├── LICENSE
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── .github/workflows/
│   ├── ci.yml           # Parallel Python + Node tests
│   └── publish.yml      # Auto-publish to PyPI + NPM on tags
├── python/              # Python SDK
│   ├── funchub/         # Core package
│   ├── tests/           # Tests (≥ 85% coverage)
│   └── pyproject.toml
├── nestjs/              # NestJS SDK
│   ├── src/             # Source code
│   ├── tests/           # Tests (≥ 85% coverage)
│   └── package.json
└── demo-tools/          # Sample publishable tools
```

## License / 许可

Apache License 2.0
