# ADR-002: `afol` is the only public CLI entrypoint

Status: accepted

The documented public command is `afol`. Downstream projects must not receive
a project-local `afol` executable, wrapper, symlink, or package bin. The CLI
is an operator command installed outside the target project.

Retired compatibility surfaces are not part of the public contract and must
not be restored.
