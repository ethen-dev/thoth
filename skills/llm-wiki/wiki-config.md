---
id: wiki-config
name: wiki-config
category: llm-wiki
status: experimental
version: 0.1.0
---

# wiki-config

Propone una mutación estructurada y explícita de `thoth.config.json`. El único
payload permitido es `{ "changes": { ... } }` con `defaultType`,
`defaultStatus` y/o `dateFormat` (valores planos string). Nunca propongas
`wikiPath`, `audit.*`, claves desconocidas, Markdown ni comandos. La ejecución
requiere revisión, `confirmed=true` y el token exacto devuelto por `plan` o
`dry-run`; esos modos son siempre read-only.
