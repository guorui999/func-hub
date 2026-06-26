# FuncHub

> ⚠️ **Security Warning**: FuncHub dynamically loads and executes code from remote Git repositories. **Ensure you trust every tool source** and use in isolated environments.

[![PyPI version](https://img.shields.io/pypi/v/funchub-sdk?color=ea7233&label=PyPI)](https://pypi.org/project/funchub-sdk/)
[![npm version](https://img.shields.io/npm/v/funchub-nestjs?color=ea7233&label=npm)](https://www.npmjs.com/package/funchub-nestjs)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/guorui999/func-hub/ci.yml?branch=master&label=tests)](https://github.com/guorui999/func-hub/actions)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A585%25-brightgreen)](https://github.com/guorui999/func-hub)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Registry UI](https://img.shields.io/badge/registry-web--lightgrey?logo=githubpages)](https://guorui999.github.io/func-hub/)

**FuncHub** is a dual-language (Python + NestJS) open-source tool registry and dynamic loader purpose-built for **AI Agents**. Publish your tools once, discover and invoke them from any agent — regardless of the language they're written in.

FuncHub 是一个双语言（Python + NestJS）开源工具注册表与动态加载器，专为 **AI Agent** 设计。一次发布，随处发现、安装和调用。

---

## Features / 特性

- **🌐 Registry-powered discovery** — Search and install tools from a central registry
- **🔧 Dual-language SDK** — Python (`funchub-sdk`) and NestJS (`funchub-nestjs`)
- **📦 Dynamic loading** — Tools are cloned from Git and loaded at runtime
- **🔌 Language-agnostic tools** — Publish Python tools, use them in NestJS and vice versa
- **🌍 Web UI** — Browse the registry at [func-hub Registry](https://guorui999.github.io/func-hub/)
- **🔄 Versioned** — SemVer with ^, ~, wildcard constraints and prerelease support
- **🔐 GitHub-based auth** — Publish via GitHub PAT, fork-and-PR workflow

---

## Installation / 安装

```bash
# Python SDK
pip install funchub-sdk

# NestJS SDK
npm install funchub-nestjs
```

**Python** — register a tool with a single decorator:

```python
from funchub import funchub_tool

@funchub_tool
def my_tool(name: str) -> str:
    return f"Hello, {name}!"
```

**NestJS** — discover and invoke tools dynamically:

```typescript
import { FuncHub } from 'funchub-nestjs';

const hub = new FuncHub();
await hub.install('web_scraper@^1.0');
```

---

## Quick Start / 快速开始

### 1. Configure GitHub Token

```bash
funchub login --token ghp_xxxxx
```

### 2. Search the Registry

```bash
funchub search scraper
```

### 3. Install and Use

```bash
funchub install web_scraper@^1.0
funchub list    # see installed tools
```

### 4. Publish Your Own Tool

Create a `funchub-tool.yaml` in your project, then:

```bash
funchub publish --version 1.0.0
```

---

## Documentation / 文档

| Topic | Links |
|-------|-------|
| Registry Web UI | [func-hub Registry](https://guorui999.github.io/func-hub/) |
| Python SDK | [PyPI](https://pypi.org/project/funchub-sdk/) |
| NestJS SDK | [npm](https://www.npmjs.com/package/funchub-nestjs) |
| Source Code | [GitHub](https://github.com/guorui999/func-hub) |
| Demo Tools | [`demo-tools/`](demo-tools/) |

### Commands / 命令参考

| Command | Description |
|---------|-------------|
| `funchub login --token <PAT>` | Configure GitHub PAT |
| `funchub config set <key> <value>` | Set config option |
| `funchub search <query>` | Search tools in registry |
| `funchub install <name>@<constraint>` | Install a tool |
| `funchub list` | List installed tools |
| `funchub update <name>` | Update to latest version |
| `funchub update --all` | Update all tools |
| `funchub info <name>` | View tool details |
| `funchub uninstall <name>` | Remove local cache |
| `funchub publish --version v1.0.0` | Publish tool from current directory |

### Configuration / 配置

| Config Key | Description | Default |
|-----------|-------------|---------|
| `registry_repo` | Registry repository (org/repo) | `funchub-registry/registry` |

```bash
funchub config set registry_repo my-org/my-registry
# Or via environment variable
export FUNCHUB_REGISTRY_REPO=my-org/my-registry
```

---

## Use Cases / 应用场景

- **AI Agent tool discovery** — Let your agent discover and load tools at runtime
- **Plugin ecosystems** — Build a plugin system where anyone can publish compatible tools
- **Cross-language tool sharing** — Write tools in Python, use them from TypeScript
- **Internal tool registries** — Host your own registry for private tools

---

## Project Structure / 项目结构

```
funchub/
├── python/              # Python SDK (funchub-sdk)
│   ├── funchub/         # Core package
│   ├── tests/           # 130 tests, 88% coverage
│   └── pyproject.toml
├── nestjs/              # NestJS SDK (funchub-nestjs)
│   ├── src/             # Source code
│   ├── tests/           # 86 tests, 89% coverage
│   └── package.json
├── demo-tools/          # Sample publishable tools
├── registry-web/        # Web UI (deployed to GitHub Pages)
└── .github/workflows/   # CI + publish pipelines
```

---

## Security / 安全

FuncHub dynamically loads code from remote Git repositories. Treat every tool source with the same caution as any third-party dependency:

- **Review source code** before installing
- **Use isolated environments** (containers, VMs)
- **Pin versions** to avoid unexpected updates

---

## License / 许可

Apache License 2.0
