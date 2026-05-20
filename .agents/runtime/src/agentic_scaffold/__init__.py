from agentic_scaffold.runtime import AgenticRuntime

__all__ = ["AgenticRuntime", "build_mcp"]


def build_mcp(*args, **kwargs):
    from agentic_scaffold.server import build_mcp as _build_mcp

    return _build_mcp(*args, **kwargs)
