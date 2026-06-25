#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
import * as yaml from 'js-yaml';
import { FuncHub } from './client';
import {
  ConflictError,
  FuncHubError,
  ToolNotFoundError,
  VersionNotFoundError,
} from './exceptions';
import { ToolDefinition, ToolVersion } from './models';

const program = new Command();

program
  .name('funchub')
  .description('FuncHub - A tool registry and dynamic loader for AI agents')
  .version('0.1.0');

program
  .command('login')
  .requiredOption('--token <token>', 'GitHub Personal Access Token')
  .action(async (opts: { token: string }) => {
    const configDir = path.join(require('os').homedir(), '.funchub');
    const configPath = path.join(configDir, 'config.yaml');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    let cfg: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      cfg = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    }
    cfg.github_token = opts.token;
    fs.writeFileSync(configPath, yaml.dump(cfg), 'utf-8');
    console.log('GitHub Token 已保存到 ~/.funchub/config.yaml');
  });

program
  .command('config')
  .argument('<key>', '配置项名称')
  .argument('<value>', '配置项值')
  .action((key: string, value: string) => {
    const configDir = path.join(require('os').homedir(), '.funchub');
    const configPath = path.join(configDir, 'config.yaml');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    let cfg: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      cfg = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    }
    cfg[key] = value;
    fs.writeFileSync(configPath, yaml.dump(cfg), 'utf-8');
    console.log(`配置项 ${key} 已设置为 ${value}`);
  });

program
  .command('publish')
  .requiredOption('--version <version>', '发布的版本号')
  .option('--force', '覆盖同名工具')
  .option('--dry-run', '预览不实际提交')
  .action(async (opts: { version: string; force?: boolean; dryRun?: boolean }) => {
    const hub = new FuncHub();
    const toolFile = path.join(process.cwd(), 'funchub-tool.yaml');
    if (!fs.existsSync(toolFile)) {
      console.error('错误: 当前目录未找到 funchub-tool.yaml');
      process.exit(1);
    }
    const raw = fs.readFileSync(toolFile, 'utf-8');
    const data = yaml.load(raw) as Record<string, unknown>;
    const ver = opts.version;
    const isPrerelease = /alpha|beta|rc|pre/.test(ver.toLowerCase());
    const tv: ToolVersion = {
      version: ver,
      source_repo: (data.source_repo as string) || '',
      source_ref: (data.source_ref as string) || `v${ver}`,
      dependencies: (data.dependencies as string[]) || [],
      released_at: new Date().toISOString(),
      is_prerelease: isPrerelease,
    };
    const toolDef: ToolDefinition = {
      name: data.name as string,
      description: (data.description as string) || '',
      parameters: (data.parameters as Record<string, unknown>) || { type: 'object', properties: {} },
      author: (data.author as string) || 'anonymous',
      entry_point: (data.entry_point as string) || 'index:main',
      versions: [tv],
    };
    try {
      const result = await hub.publish(toolDef, opts.force, opts.dryRun);
      console.log(`发布成功: ${result}`);
    } catch (err) {
      if (err instanceof ConflictError || err instanceof FuncHubError) {
        console.error(`错误: ${err.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('search')
  .argument('<query>', '搜索关键字')
  .action(async (query: string) => {
    const hub = new FuncHub();
    const results = await hub.search(query);
    if (results.length === 0) {
      console.log('未找到匹配的工具');
      return;
    }
    for (const t of results) {
      console.log(`${t.name} - ${t.description}`);
    }
  });

program
  .command('install')
  .argument('<tool-spec>', '工具名称或 name@constraint')
  .option('--prerelease', '包含预发布版本')
  .option('--yes', '跳过安全确认')
  .action(async (toolSpec: string, opts: { prerelease?: boolean; yes?: boolean }) => {
    const hub = new FuncHub();
    let constraint: string | undefined;
    let toolName = toolSpec;
    if (toolSpec.includes('@')) {
      [toolName, constraint] = toolSpec.split('@', 2);
    }
    try {
      await hub.install(toolName, constraint, opts.prerelease, opts.yes);
      console.log(`✅ 工具 ${toolName} 安装成功`);
    } catch (err) {
      if (err instanceof ToolNotFoundError || err instanceof VersionNotFoundError || err instanceof FuncHubError) {
        console.error(`错误: ${err.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('list')
  .description('列出本地已安装工具')
  .action(() => {
    const hub = new FuncHub();
    const items = hub.listInstalled();
    if (items.length === 0) {
      console.log('未安装任何工具');
      return;
    }
    for (const item of items) {
      console.log(`${item.name}@${item.version} (${item.source_repo})`);
    }
  });

program
  .command('update')
  .argument('[name]', '工具名称')
  .option('--all', '更新所有工具')
  .option('--prerelease', '包含预发布版本')
  .option('--yes', '跳过安全确认')
  .action(async (name: string | undefined, opts: { all?: boolean; prerelease?: boolean; yes?: boolean }) => {
    const hub = new FuncHub();
    if (opts.all) {
      const results = await hub.updateAll(opts.prerelease, opts.yes);
      if (results.length === 0) {
        console.log('所有工具已是最新');
      }
      for (const r of results) {
        console.log(r);
      }
      return;
    }
    if (!name) {
      console.error('请指定工具名称或使用 --all');
      process.exit(1);
    }
    try {
      const result = await hub.update(name, opts.prerelease, opts.yes);
      console.log(`✅ 工具 ${name} 已更新到 ${result}`);
    } catch (err) {
      if (err instanceof FuncHubError) {
        console.error(`错误: ${err.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('info')
  .argument('<name>', '工具名称')
  .action(async (name: string) => {
    const hub = new FuncHub();
    const toolDef = await hub.info(name);
    if (!toolDef) {
      console.log(`工具 '${name}' 未找到`);
      return;
    }
    console.log(`名称: ${toolDef.name}`);
    console.log(`描述: ${toolDef.description}`);
    console.log(`作者: ${toolDef.author}`);
    console.log(`入口: ${toolDef.entry_point}`);
    console.log('版本:');
    for (const v of toolDef.versions) {
      const pre = v.is_prerelease ? ' (预发布)' : '';
      console.log(`  - ${v.version}${pre}`);
    }
  });

program
  .command('uninstall')
  .argument('<name>', '工具名称')
  .action((name: string) => {
    const hub = new FuncHub();
    if (hub.uninstall(name)) {
      console.log(`✅ 工具 ${name} 已卸载`);
    } else {
      console.log(`工具 ${name} 未安装`);
    }
  });

program.parse(process.argv);
