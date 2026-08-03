# Minimal Workspace Example

This example is a small T.H.O.T.H. workspace with a local wiki.

From the repository root:

```bash
npm run build
node dist/cli/index.js doctor --help
```

From this directory:

```bash
node ../../dist/cli/index.js list
node ../../dist/cli/index.js search "durable memory"
node ../../dist/cli/index.js doctor
```

The workspace uses this local config:

```json
{
  "wikiPath": "./wiki"
}
```
