import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const CACHE_BASE = path.join(os.homedir(), '.funchub', 'cache');
const REGISTRY_CACHE_PATH = path.join(os.homedir(), '.funchub', 'registry_cache.json');

jest.mock('node-fetch');
import fetch from 'node-fetch';
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

import { FuncHub } from '../src/client';
import { ToolNotFoundError, VersionNotFoundError, FuncHubError } from '../src/exceptions';
import { ToolDefinition } from '../src/models';

const mockRegistry: Record<string, ToolDefinition> = {
  greeter: {
    name: 'greeter',
    description: 'A greeting tool',
    entry_point: 'greeter:sayHello',
    author: 'test_author',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    versions: [
      { version: '1.0.0', source_repo: 'https://github.com/test/greeter.git', source_ref: 'v1.0.0', dependencies: [], released_at: '2026-01-01', is_prerelease: false },
      { version: '2.0.0', source_repo: 'https://github.com/test/greeter.git', source_ref: 'v2.0.0', dependencies: [], released_at: '2026-06-01', is_prerelease: false },
    ],
  },
  scraper: {
    name: 'scraper',
    description: 'Web scraper utility', 
    entry_point: 'scraper:scrape',
    author: 'test_author',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    versions: [
      { version: '0.1.0', source_repo: 'https://github.com/test/scraper.git', source_ref: 'v0.1.0', dependencies: [], released_at: '2025-01-01', is_prerelease: false },
    ],
  },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ now: Date.now() });
  // Clean up any test cache files
  if (fs.existsSync(REGISTRY_CACHE_PATH)) {
    fs.unlinkSync(REGISTRY_CACHE_PATH);
  }
});

afterEach(() => {
  jest.useRealTimers();
});

function mockRegistryResponse(data: Record<string, unknown>, status = 200): void {
  (mockFetch as unknown as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  });
}

describe('FuncHub - search', () => {
  it('finds tools by name', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const results = await hub.search('greet');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('greeter');
  });

  it('finds tools by description', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const results = await hub.search('scraper');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('scraper');
  });

  it('returns empty array for no match', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const results = await hub.search('nonexistent');
    expect(results).toHaveLength(0);
  });
});

describe('FuncHub - getTool / info', () => {
  it('returns tool by name', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const tool = await hub.getTool('greeter');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('greeter');
  });

  it('returns undefined for unknown tool', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const tool = await hub.getTool('missing');
    expect(tool).toBeUndefined();
  });

  it('info delegates to getTool', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const t = await hub.info('greeter');
    expect(t).toBeDefined();
    expect(t!.name).toBe('greeter');
  });
});

describe('FuncHub - install', () => {
  it('throws ToolNotFoundError for missing tool', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    await expect(hub.install('nonexistent')).rejects.toThrow(ToolNotFoundError);
  });

  it('throws VersionNotFoundError for missing version', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    await expect(hub.install('greeter', '99.0.0')).rejects.toThrow(VersionNotFoundError);
  });

  it('returns cached function when already installed with same version', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const cacheDir = path.join(CACHE_BASE, 'greeter');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, '.version'), '1.0.0', 'utf-8');

    const cachedFunc = jest.fn();
    (hub as any).funcs.set('greeter', cachedFunc);

    const result = await hub.install('greeter', '1.0.0');
    expect(result).toBe(cachedFunc);
  });
});

describe('FuncHub - publish', () => {
  it('throws error when no token configured', async () => {
    jest.isolateModules(async () => {
      jest.doMock('../src/github.client', () => ({
        ...jest.requireActual('../src/github.client'),
        resolveToken: () => undefined,
      }));
      const { FuncHub: FH } = await import('../src/client');
      const hub = new FH();
      await expect(hub.publish(mockRegistry.greeter)).rejects.toThrow(FuncHubError);
    });
  });
});

describe('FuncHub - listInstalled', () => {
  it('returns empty array when no cache', () => {
    // Ensure cache dir doesn't exist
    if (fs.existsSync(CACHE_BASE)) {
      fs.rmSync(CACHE_BASE, { recursive: true, force: true });
    }
    const hub = new FuncHub();
    const list = hub.listInstalled();
    expect(list).toEqual([]);
  });

  it('returns installed tools', () => {
    const toolDir = path.join(CACHE_BASE, 'my_tool');
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(path.join(toolDir, '.version'), '1.0.0', 'utf-8');
    fs.writeFileSync(path.join(toolDir, '.source_repo'), 'https://github.com/user/repo.git', 'utf-8');

    const hub = new FuncHub();
    const list = hub.listInstalled();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('my_tool');
    expect(list[0].version).toBe('1.0.0');
    expect(list[0].source_repo).toBe('https://github.com/user/repo.git');

    // Cleanup
    fs.rmSync(path.join(CACHE_BASE, 'my_tool'), { recursive: true, force: true });
  });
});

describe('FuncHub - update', () => {
  it('throws ToolNotFoundError for unknown tool', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    await expect(hub.update('nonexistent')).rejects.toThrow(ToolNotFoundError);
  });

  it('returns current version when already latest', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();

    // Create cache with latest version
    const toolDir = path.join(CACHE_BASE, 'greeter');
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(path.join(toolDir, '.version'), '2.0.0', 'utf-8');

    const result = await hub.update('greeter');
    expect(result).toBe('2.0.0');
    fs.rmSync(toolDir, { recursive: true, force: true });
  });
});

describe('FuncHub - updateAll', () => {
  it('updates all installed tools', async () => {
    mockRegistryResponse({ tools: mockRegistry });
    const hub = new FuncHub();
    const result = await hub.updateAll();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('FuncHub - uninstall', () => {
  it('returns true and removes cache', () => {
    const toolDir = path.join(CACHE_BASE, 'removable');
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(path.join(toolDir, '.version'), '1.0.0', 'utf-8');

    const hub = new FuncHub();
    expect(hub.uninstall('removable')).toBe(true);
    expect(fs.existsSync(toolDir)).toBe(false);
  });

  it('returns false for non-installed tool', () => {
    const hub = new FuncHub();
    expect(hub.uninstall('not_installed')).toBe(false);
  });
});

describe('FuncHub - registry caching', () => {
  it('reads from cache when within TTL', async () => {
    // Pre-populate cache
    const cacheDir = path.dirname(REGISTRY_CACHE_PATH);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const cacheData = { _cached_at: Date.now(), tools: mockRegistry };
    fs.writeFileSync(REGISTRY_CACHE_PATH, JSON.stringify(cacheData), 'utf-8');

    const hub = new FuncHub();
    const results = await hub.search('greet');
    expect(results).toHaveLength(1);
    // Should NOT call fetch since cache is valid
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
