import { z } from 'zod';

export const ToolVersionSchema = z.object({
  version: z.string().describe("语义化版本，如 '2.1.0'"),
  source_repo: z.string().describe('完整 Git 仓库地址，含协议'),
  source_ref: z.string().describe("Tag 或分支名，如 'v2.1.0'"),
  dependencies: z.array(z.string()).default([]),
  released_at: z.string().default(() => new Date().toISOString()),
  is_prerelease: z.boolean().default(false).describe('是否为 alpha/beta/rc 版本'),
});

export const ToolDefinitionSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_\-]{1,50}$/)
    .describe('仅小写字母、数字、下划线、连字符'),
  description: z.string().max(200),
  parameters: z.record(z.any()).describe('标准 OpenAI 格式 JSON Schema'),
  author: z.string(),
  entry_point: z.string().describe("'module.sub:func_name' 格式"),
  versions: z.array(ToolVersionSchema).default([]),
});

export type ToolVersion = z.infer<typeof ToolVersionSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export interface InstalledTool {
  name: string;
  version: string;
  source_repo: string;
}

export interface RegistryCache {
  _cached_at: number;
  tools: Record<string, ToolDefinition>;
}
