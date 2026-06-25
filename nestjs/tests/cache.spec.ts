import nock from 'nock';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { FuncHub } from '../src/client';

const REGISTRY_URL = 'https://example.com/registry.json';
const testDir = path.join(os.tmpdir(), 'funchub-cache-test-' + Date.now());

beforeEach(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  nock.cleanAll();
});

describe('Cache', () => {
  test('registry cache is written after fetch', async () => {
    const hub = new FuncHub(REGISTRY_URL);
    nock(REGISTRY_URL)
      .get('/')
      .reply(200, { tools: { test_tool: { name: 'test_tool', description: 'test', parameters: {}, author: 'a', entry_point: 'm:f', versions: [] } } });

    await hub.search('test_tool');
    const cacheDir = path.join(os.homedir(), '.funchub');
    const cacheFile = path.join(cacheDir, 'registry_cache.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  test('cached version is read and compared correctly', () => {
    const toolCache = path.join(os.homedir(), '.funchub', 'cache', 'test_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.version'), '1.0.0', 'utf-8');
    const read = fs.readFileSync(path.join(toolCache, '.version'), 'utf-8').trim();
    expect(read).toBe('1.0.0');
  });

  test('source_repo file is written and read', () => {
    const toolCache = path.join(os.homedir(), '.funchub', 'cache', 'test_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.source_repo'), 'https://github.com/test/repo.git', 'utf-8');
    const read = fs.readFileSync(path.join(toolCache, '.source_repo'), 'utf-8').trim();
    expect(read).toBe('https://github.com/test/repo.git');
  });

  test('listInstalled reads version and source_repo files', () => {
    const toolCache = path.join(os.homedir(), '.funchub', 'cache', 'my_installed_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.version'), '2.0.0', 'utf-8');
    fs.writeFileSync(path.join(toolCache, '.source_repo'), 'https://example.com/repo.git', 'utf-8');

    const hub = new FuncHub(REGISTRY_URL);
    const items = hub.listInstalled();
    const found = items.find((i) => i.name === 'my_installed_tool');
    expect(found).toBeDefined();
    expect(found!.version).toBe('2.0.0');
  });

  test('uninstall removes tool cache', () => {
    const toolCache = path.join(os.homedir(), '.funchub', 'cache', 'removable_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.version'), '1.0.0', 'utf-8');

    const hub = new FuncHub(REGISTRY_URL);
    expect(hub.uninstall('removable_tool')).toBe(true);
    expect(fs.existsSync(toolCache)).toBe(false);
  });
});
