from typing import List, Optional
from packaging.version import Version, parse, InvalidVersion
from packaging.specifiers import SpecifierSet


def convert_caret_to_specifier(constraint: str) -> Optional[SpecifierSet]:
    if not constraint.startswith("^"):
        return None
    ver_str = constraint[1:]
    try:
        ver = parse(ver_str)
    except InvalidVersion:
        return None
    if ver.major == 0:
        if ver.minor is not None and ver.minor > 0:
            upper = f"0.{ver.minor + 1}.0"
        elif ver.minor == 0 and ver.micro is not None and ver.micro > 0:
            upper = f"0.0.{ver.micro + 1}"
        else:
            upper = f"{ver.major + 1}.0.0"
    else:
        upper = f"{ver.major + 1}.0.0"
    return SpecifierSet(f">={ver_str},<{upper}")


def convert_tilde_to_specifier(constraint: str) -> Optional[SpecifierSet]:
    if not constraint.startswith("~"):
        return None
    ver_str = constraint[1:]
    try:
        ver = parse(ver_str)
    except InvalidVersion:
        return None
    if ver.minor is not None:
        upper = f"{ver.major}.{ver.minor + 1}.0"
    else:
        upper = f"{ver.major + 1}.0.0"
    return SpecifierSet(f">={ver_str},<{upper}")


def resolve_version(
    available_versions: List[str],
    constraint: Optional[str] = None,
    include_prerelease: bool = False,
) -> Optional[str]:
    if constraint in ("main", "master", "dev") or (
        constraint is not None and constraint.startswith("branch:")
    ):
        if constraint is not None and constraint.startswith("branch:"):
            return constraint.replace("branch:", "")
        return constraint

    parsed: List[Version] = []
    version_map: dict = {}
    for v in available_versions:
        try:
            ver = parse(v)
        except InvalidVersion:
            continue
        if not include_prerelease and ver.is_prerelease:
            continue
        parsed.append(ver)
        version_map[ver] = v

    if not parsed:
        return None

    if constraint is None or constraint == "latest":
        best = max(parsed)
        return version_map.get(best, str(best))

    if constraint in available_versions:
        return constraint

    spec: Optional[SpecifierSet] = None
    if constraint.startswith("^"):
        spec = convert_caret_to_specifier(constraint)
    elif constraint.startswith("~"):
        spec = convert_tilde_to_specifier(constraint)
    elif constraint.startswith(">") or constraint.startswith("<") or constraint.startswith("=") or constraint.startswith("!"):
        try:
            spec = SpecifierSet(constraint)
        except Exception:
            spec = None
    elif constraint.endswith(".x") or constraint.endswith(".X"):
        major_str = constraint[:-2].strip()
        try:
            major = int(major_str)
        except ValueError:
            return None
        spec = SpecifierSet(f">={major}.0.0,<{major + 1}.0.0")

    if spec is not None:
        matched = [v for v in parsed if spec.contains(v)]
        if matched:
            best = max(matched)
            return version_map.get(best, str(best))

    return None
