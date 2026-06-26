import * as semver from 'semver';

function hasPrerelease(v: string): boolean {
  const parsed = semver.parse(v);
  return parsed !== null && semver.prerelease(parsed) !== null;
}

export function resolveVersion(
  availableVersions: string[],
  constraint: string | null = null,
  includePrerelease: boolean = false,
): string | null {
  if (
    constraint === 'main' ||
    constraint === 'master' ||
    constraint === 'dev' ||
    (constraint !== null && constraint.startsWith('branch:'))
  ) {
    if (constraint !== null && constraint.startsWith('branch:')) {
      return constraint.replace('branch:', '');
    }
    return constraint;
  }

  const filtered: string[] = [];
  for (const v of availableVersions) {
    if (!semver.valid(v)) continue;
    if (!includePrerelease && hasPrerelease(v)) continue;
    filtered.push(v);
  }

  if (filtered.length === 0) return null;

  if (constraint === null || constraint === 'latest') {
    const sorted = semver.rsort(filtered);
    return sorted.length > 0 ? sorted[0] : null;
  }

  if (availableVersions.includes(constraint)) return constraint;

  if (constraint.startsWith('^') || constraint.startsWith('~')) {
    const range = semver.validRange(constraint);
    if (range) {
      const candidates = filtered.filter((v) => semver.satisfies(v, range));
      if (candidates.length > 0) {
        const sorted = semver.rsort(candidates);
        return sorted[0];
      }
    }
  }

  if (
    constraint.includes('>') ||
    constraint.includes('<') ||
    constraint.includes('=')
  ) {
    const range = semver.validRange(constraint);
    if (range) {
      const candidates = filtered.filter((v) => semver.satisfies(v, range));
      if (candidates.length > 0) {
        const sorted = semver.rsort(candidates);
        return sorted[0];
      }
    }
  }

  if (constraint.endsWith('.x') || constraint.endsWith('.X')) {
    const majorStr = constraint.replace(/\.x$/i, '').trim();
    const major = parseInt(majorStr, 10);
    if (isNaN(major)) return null;
    const range = `>=${major}.0.0 <${major + 1}.0.0`;
    const candidates = filtered.filter((v) => semver.satisfies(v, range));
    if (candidates.length > 0) {
      const sorted = semver.rsort(candidates);
      return sorted[0];
    }
    return null;
  }

  return null;
}
