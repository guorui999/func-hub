# FuncHub

> ⚠️ **Security Warning**: FuncHub dynamically loads and executes code from remote Git repositories. **Only install tools from sources you trust**, and use in isolated environments.

FuncHub is a bilingual (Python + NestJS) tool registry and dynamic loader designed for AI Agents. It allows developers to publish, discover, install, and dynamically invoke tool functions.

## Features

- **Dual SDKs**: Python SDK + NestJS SDK, sharing the same design philosophy
- **Semver version management**: Supports `^1.2.3`, `1.x`, `latest`, branch names, etc.
- **GitHub publishing integration**: Automatic Fork + PR workflow via GitHub API v3
- **Cache management**: `.version` file tracks installed versions; expired cache auto-refetches
- **Private registry support**: Supports custom indexes and mirrors via config
- **Safety confirmation**: Interactive confirmation on install; `--yes` to bypass

---

## Installation

### Python

```bash
pip install funchub
```

### NestJS

```bash
npm install funchub-nestjs
```

---

## Quick Start

### 1. Configure GitHub Token

```bash
# Python
funchub login --token ghp_xxxxxxxxxxxx

# NestJS
npx funchub login --token ghp_xxxxxxxxxxxx
```

### 2. Search for Tools

```bash
funchub search scraper
funchub search web
```

### 3. Install a Tool

```bash
# Install latest version
funchub install web_scraper

# Install with version constraint
funchub install web_scraper@^1.0

# Install development branch
funchub install web_scraper@main
```

### 4. List Installed Tools

```bash
funchub list
```

### 5. Use a Tool in Code

**Python:**
```python
from funchub import FuncHub

hub = FuncHub()
scraper = hub.load("web_scraper")
result = scraper(url="https://example.com")
```

**NestJS:**
```typescript
import { FuncHub } from '@funchub/nestjs';

const hub = new FuncHub();
const scraper = await hub.load('web_scraper');
const result = await scraper({ url: 'https://example.com' });
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `funchub login --token <PAT>` | Save GitHub Personal Access Token |
| `funchub config set <key> <value>` | Set configuration (e.g., custom registry) |
| `funchub publish --version v1.0.0` | Publish current directory as a tool |
| `funchub publish --version v1.0.0 --force` | Overwrite existing tool with same name |
| `funchub publish --version v1.0.0 --dry-run` | Preview without actual submission |
| `funchub search <query>` | Search for tools in the registry |
| `funchub install <name>@<constraint>` | Install a tool |
| `funchub list` | List locally installed tools |
| `funchub update <name>` | Update a tool to latest version |
| `funchub update --all` | Update all installed tools |
| `funchub info <name>` | Show tool details |
| `funchub uninstall <name>` | Remove local tool cache |

---

## Publishing a Tool

1. Create a `funchub.json` or `funchub.yaml` tool definition file in your project root:

```json
{
  "name": "my_tool",
  "description": "My awesome tool",
  "version": "1.0.0",
  "entry_point": "src/index:handler",
  "parameters": {
    "type": "object",
    "properties": {
      "input": { "type": "string" }
    }
  }
}
```

2. Publish:

```bash
funchub publish --version v1.0.0
```

If you have write access to the registry repo, the tool is committed directly. Otherwise, a Fork + PR is automatically created.

---

## Decorator Usage (Python)

```python
from funchub import funchub_tool

@funchub_tool(
    name="web_scraper",
    description="Scrape web page title",
    version="1.0.0"
)
def scrape_url(url: str) -> str:
    """Scrape the title from a URL."""
    import requests
    from bs4 import BeautifulSoup
    resp = requests.get(url)
    soup = BeautifulSoup(resp.text, 'html.parser')
    return soup.title.string if soup.title else "No title found"
```

---

## License

Apache License 2.0
