import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import fetch from 'node-fetch';
import { ConflictError, FuncHubError, NetworkError } from './exceptions';
import { ToolDefinition } from './models';

const CONFIG_DIR = path.join(os.homedir(), '.funchub');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');

export interface Config {
  github_token?: string;
  registry?: string;
  registry_repo?: string;
}

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return yaml.load(raw) as Config;
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveConfig(cfg: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, yaml.dump(cfg), 'utf-8');
}

export function resolveRegistryRepo(cliRepo?: string): string {
  if (cliRepo) return cliRepo;
  const cfg = loadConfig();
  if (cfg.registry_repo) return cfg.registry_repo;
  return 'funchub-registry/registry';
}

export function resolveRegistry(cliRegistry?: string): string {
  if (cliRegistry) return cliRegistry;
  if (process.env.FUNCHUB_REGISTRY) return process.env.FUNCHUB_REGISTRY;
  const cfg = loadConfig();
  if (cfg.registry) return cfg.registry;
  return 'https://raw.githubusercontent.com/funchub-registry/registry/main/registry.json';
}

export function resolveToken(cliToken?: string): string | undefined {
  if (cliToken) return cliToken;
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }
  const cfg = loadConfig();
  return cfg.github_token;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryRequest(
  url: string,
  options: Record<string, unknown> = {},
  maxRetries: number = 3,
): Promise<ReturnType<typeof fetch>> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers as Record<string, string>),
          'Accept': 'application/vnd.github.v3+json',
        },
        timeout: 30000,
      } as Record<string, unknown>);
      if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        lastError = new NetworkError(`HTTP ${resp.status}`, attempt + 1);
        if (attempt < maxRetries - 1) await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  throw new NetworkError(lastError?.message || 'Unknown error', maxRetries);
}

const API_BASE = 'https://api.github.com';

export class GitHubRegistryClient {
  private headers: Record<string, string>;
  private registryRepo = 'funchub-registry/registry';
  private registryBranch = 'main';

  constructor(private token: string, registryRepo?: string) {
    this.headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    };
    this.registryRepo = resolveRegistryRepo(registryRepo);
  }

  private apiUrl(pathStr: string): string {
    return `${API_BASE}${pathStr}`;
  }

  private async checkWritePermission(): Promise<boolean> {
    const url = this.apiUrl(`/repos/${this.registryRepo}`);
    const resp = await retryRequest(url, { headers: this.headers });
    if (resp.status === 200) {
      const data = (await resp.json()) as Record<string, unknown>;
      const permissions = data.permissions as Record<string, unknown> | undefined;
      return permissions?.push === true;
    }
    return false;
  }

  private async getUserLogin(): Promise<string> {
    const url = this.apiUrl('/user');
    const resp = await retryRequest(url, { headers: this.headers });
    const data = (await resp.json()) as { login: string };
    return data.login;
  }

  private async forkRepository(): Promise<Record<string, unknown>> {
    const url = this.apiUrl(`/repos/${this.registryRepo}/forks`);
    const resp = await retryRequest(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({}),
    });
    if (resp.status === 200 || resp.status === 201 || resp.status === 202) {
      return resp.json() as Promise<Record<string, unknown>>;
    }
    throw new FuncHubError(`Fork 失败: HTTP ${resp.status}`);
  }

  private async fetchFile(
    repo: string,
    filePath: string,
    branch?: string,
  ): Promise<Record<string, unknown> | null> {
    const url = this.apiUrl(`/repos/${repo}/contents/${filePath}`);
    const params: Record<string, string> = {};
    if (branch) params.ref = branch;
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;
    const resp = await retryRequest(fullUrl, { headers: this.headers });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const text = await resp.text();
      throw new FuncHubError(`获取文件失败: HTTP ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as { content?: string };
    if (data.content) {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    }
    return null;
  }

  private async getDefaultBranchSha(repo: string): Promise<string> {
    const url = this.apiUrl(`/repos/${repo}/git/refs/heads/${this.registryBranch}`);
    const resp = await retryRequest(url, { headers: this.headers });
    if (!resp.ok) {
      throw new FuncHubError(`获取分支 SHA 失败: HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as { object: { sha: string } };
    return data.object.sha;
  }

  private async createBranch(repo: string, branchName: string): Promise<void> {
    const sha = await this.getDefaultBranchSha(repo);
    const url = this.apiUrl(`/repos/${repo}/git/refs`);
    const body = { ref: `refs/heads/${branchName}`, sha };
    const resp = await retryRequest(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (resp.status !== 201 && resp.status !== 200) {
      const existing = await retryRequest(
        this.apiUrl(`/repos/${repo}/git/refs/heads/${branchName}`),
        { headers: this.headers },
      );
      if (existing.status === 200) return;
      throw new FuncHubError(`创建分支失败: HTTP ${resp.status}`);
    }
  }

  private async commitFile(
    repo: string,
    branch: string,
    filePath: string,
    contentB64: string,
  ): Promise<void> {
    const existing = await this.fetchFile(repo, filePath, branch);
    const url = this.apiUrl(`/repos/${repo}/contents/${filePath}`);
    const body: Record<string, unknown> = {
      message: `发布工具 ${filePath.split('/').pop()?.replace('.json', '')}`,
      content: contentB64,
      branch,
    };
    if (existing && existing.sha) {
      body.sha = existing.sha as string;
    }
    const resp = await retryRequest(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (resp.status !== 200 && resp.status !== 201) {
      const text = await resp.text();
      throw new FuncHubError(`提交文件失败: HTTP ${resp.status} ${text}`);
    }
  }

  private async createPR(
    head: string,
    branch: string,
    title: string,
  ): Promise<string> {
    const url = this.apiUrl(`/repos/${this.registryRepo}/pulls`);
    const body = { title, head, base: this.registryBranch };
    const resp = await retryRequest(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (resp.status === 200 || resp.status === 201) {
      const data = (await resp.json()) as { html_url: string };
      return data.html_url;
    }
    throw new FuncHubError(`创建 PR 失败: HTTP ${resp.status}`);
  }

  async publishTool(
    toolDef: ToolDefinition,
    force: boolean = false,
    dryRun: boolean = false,
  ): Promise<string> {
    const hasWrite = await this.checkWritePermission();

    let targetRepo: string;
    if (!hasWrite) {
      const forkData = await this.forkRepository();
      targetRepo = forkData.full_name as string;
    } else {
      targetRepo = this.registryRepo;
    }

    const currentContent = await this.fetchFile(
      targetRepo,
      `tools/${toolDef.name}.json`,
    );

    if (currentContent && currentContent.author !== toolDef.author) {
      if (!force) {
        throw new ConflictError(toolDef.name, currentContent.author as string);
      }
    }

    const newContentJson = JSON.stringify(toolDef, null, 2);
    const encoded = Buffer.from(newContentJson).toString('base64');

    if (dryRun) {
      return `[DRY RUN] 将提交到 ${targetRepo}: tools/${toolDef.name}.json`;
    }

    const branch = `publish-${toolDef.name}`;
    await this.createBranch(targetRepo, branch);
    await this.commitFile(targetRepo, branch, `tools/${toolDef.name}.json`, encoded);

    if (!hasWrite) {
      const userLogin = await this.getUserLogin();
      const prUrl = await this.createPR(
        `${userLogin}:${branch}`,
        branch,
        `发布工具: ${toolDef.name}`,
      );
      return prUrl;
    }
    return `https://github.com/${this.registryRepo}/tree/${branch}/tools/${toolDef.name}.json`;
  }
}
