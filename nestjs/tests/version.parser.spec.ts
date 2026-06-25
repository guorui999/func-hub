import { resolveVersion } from '../src/version.parser';

describe('VersionParser', () => {
  describe('resolveVersion', () => {
    const versions = ['1.0.0', '1.2.3', '1.9.9', '2.0.0', '3.0.0-alpha.1', '3.0.0-beta.1'];

    test('latest returns max stable version', () => {
      expect(resolveVersion(versions, 'latest')).toBe('2.0.0');
    });

    test('null constraint returns max stable version', () => {
      expect(resolveVersion(versions, null)).toBe('2.0.0');
    });

    test('exact match returns version', () => {
      expect(resolveVersion(versions, '1.2.3')).toBe('1.2.3');
    });

    test('caret constraint', () => {
      expect(resolveVersion(versions, '^1.2.0')).toBe('1.9.9');
    });

    test('tilde constraint', () => {
      const tildeVersions = ['1.2.0', '1.2.3', '1.3.0'];
      expect(resolveVersion(tildeVersions, '~1.2.0')).toBe('1.2.3');
    });

    test('wildcard x', () => {
      const wildVersions = ['1.0.0', '1.5.0', '2.0.0'];
      expect(resolveVersion(wildVersions, '1.x')).toBe('1.5.0');
    });

    test('wildcard uppercase X', () => {
      const wildVersions = ['1.0.0', '1.5.0', '2.0.0'];
      expect(resolveVersion(wildVersions, '1.X')).toBe('1.5.0');
    });

    test('branch name main', () => {
      expect(resolveVersion(versions, 'main')).toBe('main');
    });

    test('branch name master', () => {
      expect(resolveVersion(versions, 'master')).toBe('master');
    });

    test('branch name dev', () => {
      expect(resolveVersion(versions, 'dev')).toBe('dev');
    });

    test('branch prefix', () => {
      expect(resolveVersion(versions, 'branch:feature-x')).toBe('feature-x');
    });

    test('prereleases filtered by default', () => {
      expect(resolveVersion(versions, 'latest')).toBe('2.0.0');
    });

    test('prereleases included with flag', () => {
      expect(resolveVersion(versions, 'latest', true)).toBe('3.0.0-beta.1');
    });

    test('no match returns null', () => {
      expect(resolveVersion(versions, '^5.0.0')).toBeNull();
    });

    test('empty versions returns null', () => {
      expect(resolveVersion([], 'latest')).toBeNull();
    });

    test('specifier operator', () => {
      const specVersions = ['1.0.0', '1.5.0', '2.0.0'];
      expect(resolveVersion(specVersions, '>=1.0 <2.0')).toBe('1.5.0');
    });
  });
});
