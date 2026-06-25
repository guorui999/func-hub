import * as semver from 'semver';

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

  const parsed: string[] = [];
  for (const v of availableVersions) {
    const coerced = semver.coerce(v);
    if (!coerced) continue;
    if (!includePrerelease && semver.prerelease(coerced) !== null) continue;
    parsed.push(coerced.version);
  }

  if (parsed.length === 0) return null;

  if (constraint === null || constraint === 'latest') {
    const sorted = semver.rsort(parsed);
    const raw = sorted[0];
    if (includePrerelease) {
      const all: string[] = [];
      for (const v of availableVersions) {
        const c = semver.coerce(v);
        if (c && c.version === raw) {
          all.push(v);
        }
      }
      const sortedAll = semver.rsort(all);
      return sortedAll.length > 0 ? sortedAll[0] : raw;
    }
    return raw;
  }

  if (availableVersions.includes(constraint)) return constraint;

  const coerced = semver.coerce(constraint);
  if (coerced && !includePrerelease && semver.prerelease(coerced) !== null) {
    const exact = availableVersions.find((v) => v === constraint);
    return exact || null;
  }

  if (constraint.startsWith('^') || constraint.startsWith('~')) {
    const range = semver.validRange(constraint);
    if (range) {
      const maxSatisfying = semver.maxSatisfying(parsed, range);
      if (maxSatisfying) {
        if (includePrerelease) {
          const prerelease = availableVersions.filter((v) => {
            const c = semver.coerce(v);
            return c && c.version === maxSatisfying;
          });
          const sorted = semver.rsort(prerelease);
          return sorted.length > 0 ? sorted[0] : maxSatisfying;
        }
        return maxSatisfying;
      }
    }
  }

  if (constraint.includes('>') || constraint.includes('<') || constraint.includes('=')) {
    const range = semver.validRange(constraint);
    if (range) {
      const maxSatisfying = semver.maxSatisfying(parsed, range);
      if (maxSatisfying) return maxSatisfying;
    }
  }

  if (constraint.endsWith('.x') || constraint.endsWith('.X')) {
    const majorStr = constraint.replace(/\.x$/i, '').trim();
    const major = parseInt(majorStr, 10);
    if (isNaN(major)) return null;
    const range = `>=${major}.0.0 <${major + 1}.0.0`;
    return semver.maxSatisfying(parsed, range) || null;
  }

  return null;
}
