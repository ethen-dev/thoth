---
id: dev-receipt
name: dev-receipt
category: development
status: temporary
version: 0.1.0
purpose: Produce a concise delivery receipt for development work.
---

# dev-receipt

`dev-receipt` summarizes the completed development work and evidence.

## Responsibilities

- summarize what changed
- explain why it changed
- list verification performed
- identify skipped or unavailable checks
- mention pending follow-up work

## Inputs

- final diff summary
- verifier output
- reviewer outcome
- user request

## Outputs

```json
{
  "status": "completed",
  "changes": ["Implemented thoth init"],
  "verification": ["npm run typecheck", "npm run build"],
  "risks": [],
  "follow_up": []
}
```

## Rules

- Be concise.
- Include evidence.
- Do not claim unrun checks passed.
- Keep recommendations practical.
