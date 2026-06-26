import {
  FuncHubError,
  ToolNotFoundError,
  VersionNotFoundError,
  ConflictError,
  RegistryError,
  NetworkError,
  ConfigError,
  LoadError,
} from '../src/exceptions';

describe('FuncHubError', () => {
  it('creates with message and name', () => {
    const e = new FuncHubError('test');
    expect(e.message).toBe('test');
    expect(e.name).toBe('FuncHubError');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('ToolNotFoundError', () => {
  it('stores toolName and formats message', () => {
    const e = new ToolNotFoundError('my_tool');
    expect(e.toolName).toBe('my_tool');
    expect(e.message).toContain('my_tool');
    expect(e.name).toBe('ToolNotFoundError');
  });
});

describe('VersionNotFoundError', () => {
  it('stores constraint and formats message', () => {
    const e = new VersionNotFoundError('^1.0');
    expect(e.constraint).toBe('^1.0');
    expect(e.message).toContain('^1.0');
    expect(e.name).toBe('VersionNotFoundError');
  });
});

describe('ConflictError', () => {
  it('stores toolName, author, formats message', () => {
    const e = new ConflictError('my_tool', 'someone');
    expect(e.toolName).toBe('my_tool');
    expect(e.author).toBe('someone');
    expect(e.message).toContain('my_tool');
    expect(e.message).toContain('someone');
    expect(e.name).toBe('ConflictError');
  });
});

describe('RegistryError', () => {
  it('formats message with prefix', () => {
    const e = new RegistryError('broken');
    expect(e.message).toContain('broken');
    expect(e.name).toBe('RegistryError');
  });
});

describe('NetworkError', () => {
  it('defaults to 3 attempts', () => {
    const e = new NetworkError('timeout');
    expect(e.attempts).toBe(3);
    expect(e.message).toContain('timeout');
    expect(e.message).toContain('3');
    expect(e.name).toBe('NetworkError');
  });

  it('accepts custom attempts', () => {
    const e = new NetworkError('fail', 5);
    expect(e.attempts).toBe(5);
    expect(e.message).toContain('5');
  });
});

describe('ConfigError', () => {
  it('formats message with prefix', () => {
    const e = new ConfigError('missing key');
    expect(e.message).toContain('missing key');
    expect(e.name).toBe('ConfigError');
  });
});

describe('LoadError', () => {
  it('formats message with prefix', () => {
    const e = new LoadError('cannot load module');
    expect(e.message).toContain('cannot load module');
    expect(e.name).toBe('LoadError');
  });
});

describe('All exceptions inherit from FuncHubError', () => {
  it('ToolNotFoundError', () => expect(new ToolNotFoundError('x')).toBeInstanceOf(FuncHubError));
  it('VersionNotFoundError', () => expect(new VersionNotFoundError('x')).toBeInstanceOf(FuncHubError));
  it('ConflictError', () => expect(new ConflictError('x', 'y')).toBeInstanceOf(FuncHubError));
  it('RegistryError', () => expect(new RegistryError('x')).toBeInstanceOf(FuncHubError));
  it('NetworkError', () => expect(new NetworkError('x')).toBeInstanceOf(FuncHubError));
  it('ConfigError', () => expect(new ConfigError('x')).toBeInstanceOf(FuncHubError));
  it('LoadError', () => expect(new LoadError('x')).toBeInstanceOf(FuncHubError));
});
