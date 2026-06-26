# funchub-nestjs

NestJS SDK for FuncHub (`funchub-sdk` for Python) - A tool registry and dynamic loader for AI Agents.

## Installation

```bash
npm install funchub-nestjs
```

## Usage

```typescript
import { FuncHub } from '@funchub/nestjs';

const hub = new FuncHub();

// Search for tools
const results = await hub.search('scraper');

// Install a tool
await hub.install('web_scraper@^1.0');

// Load and use a tool
const scraper = await hub.load('web_scraper');
const result = await scraper({ url: 'https://example.com' });
```

For full documentation, see [FuncHub on GitHub](https://github.com/guorui999/func-hub).
