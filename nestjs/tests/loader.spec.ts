import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const CACHE_BASE = path.join(os.homedir(), '.funchub', 'cache');

jest.mock('execa');
import execa = require('execa');
const mockExeca = execa as jest.MockedFunction<typeof execa>;

import { ensureTool, loadFunction } from '../src/loader';
import { LoadError, NetworkError } from '../src/exceptions';
import { ToolDefinition } from '../src/models';

function makeToolDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'test_tool',
    description: 'A test tool',
    entry_point: 'index:handler',
    author: 'test_author',
    parameters: {},
    versions: [
      { version: '1.0.0', source_repo: 'https://github.com/test/repo.git', source_ref: 'v1.0.0', dependencies: [], released_at: '2026-01-01', is_prerelease: false },
      { version: '2.0.0', source_repo: 'https://github.com/test/repo.git', source_ref: 'v2.0.0', dependencies: [], released_at: '2026-06-01', is_prerelease: false },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

async function cleanupCache(): Promise<void> {
  const dir = path.join(CACHE_BASE, 'test_tool');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('ensureTool', () => {
  afterEach(async () => {
    await cleanupCache();
  });

  it('returns cached directory when version matches', async () => {
    const cacheDir = path.join(CACHE_BASE, 'test_tool');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, '.version'), '1.0.0', 'utf-8');

    const result = await ensureTool(makeToolDef(), '1.0.0');
    expect(result).toBe(cacheDir);
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('clones tool when not cached', async () => {
    mockExeca.mockResolvedValue({} as any);
    const result = await ensureTool(makeToolDef(), '1.0.0');
    const cacheDir = path.join(CACHE_BASE, 'test_tool');
    expect(result).toBe(cacheDir);
    expect(mockExeca).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth', '1', '--branch', 'v1.0.0', 'https://github.com/test/repo.git', cacheDir],
      { cwd: undefined, timeout: 120000 },
    );
  });

  it('fetches and checks out when cache dir exists but wrong version', async () => {
    const cacheDir = path.join(CACHE_BASE, 'test_tool');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, '.version'), '1.0.0', 'utf-8');
    mockExeca.mockResolvedValue({} as any);

    await ensureTool(makeToolDef(), '2.0.0');

    expect(mockExeca).toHaveBeenCalledWith(
      'git', ['fetch', '--tags', '--depth', '1'], { cwd: cacheDir, timeout: 120000 },
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'git', ['checkout', 'v2.0.0'], { cwd: cacheDir, timeout: 120000 },
    );
  });

  it('writes .version and .source_repo files after clone', async () => {
    mockExeca.mockResolvedValue({} as any);
    const cacheDir = path.join(CACHE_BASE, 'test_tool');

    await ensureTool(makeToolDef(), '1.0.0');

    expect(fs.readFileSync(path.join(cacheDir, '.version'), 'utf-8').trim()).toBe('1.0.0');
    expect(fs.readFileSync(path.join(cacheDir, '.source_repo'), 'utf-8').trim()).toBe('https://github.com/test/repo.git');
  });

  it('throws LoadError for unknown version', async () => {
    await expect(ensureTool(makeToolDef(), '99.0.0')).rejects.toThrow(LoadError);
  });

  it('retries git operations on failure', async () => {
    mockExeca
      .mockRejectedValueOnce(new Error('first fail'))
      .mockRejectedValueOnce(new Error('second fail'))
      .mockResolvedValueOnce({} as any);

    const result = await ensureTool(makeToolDef(), '1.0.0');
    expect(result).toBe(path.join(CACHE_BASE, 'test_tool'));
    expect(mockExeca).toHaveBeenCalledTimes(3);
  });

  it('throws NetworkError when all git retries exhausted', async () => {
    mockExeca.mockRejectedValue(new Error('always fails'));
    await expect(ensureTool(makeToolDef(), '1.0.0')).rejects.toThrow(NetworkError);
  });

  it('installs dependencies when specified', async () => {
    mockExeca.mockResolvedValue({} as any);
    const toolDef = makeToolDef();
    toolDef.versions[0].dependencies = ['lodash'];

    await ensureTool(toolDef, '1.0.0');

    expect(mockExeca).toHaveBeenCalledWith(
      'npm', ['install', 'lodash'], { timeout: 120000 },
    );
  });
});

describe('loadFunction', () => {
  it('loads a function from a valid entry point', async () => {
    mockExeca.mockResolvedValue({} as any);
    const toolDef = makeToolDef({ entry_point: 'index:handler' });
    const mockFunc = jest.fn();
    jest.isolateModules(() => {
      jest.doMock(path.join(CACHE_BASE, 'test_tool', 'index'), () => ({ handler: mockFunc }), { virtual: true });
    });
    // after mocking, require the loader again in a fresh context
    const freshLoader = require('../src/loader');
    const result = await freshLoader.loadFunction(toolDef, '1.0.0');
    expect(result).toBeDefined();
  });

  it('throws LoadError for invalid entry point format', async () => {
    const toolDef = makeToolDef({ entry_point: 'no-colon' });
    await expect(loadFunction(toolDef, '1.0.0')).rejects.toThrow(LoadError);
  });

  it('throws LoadError for non-callable export', async () => {
    mockExeca.mockResolvedValue({} as any);
    const toolDef = makeToolDef({ entry_point: 'index:notAFunction' });
    await expect(loadFunction(toolDef, '1.0.0')).rejects.toThrow(LoadError);
  });
});
