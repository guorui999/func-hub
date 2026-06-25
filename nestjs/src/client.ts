import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import fetch from 'node-fetch';
import {
  GitHubRegistryClient,
  resolveRegistry,
  resolveToken,
} from './github.client';
import { resolveVersion } from './version.parser';
import { ensureTool } from './loader';
import {
  ToolNotFoundError,
  VersionNotFoundError,
  FuncHubError,
} from './exceptions';
import {
  ToolDefinition,
  InstalledTool,
  RegistryCache,
} from './models';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryFetch(
  url: string,
  maxRetries: number = 3,
): Promise<ReturnType<typeof fetch>> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { timeout: 30000 });
      if (resp.status >= 500) {
        lastError = new Error(`HTTP ${resp.status}`);
        if (attempt < maxRetries - 1) await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  throw new FuncHubError(`网络请求失败: ${lastError?.message}`);
}

const CACHE_BASE = path.join(os.homedir(), '.funchub', 'cache');
const REGISTRY_CACHE_PATH = path.join(os.homedir(), '.funchub', 'registry_cache.json');

export class FuncHub {
  private registryUrl: string;
  private token?: string;
  private funcs: Map<string, CallableFunction> = new Map();

  constructor(registry?: string, token?: string) {
    this.registryUrl = resolveRegistry(registry);
    this.token = resolveToken(token);
  }

  private async fetchRegistry(useCache: boolean = true): Promise<Record<string, ToolDefinition>> {
    const now = Date.now();

    if (useCache && fs.existsSync(REGISTRY_CACHE_PATH)) {
      try {
        const raw = fs.readFileSync(REGISTRY_CACHE_PATH, 'utf-8');
        const cached: RegistryCache = JSON.parse(raw);
        if (now - cached._cached_at < 300_000) {
          return cached.tools;
        }
      } catch {
        // ignore invalid cache
      }
    }

    const resp = await retryFetch(this.registryUrl);
    if (!resp.ok) {
      throw new FuncHubError(`获取注册表失败: HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as Record<string, unknown>;
    const toolsRaw: Record<string, unknown> = (
      (data.tools as Record<string, unknown>) || data
    );

    const tools: Record<string, ToolDefinition> = {};
    for (const [key, val] of Object.entries(toolsRaw)) {
      if (typeof val === 'object' && val !== null) {
        tools[key] = val as ToolDefinition;
      }
    }

    const cacheData: RegistryCache = { _cached_at: now, tools };
    const cacheDir = path.dirname(REGISTRY_CACHE_PATH);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_CACHE_PATH, JSON.stringify(cacheData, null, 2), 'utf-8');

    return tools;
  }

  async search(query: string): Promise<ToolDefinition[]> {
    const registry = await this.fetchRegistry();
    const q = query.toLowerCase();
    return Object.values(registry).filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }

  async getTool(name: string): Promise<ToolDefinition | undefined> {
    const registry = await this.fetchRegistry();
    return registry[name];
  }

  async install(
    toolName: string,
    constraint?: string,
    includePrerelease: boolean = false,
    yes: boolean = false,
  ): Promise<CallableFunction> {
    const registry = await this.fetchRegistry();
    const toolDef = registry[toolName];
    if (!toolDef) {
      throw new ToolNotFoundError(toolName);
    }

    const available = toolDef.versions.map((v) => v.version);
    const targetVersion = resolveVersion(available, constraint || 'latest', includePrerelease);
    if (!targetVersion) {
      throw new VersionNotFoundError(constraint || 'latest');
    }

    const toolCache = path.join(CACHE_BASE, toolName);
    const versionFile = path.join(toolCache, '.version');

    if (fs.existsSync(versionFile)) {
      const cachedVersion = fs.readFileSync(versionFile, 'utf-8').trim();
      if (cachedVersion === targetVersion) {
        const cached = this.funcs.get(toolName);
        if (cached) return cached;
      }
    }

    const toolCacheResult = ensureTool(toolDef, targetVersion, yes);
    const entry = toolDef.entry_point;
    const func = await import(path.join(toolCacheResult, entry));
    this.funcs.set(toolName, func as unknown as CallableFunction);
    return func as unknown as CallableFunction;
  }

  async publish(
    toolDef: ToolDefinition,
    force: boolean = false,
    dryRun: boolean = false,
  ): Promise<string> {
    if (!this.token) {
      throw new FuncHubError('请先运行 funchub login 配置 GitHub Token');
    }
    const client = new GitHubRegistryClient(this.token);
    return client.publishTool(toolDef, force, dryRun);
  }

  listInstalled(): InstalledTool[] {
    if (!fs.existsSync(CACHE_BASE)) return [];
    const result: InstalledTool[] = [];
    const entries = fs.readdirSync(CACHE_BASE, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const versionFile = path.join(CACHE_BASE, entry.name, '.version');
        const sourceFile = path.join(CACHE_BASE, entry.name, '.source_repo');
        let version = '';
        let source = '';
        if (fs.existsSync(versionFile)) {
          version = fs.readFileSync(versionFile, 'utf-8').trim();
        }
        if (fs.existsSync(sourceFile)) {
          source = fs.readFileSync(sourceFile, 'utf-8').trim();
        }
        result.push({ name: entry.name, version, source_repo: source });
      }
    }
    return result;
  }

  async update(
    toolName: string,
    includePrerelease: boolean = false,
    yes: boolean = false,
  ): Promise<string | undefined> {
    const registry = await this.fetchRegistry();
    const toolDef = registry[toolName];
    if (!toolDef) {
      throw new ToolNotFoundError(toolName);
    }

    const available = toolDef.versions.map((v) => v.version);
    const latest = resolveVersion(available, 'latest', includePrerelease);
    if (!latest) {
      throw new VersionNotFoundError('latest');
    }

    const toolCache = path.join(CACHE_BASE, toolName);
    const versionFile = path.join(toolCache, '.version');

    if (fs.existsSync(versionFile)) {
      const current = fs.readFileSync(versionFile, 'utf-8').trim();
      if (current === latest) return current;
    }

    await this.install(toolName, latest, includePrerelease, yes);
    return latest;
  }

  async updateAll(
    includePrerelease: boolean = false,
    yes: boolean = false,
  ): Promise<string[]> {
    const updated: string[] = [];
    const installed = this.listInstalled();
    for (const item of installed) {
      try {
        const newVer = await this.update(item.name, includePrerelease, yes);
        if (newVer) {
          updated.push(`${item.name}: ${item.version} -> ${newVer}`);
        }
      } catch {
        // skip failed updates
      }
    }
    return updated;
  }

  async info(toolName: string): Promise<ToolDefinition | undefined> {
    return this.getTool(toolName);
  }

  uninstall(toolName: string): boolean {
    const toolCache = path.join(CACHE_BASE, toolName);
    if (fs.existsSync(toolCache)) {
      fs.rmSync(toolCache, { recursive: true, force: true });
      this.funcs.delete(toolName);
      return true;
    }
    return false;
  }
}
