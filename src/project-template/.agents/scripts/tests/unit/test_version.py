# -*- coding: utf-8 -*-
"""
Unit tests para version check.

Este arquivo contém testes para a funcionalidade de verificação
de versões do update system.
"""

import pytest
import re


# ═══════════════════════════════════════════════════════════════
#  Version Functions (Reference Implementation)
# ═══════════════════════════════════════════════════════════════


def parse_version(version_str: str) -> str:
    """
    Parse version de different formats.

    Args:
        version_str: Version string em various formats

    Returns:
        Normalized version

    Examples:
        >>> parse_version("v1.2.3")
        '1.2.3'
        >>> parse_version("1.2.3")
        '1.2.3'
        >>> parse_version("version: 1.2.3")
        '1.2.3'
    """
    # Remove prefixos comuns
    cleaned = version_str.strip()
    cleaned = re.sub(r"^(version:\s*)", "", cleaned)
    cleaned = re.sub(r"^v", "", cleaned)
    return cleaned


def compare_versions(current: str, upstream: str) -> dict:
    """
    Compara duas versões e determina se há update.

    Args:
        current: Current version
        upstream: Versão do upstream

    Returns:
        Dicionário com resultado da comparação
    """
    try:
        current_clean = parse_version(current)
        upstream_clean = parse_version(upstream)

        # Parse para inteiros
        current_parts = [int(x) for x in current_clean.split(".")]
        upstream_parts = [int(x) for x in upstream_clean.split(".")]

        # Normaliza para 3 partes
        while len(current_parts) < 3:
            current_parts.append(0)
        while len(upstream_parts) < 3:
            upstream_parts.append(0)

        # Compara
        if upstream_parts[0] > current_parts[0]:
            return {
                "has_update": True,
                "update_type": "major",
                "current_version": current,
                "new_version": upstream,
            }
        elif upstream_parts[1] > current_parts[1]:
            return {
                "has_update": True,
                "update_type": "minor",
                "current_version": current,
                "new_version": upstream,
            }
        elif upstream_parts[2] > current_parts[2]:
            return {
                "has_update": True,
                "update_type": "patch",
                "current_version": current,
                "new_version": upstream,
            }
        else:
            return {
                "has_update": False,
                "update_type": None,
                "current_version": current,
                "new_version": upstream,
            }

    except (ValueError, IndexError) as e:
        raise ValueError(f"Invalid version format: {e}")


# ═══════════════════════════════════════════════════════════════
#  Testes de Parse Version
# ═══════════════════════════════════════════════════════════════


class TestVersionParsing:
    """Testa parsing de versão de diferentes fontes."""

    @pytest.mark.parametrize(
        "input_version,expected",
        [
            ("v1.2.3", "1.2.3"),
            ("1.2.3", "1.2.3"),
            ("v1.2.3-beta.1", "1.2.3-beta.1"),
            ("version: 1.2.3", "1.2.3"),
            ("  v1.2.3  ", "1.2.3"),
        ],
    )
    def test_parse_version_formats(self, input_version: str, expected: str):
        """Diferentes formatos de versão são parseados corretamente."""
        result = parse_version(input_version)
        assert result == expected


# ═══════════════════════════════════════════════════════════════
#  Comparison Tests de Versão
# ═══════════════════════════════════════════════════════════════


class TestVersionComparison:
    """Testa comparação de versões semânticas."""

    # ─────────────────────────────────────────────────────────────
    #  Cases: Current version é older (update available)
    # ─────────────────────────────────────────────────────────────

    def test_update_major_version(self):
        """Quando upstream tem versão major maior, update available."""
        result = compare_versions("v1.0.0", "v2.0.0")

        assert result["has_update"] is True
        assert result["update_type"] == "major"
        assert result["new_version"] == "v2.0.0"

    def test_update_minor_version(self):
        """Quando upstream tem versão minor maior."""
        result = compare_versions("v1.1.0", "v1.2.0")

        assert result["has_update"] is True
        assert result["update_type"] == "minor"

    def test_update_patch_version(self):
        """Quando upstream tem versão patch maior."""
        result = compare_versions("v1.1.0", "v1.1.1")

        assert result["has_update"] is True
        assert result["update_type"] == "patch"

    def test_update_multiple_minor(self):
        """Update de várias versões minor."""
        result = compare_versions("v1.0.0", "v1.5.0")

        assert result["has_update"] is True
        assert result["update_type"] == "minor"

    # ─────────────────────────────────────────────────────────────
    #  Cases: No update available
    # ─────────────────────────────────────────────────────────────

    def test_no_update_same_version(self):
        """Mesma versão não tem update."""
        result = compare_versions("v1.2.0", "v1.2.0")

        assert result["has_update"] is False
        assert result["update_type"] is None

    def test_no_update_upstream_behind(self):
        """Quando upstream está atrás (rara mas possível)."""
        result = compare_versions("v1.2.0", "v1.1.0")

        assert result["has_update"] is False

    # ─────────────────────────────────────────────────────────────
    #  Cases: Edge Cases
    # ─────────────────────────────────────────────────────────────

    def test_version_with_prefix_v(self):
        """Versões com prefixo v são tratadas corretamente."""
        result = compare_versions("v1.0.0", "v1.0.1")

        assert result["has_update"] is True

    def test_version_without_prefix_v(self):
        """Versões sem prefixo funcionam."""
        result = compare_versions("1.0.0", "1.0.1")

        assert result["has_update"] is True

    def test_invalid_version_format(self):
        """Versão inválida levanta exceção clara."""
        with pytest.raises(ValueError, match="Invalid version format"):
            compare_versions("invalid", "v1.0.0")

    def test_empty_version(self):
        """Versão vazia levanta exceção."""
        with pytest.raises(ValueError, match="Invalid version format"):
            compare_versions("", "v1.0.0")

    def test_partial_version(self):
        """Versão parcial (apenas major) funciona."""
        result = compare_versions("1", "2")

        assert result["has_update"] is True
        assert result["update_type"] == "major"


# ═══════════════════════════════════════════════════════════════
#  Integration Tests with Mock
# ═══════════════════════════════════════════════════════════════


class TestVersionCheckIntegration:
    """Testes de integração com mocks externos."""

    def test_version_check_full_flow(self):
        """Fluxo completo de verificação de versão."""
        # Simula o fluxo completo
        current_version = "v1.1.0"

        # Mock upstream
        upstream_version = "v1.2.0"

        # Compara
        result = compare_versions(current_version, upstream_version)

        # Verifica resultado
        assert result["has_update"] is True
        assert result["update_type"] == "minor"

    def test_version_check_patch_flow(self):
        """Fluxo com update patch."""
        current_version = "v1.1.0"
        upstream_version = "v1.1.1"

        result = compare_versions(current_version, upstream_version)

        assert result["has_update"] is True
        assert result["update_type"] == "patch"
