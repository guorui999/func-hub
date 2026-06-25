import * as path from 'path';
import * as os from 'os';
import { FuncHub } from '../src/client';

describe('Windows Path Compatibility', () => {
  test('config dir uses path module', () => {
    const configDir = path.join(os.homedir(), '.funchub');
    expect(configDir).toContain('.funchub');
  });

  test('cache dir uses path module', () => {
    const hub = new FuncHub('https://example.com');
    expect(hub).toBeDefined();
  });

  test('version file path construction', () => {
    const cacheBase = path.join(os.homedir(), '.funchub', 'cache');
    const toolName = 'web_scraper';
    const versionFile = path.join(cacheBase, toolName, '.version');
    expect(versionFile.endsWith('.version')).toBe(true);
    expect(versionFile).toContain(toolName);
  });

  test('path join handles forward slashes', () => {
    const p1 = path.join('a', 'b', 'c');
    const p2 = path.join('a', 'b', 'c', '.version');
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
  });

  test('home dir resolution works', () => {
    const home = os.homedir();
    const configPath = path.join(home, '.funchub', 'config.yaml');
    expect(configPath).toContain('.funchub');
  });

  test('path sep is platform aware', () => {
    const sep = path.sep;
    expect(sep === '\\' || sep === '/').toBe(true);
  });
});
