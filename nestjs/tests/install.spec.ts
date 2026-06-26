import nock from 'nock';
import * as path from 'path';
import * as fs from 'fs';

const testDir = path.join(__dirname, '..', '.test-install-' + Date.now());

jest.mock('os', () => {
  const real = jest.requireActual('os');
  return {
    ...real,
    homedir: () => testDir,
    tmpdir: () => testDir,
  };
});

jest.mock('../src/loader', () => ({
  ensureTool: jest.fn().mockResolvedValue('/tmp/fake-cache'),
  loadFunction: jest.fn().mockResolvedValue(jest.fn()),
}));

import { FuncHub } from '../src/client';
import { ToolNotFoundError, VersionNotFoundError } from '../src/exceptions';

const REGISTRY_HOST = 'https://example.com';
const REGISTRY_URL = `${REGISTRY_HOST}/registry.json`;

const sampleRegistry = {
  tools: {
    web_scraper: {
      name: 'web_scraper',
      description: '抓取网页标题',
      parameters: { type: 'object', properties: { url: { type: 'string' } } },
      author: 'test_author',
      entry_point: 'index:main',
      versions: [
        {
          version: '1.0.0',
          source_repo: 'https://github.com/test/web_scraper.git',
          source_ref: 'v1.0.0',
          dependencies: [],
          released_at: '2024-01-01T00:00:00.000Z',
          is_prerelease: false,
        },
        {
          version: '2.1.0',
          source_repo: 'https://github.com/test/web_scraper.git',
          source_ref: 'v2.1.0',
          dependencies: [],
          released_at: '2024-01-01T00:00:00.000Z',
          is_prerelease: false,
        },
      ],
    },
  },
};

beforeEach(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  nock.cleanAll();
});

afterAll(() => {
  nock.cleanAll();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('FuncHub Install', () => {
  let hub: FuncHub;

  beforeEach(() => {
    hub = new FuncHub(REGISTRY_URL);
  });

  test('install throws ToolNotFoundError for missing tool', async () => {
    nock(REGISTRY_HOST).get('/registry.json').reply(200, sampleRegistry);
    await expect(hub.install('nonexistent')).rejects.toThrow(ToolNotFoundError);
  });

  test('install throws VersionNotFoundError for bad constraint', async () => {
    nock(REGISTRY_HOST).get('/registry.json').reply(200, sampleRegistry);
    await expect(hub.install('web_scraper', '^99.0.0')).rejects.toThrow(VersionNotFoundError);
  });

  test('search finds tools by name', async () => {
    nock(REGISTRY_HOST).get('/registry.json').reply(200, sampleRegistry);
    const results = await hub.search('web_scraper');
    expect(results.length).toBeGreaterThan(0);
  });

  test('search finds tools by description', async () => {
    nock(REGISTRY_HOST).get('/registry.json').reply(200, sampleRegistry);
    const results = await hub.search('抓取');
    expect(results.length).toBeGreaterThan(0);
  });

  test('search returns empty for no match', async () => {
    nock(REGISTRY_HOST).get('/registry.json').reply(200, sampleRegistry);
    const results = await hub.search('xyznonexistent');
    expect(results.length).toBe(0);
  });

  test('listInstalled returns empty when cache missing', () => {
    expect(hub.listInstalled()).toEqual([]);
  });

  test('uninstall returns false for missing tool', () => {
    expect(hub.uninstall('nonexistent')).toBe(false);
  });
});
