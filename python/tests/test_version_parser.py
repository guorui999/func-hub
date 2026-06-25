import pytest
from funchub.version_parser import resolve_version, convert_caret_to_specifier, convert_tilde_to_specifier


class TestResolveVersion:
    def test_latest_returns_max(self):
        versions = ["1.0.0", "2.0.0", "1.5.0"]
        assert resolve_version(versions, "latest") == "2.0.0"

    def test_latest_when_none(self):
        versions = ["1.0.0", "2.0.0", "1.5.0"]
        assert resolve_version(versions, None) == "2.0.0"

    def test_exact_match(self):
        versions = ["1.0.0", "2.0.0"]
        assert resolve_version(versions, "1.0.0") == "1.0.0"

    def test_caret_constraint(self):
        versions = ["1.0.0", "1.2.3", "1.9.9", "2.0.0"]
        assert resolve_version(versions, "^1.2.3") == "1.9.9"

    def test_caret_major_zero(self):
        versions = ["0.1.0", "0.2.0", "0.3.0"]
        assert resolve_version(versions, "^0.2.0") == "0.2.0"

    def test_tilde_constraint(self):
        versions = ["1.2.0", "1.2.3", "1.3.0"]
        assert resolve_version(versions, "~1.2.0") == "1.2.3"

    def test_wildcard_x(self):
        versions = ["1.0.0", "1.5.0", "2.0.0"]
        assert resolve_version(versions, "1.x") == "1.5.0"

    def test_wildcard_uppercase_x(self):
        versions = ["1.0.0", "1.5.0", "2.0.0"]
        assert resolve_version(versions, "1.X") == "1.5.0"

    def test_branch_name(self):
        versions = ["1.0.0"]
        assert resolve_version(versions, "main") == "main"

    def test_branch_master(self):
        versions = ["1.0.0"]
        assert resolve_version(versions, "master") == "master"

    def test_branch_dev(self):
        versions = ["1.0.0"]
        assert resolve_version(versions, "dev") == "dev"

    def test_branch_prefix(self):
        versions = ["1.0.0"]
        assert resolve_version(versions, "branch:feature-x") == "feature-x"

    def test_prerelease_filtered_by_default(self):
        versions = ["1.0.0", "2.0.0-alpha.1", "2.0.0-beta.1", "2.0.0-rc.1"]
        assert resolve_version(versions, "latest") == "1.0.0"

    def test_prerelease_included_with_flag(self):
        versions = ["1.0.0", "2.0.0-alpha.1", "2.1.0-beta.1"]
        assert resolve_version(versions, "latest", include_prerelease=True) == "2.1.0-beta.1"

    def test_prerelease_specific_rc(self):
        versions = ["1.0.0", "1.5.0-rc.1"]
        assert resolve_version(versions, "latest") == "1.0.0"
        assert resolve_version(versions, "latest", include_prerelease=True) == "1.5.0-rc.1"

    def test_specifier_operator(self):
        versions = ["1.0.0", "1.5.0", "2.0.0", "2.5.0"]
        assert resolve_version(versions, ">=1.0,<2.0") == "1.5.0"

    def test_no_match_returns_none(self):
        versions = ["1.0.0", "1.5.0"]
        assert resolve_version(versions, "^2.0.0") is None

    def test_empty_versions_returns_none(self):
        assert resolve_version([], "latest") is None

    def test_invalid_versions_skipped(self):
        versions = ["not_a_version", "1.0.0"]
        assert resolve_version(versions, "latest") == "1.0.0"

    def test_high_versions(self):
        versions = ["10.0.0", "11.0.0", "9.0.0"]
        assert resolve_version(versions, "latest") == "11.0.0"

    def test_wildcard_x_no_match(self):
        versions = ["1.0.0", "2.0.0"]
        assert resolve_version(versions, "3.x") is None

    def test_caret_no_match(self):
        versions = ["1.0.0", "2.0.0"]
        assert resolve_version(versions, "^3.0.0") is None


class TestConvertCaret:
    def test_caret_returns_correct_specifier(self):
        spec = convert_caret_to_specifier("^1.2.3")
        assert spec is not None
        assert spec.contains("1.2.3")
        assert spec.contains("1.9.9")
        assert not spec.contains("2.0.0")

    def test_caret_major_zero(self):
        spec = convert_caret_to_specifier("^0.2.0")
        assert spec is not None
        assert spec.contains("0.2.0")
        assert spec.contains("0.2.5")
        assert not spec.contains("0.3.0")
        assert not spec.contains("0.1.0")

    def test_caret_no_prefix_returns_none(self):
        assert convert_caret_to_specifier("1.2.3") is None

    def test_caret_bad_version_returns_none(self):
        assert convert_caret_to_specifier("^invalid") is None


class TestConvertTilde:
    def test_tilde_returns_correct_specifier(self):
        spec = convert_tilde_to_specifier("~1.2.0")
        assert spec is not None
        assert spec.contains("1.2.0")
        assert spec.contains("1.2.9")
        assert not spec.contains("1.3.0")

    def test_tilde_no_prefix_returns_none(self):
        assert convert_tilde_to_specifier("1.2.0") is None

    def test_tilde_bad_version_returns_none(self):
        assert convert_tilde_to_specifier("~bad") is None
