---
id: dev-router
name: dev-router
category: development
status: temporary
version: 0.1.0
purpose: Choose the smallest useful development route for a requested change.
---

# dev-router

`dev-router` decides how a development request should be handled.

It is inspired by Gentle-AI's basic routing principle: small, clear work can stay direct; broader or uncertain work should be decomposed and delegated.

## Responsibilities

- classify development request size and ambiguity
- decide direct work vs delegated temporary-agent flow
- identify whether exploration is needed before writing
- keep scope bounded
- avoid unnecessary planning for simple changes

## Routing Rules

Use direct implementation when:

- the change affects one small area
- context is already clear
- no broad search is needed
- risk is low

Use `dev-explorer` when:

- multiple files or modules may be involved
- implementation depends on unknown conventions
- the request affects architecture or public contracts
- tests or build setup must be discovered

Use full development flow when:

- code changes are non-trivial
- behavior could regress
- new commands, schemas, or storage behavior are introduced
- verification is required before delivery

## Outputs

```json
{
  "route": "delegated_flow",
  "reason": "The change touches CLI, storage, and wiki behavior.",
  "agents": ["dev-explorer", "dev-implementer", "dev-reviewer", "dev-verifier"]
}
```
