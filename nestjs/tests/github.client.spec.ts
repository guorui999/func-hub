import nock from 'nock';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GitHubRegistryClient, loadConfig, saveConfig, resolveRegistry, resolveToken } from '../src/github.client';
import { ConflictError } from '../src/exceptions';
import { ToolDefinition } from '../src/models';

const API = 'https://api.github.com';

function makeToolDef(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: 'test_tool',
    description: 'A test tool',
    parameters: { type: 'object', properties: { url: { type: 'string' } } },
    author: 'test_author',
    entry_point: 'index:main',
    versions: [
      {
        version: '1.0.0',
        source_repo: 'https://github.com/test/repo.git',
        source_ref: 'v1.0.0',
        dependencies: [],
        released_at: '2024-01-01T00:00:00.000Z',
        is_prerelease: false,
      },
    ],
    ...overrides,
  };
}

describe('GitHubRegistryClient', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  describe('config', () => {
    const testDir = path.join(os.tmpdir(), 'funchub-test-' + Date.now());

    beforeEach(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('loadConfig returns empty for missing file', () => {
      const cfg = loadConfig();
      expect(cfg).toBeDefined();
    });

    test('saveConfig and loadConfig round-trip', () => {
      const cfgPath = path.join(testDir, 'config.yaml');
      process.env.HOME = testDir;
      const cfg = { github_token: 'ghp_test', registry: 'https://example.com' };
      saveConfig(cfg);
      const loaded = loadConfig();
      expect(loaded.github_token).toBe('ghp_test');
    });

    test('resolveRegistry uses cli arg first', () => {
      expect(resolveRegistry('https://cli.example.com')).toBe('https://cli.example.com');
    });
  });

  describe('client', () => {
    let client: GitHubRegistryClient;

    beforeEach(() => {
      client = new GitHubRegistryClient('ghp_test_token');
    });

    test('checkWritePermission returns true when push permission exists', async () => {
      nock(API).get('/repos/funchub-registry/registry').reply(200, {
        permissions: { push: true },
      });
      const result = await client.checkWritePermission();
      expect(result).toBe(true);
    });

    test('checkWritePermission returns false without push permission', async () => {
      nock(API).get('/repos/funchub-registry/registry').reply(200, {
        permissions: { push: false },
      });
      const result = await client.checkWritePermission();
      expect(result).toBe(false);
    });

    test('forkRepository succeeds', async () => {
      nock(API).post('/repos/funchub-registry/registry/forks').reply(202, {
        full_name: 'test_user/registry',
      });
      const result = await client.forkRepository();
      expect(result.full_name).toBe('test_user/registry');
    });

    test('publishTool without write permission forks and creates PR', async () => {
      nock(API).get('/repos/funchub-registry/registry').reply(200, {
        permissions: { push: false },
      });
      nock(API).post('/repos/funchub-registry/registry/forks').reply(202, {
        full_name: 'test_user/registry',
      });
      nock(API).get('/repos/test_user/registry/contents/tools/test_tool.json').reply(404);
      nock(API).get('/user').reply(200, { login: 'test_user' });
      nock(API).get('/repos/test_user/registry/git/refs/heads/main').reply(200, {
        object: { sha: 'base_sha' },
      });
      nock(API).post('/repos/test_user/registry/git/refs').reply(201, {});
      nock(API).put('/repos/test_user/registry/contents/tools/test_tool.json').reply(201, {});
      nock(API).post('/repos/funchub-registry/registry/pulls').reply(201, {
        html_url: 'https://github.com/funchub-registry/registry/pull/42',
      });

      const result = await client.publishTool(makeToolDef());
      expect(result).toContain('pull/42');
    });

    test('publishTool with write permission commits directly', async () => {
      nock(API).get('/repos/funchub-registry/registry').reply(200, {
        permissions: { push: true },
      });
      nock(API).get('/repos/funchub-registry/registry/contents/tools/test_tool.json').reply(404);
      nock(API).get('/repos/funchub-registry/registry/git/refs/heads/main').reply(200, {
        object: { sha: 'base_sha' },
      });
      nock(API).post('/repos/funchub-registry/registry/git/refs').reply(201, {});
      nock(API).put('/repos/funchub-registry/registry/contents/tools/test_tool.json').reply(201, {});

      const result = await client.publishTool(makeToolDef());
      expect(result).toContain('funchub-registry/registry');
    });

    test('publishTool with conflict raises ConflictError', async () => {
      const content = Buffer.from(
        JSON.stringify({ name: 'test_tool', author: 'other_user' }),
      ).toString('base64');

      nock(API).get('/repos/funchub-registry/registry').reply(200, {
        permissions: { push: true },
      });
      nock(API)
        .get('/repos/funchub-registry/registry/contents/tools/test_tool.json')
        .reply(200, { content, sha: 'abc' });

      await expect(client.publishTool(makeToolDef())).rejects.toThrow(ConflictError);
    });

    test('publishTool dry run returns preview message', async () => {
      const result = await client.publishTool(makeToolDef(), false, true);
      expect(result).toContain('[DRY RUN]');
    });
  });
});
