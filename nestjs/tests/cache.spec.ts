import nock from 'nock';
import * as path from 'path';
import * as fs from 'fs';

const testDir = path.join(__dirname, '..', '.test-cache-' + Date.now());

jest.mock('os', () => {
  const real = jest.requireActual('os');
  return {
    ...real,
    homedir: () => testDir,
    tmpdir: () => testDir,
  };
});

import { FuncHub } from '../src/client';

const REGISTRY_HOST = 'https://example.com';
const REGISTRY_URL = `${REGISTRY_HOST}/registry.json`;

beforeEach(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Cache', () => {
  test('registry cache is written after fetch', async () => {
    const hub = new FuncHub(REGISTRY_URL);
    nock(REGISTRY_HOST)
      .get('/registry.json')
      .reply(200, { tools: { test_tool: { name: 'test_tool', description: 'test', parameters: {}, author: 'a', entry_point: 'm:f', versions: [] } } });

    await hub.search('test_tool');
    const cacheFile = path.join(testDir, '.funchub', 'registry_cache.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  test('cached version is read and compared correctly', () => {
    const toolCache = path.join(testDir, '.funchub', 'cache', 'test_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.version'), '1.0.0', 'utf-8');
    const read = fs.readFileSync(path.join(toolCache, '.version'), 'utf-8').trim();
    expect(read).toBe('1.0.0');
  });

  test('source_repo file is written and read', () => {
    const toolCache = path.join(testDir, '.funchub', 'cache', 'test_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.source_repo'), 'https://github.com/test/repo.git', 'utf-8');
    const read = fs.readFileSync(path.join(toolCache, '.source_repo'), 'utf-8').trim();
    expect(read).toBe('https://github.com/test/repo.git');
  });

  test('listInstalled reads version and source_repo files', () => {
    const toolCache = path.join(testDir, '.funchub', 'cache', 'my_installed_tool');
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
    const toolCache = path.join(testDir, '.funchub', 'cache', 'removable_tool');
    fs.mkdirSync(toolCache, { recursive: true });
    fs.writeFileSync(path.join(toolCache, '.version'), '1.0.0', 'utf-8');

    const hub = new FuncHub(REGISTRY_URL);
    expect(hub.uninstall('removable_tool')).toBe(true);
    expect(fs.existsSync(toolCache)).toBe(false);
  });
});
