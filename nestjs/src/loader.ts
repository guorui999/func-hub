import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execa } from 'execa';
import { LoadError, NetworkError } from './exceptions';
import { ToolDefinition, ToolVersion } from './models';

const CACHE_BASE = path.join(os.homedir(), '.funchub', 'cache');

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gitRetry(
  args: string[],
  cwd?: string,
  maxRetries: number = 3,
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await execa('git', args, { cwd, timeout: 120_000 });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  throw new NetworkError(lastError?.message || 'Git operation failed', maxRetries);
}

export function ensureTool(
  toolDef: ToolDefinition,
  targetVersionStr: string,
  yes: boolean = false,
): string {
  const versionMeta = toolDef.versions.find((v) => v.version === targetVersionStr);
  if (!versionMeta) {
    throw new LoadError(`版本 ${targetVersionStr} 在工具 ${toolDef.name} 中未找到`);
  }

  const toolCache = path.join(CACHE_BASE, toolDef.name);
  const versionFile = path.join(toolCache, '.version');

  if (fs.existsSync(versionFile)) {
    const cachedVersion = fs.readFileSync(versionFile, 'utf-8').trim();
    if (cachedVersion === targetVersionStr) {
      return toolCache;
    }
  }

  const repoUrl = versionMeta.source_repo;
  console.warn(
    `安全警告: 此工具将从远程仓库 ${repoUrl} 下载并执行代码。
请确保您信任该仓库的作者，并在隔离环境中使用。
若要查看源码，请访问: ${repoUrl}`,
  );

  if (!yes) {
    console.log('继续安装请按 Y，取消请按 N:');
    // In CLI context this is handled by commander with --yes flag
    // For programmatic use, the yes parameter controls this
  }

  const sourceRef = versionMeta.source_ref;

  if (fs.existsSync(toolCache)) {
    gitRetry(['fetch', '--tags', '--depth', '1'], toolCache);
    gitRetry(['checkout', sourceRef], toolCache);
  } else {
    fs.mkdirSync(toolCache, { recursive: true });
    gitRetry([
      'clone', '--depth', '1',
      '--branch', sourceRef,
      versionMeta.source_repo,
      toolCache,
    ]);
  }

  if (versionMeta.dependencies && versionMeta.dependencies.length > 0) {
    gitRetry(['install', ...versionMeta.dependencies], undefined);
  }

  fs.writeFileSync(versionFile, targetVersionStr, 'utf-8');
  const sourceRepoFile = path.join(toolCache, '.source_repo');
  fs.writeFileSync(sourceRepoFile, versionMeta.source_repo, 'utf-8');

  return toolCache;
}

export async function loadFunction(
  toolDef: ToolDefinition,
  targetVersion: string,
  yes: boolean = false,
): Promise<CallableFunction> {
  const toolCache = ensureTool(toolDef, targetVersion, yes);

  const entry = toolDef.entry_point;
  if (!entry.includes(':')) {
    throw new LoadError(`entry_point 格式必须为 'module.sub:func_name'，got: ${entry}`);
  }

  const [modulePath, funcName] = entry.split(':', 2);

  try {
    const mod = await import(path.join(toolCache, modulePath));
    const func = (mod as Record<string, unknown>)[funcName];
    if (typeof func !== 'function') {
      throw new LoadError(`'${modulePath}:${funcName}' 不是可调用对象`);
    }
    return func as CallableFunction;
  } catch (err) {
    throw new LoadError(`无法加载模块 '${modulePath}': ${err}`);
  }
}
