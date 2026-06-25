# Security Policy

## Dynamic Code Loading Warning

FuncHub dynamically loads and executes code from remote Git repositories. This
architecture inherently carries security risks. **Only install tools from
sources you explicitly trust.**

- Tools are downloaded and executed as native Python or Node.js code on your
  system.
- Tools have access to the same permissions as the user running FuncHub.
- There is no sandbox or container isolation by default.

## Recommended Practices

- Always review the source repository before installing. Run
  `funchub info <name>` to see the source URL, then inspect the code manually.
- Run FuncHub in an isolated environment (Docker container, virtual machine,
  or at minimum a Python virtualenv / Node.js `nvm` sandbox).
- Regularly run `funchub list` to audit installed tools.
- Remove unused tools promptly with `funchub uninstall <name>`.
- Enterprise users should deploy a private registry and audit every
  submission before it is merged.

## Reporting a Vulnerability

If you discover a security vulnerability in FuncHub itself (as opposed to
a third-party tool distributed through FuncHub), please open an issue at
https://github.com/funchub/funchub/issues with the label `security`.
