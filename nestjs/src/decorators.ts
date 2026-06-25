import { ToolDefinition, ToolVersion } from './models';

export function tool(options?: {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  sourceRepo?: string;
  sourceRef?: string;
  dependencies?: string[];
}) {
  return function (
    target: unknown,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) {
    const func = descriptor ? descriptor.value : target;
    if (typeof func !== 'function') {
      throw new Error('@tool decorator must be applied to a function or method');
    }

    const toolName = options?.name || func.name || 'anonymous';
    const toolDesc = options?.description || toolName;
    const version = options?.version || '1.0.0';

    const parameters = inferParameters(func);

    const toolVersion: ToolVersion = {
      version,
      source_repo: options?.sourceRepo || '',
      source_ref: options?.sourceRef || '',
      dependencies: options?.dependencies || [],
      released_at: new Date().toISOString(),
      is_prerelease: /alpha|beta|rc/.test(version.toLowerCase()),
    };

    const toolDef: ToolDefinition = {
      name: toolName,
      description: toolDesc,
      parameters,
      author: options?.author || 'anonymous',
      entry_point: `${func.name}`,
      versions: [toolVersion],
    };

    (func as Record<string, unknown>).__funchub_tool__ = toolDef;

    if (descriptor) {
      return descriptor;
    }
    return func;
  };
}

function inferParameters(func: Function): Record<string, unknown> {
  const str = func.toString();
  const paramsMatch = str.match(/\(([^)]*)\)/);
  if (!paramsMatch) {
    return { type: 'object', properties: {} };
  }

  const paramStr = paramsMatch[1];
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  const paramList = paramStr.split(',').map((p) => p.trim()).filter(Boolean);

  for (const param of paramList) {
    const parts = param.split('=');
    const name = parts[0].trim().replace(/^\.\.\./, '');
    if (name === 'this') continue;

    const prop: Record<string, unknown> = { type: 'string' };
    if (parts.length > 1) {
      prop.default = parts[1].trim();
    } else {
      required.push(name);
    }
    properties[name] = prop;
  }

  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}
