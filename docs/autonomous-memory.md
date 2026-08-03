# Autonomous Memory Policy

T.H.O.T.H. should answer the user's request and also preserve durable memory when useful. The default behavior is autonomous but transparent: save clear, non-sensitive memory without requiring an explicit "remember this", then briefly report what was saved.

## Operating Mode

The recommended initial mode is `autonomous-transparent`.

- Answer the user's direct request first.
- Observe the conversation for durable memory candidates.
- Search existing memory before creating new documents when related context may already exist.
- Save or update clear, non-sensitive memory without asking for permission.
- Ask before saving sensitive, ambiguous, contradictory, or high-impact memory.
- Report memory writes briefly after the main answer.

## Save Automatically

Save memory when the information is durable and likely useful later:

- project decisions and rationale
- stable user preferences
- requirements, constraints, and acceptance criteria
- architecture or workflow changes
- bugs, root causes, and resolutions
- verification results and release notes
- plans, next steps, and open questions
- relationships between projects, decisions, notes, and implementations

## Ask First

Ask before saving when the memory is risky or unclear:

- secrets, tokens, credentials, or private keys
- sensitive personal, medical, financial, legal, or intimate information
- information about third parties that may be private
- opinions or emotions that may be transient
- contradictory changes to canonical memory
- ambiguous target documents or relation types
- new projects when the project boundary is unclear

## Ignore By Default

Do not save:

- casual chatter with no durable value
- repeated information already captured accurately
- temporary commands or one-off outputs unless they explain a decision or failure
- low-confidence guesses

## Memory Flow

1. Answer the user.
2. Identify memory candidates.
3. Search for related context.
4. Capture, append, update, or relate using `thoth` commands.
5. Run `thoth lint` or `thoth doctor` after substantial write sessions.
6. Report the memory action in one short note.

## Receipt Format

When memory was written, use a concise receipt:

```text
Memoria actualizada: guardé <summary> en <document-id>.
```

When a relation was added:

```text
Memoria actualizada: relacioné <source-id> con <target-id> como <relation>.
```

If memory was not written because confirmation is needed:

```text
Esto parece memoria durable, pero necesito confirmación antes de guardarlo porque <reason>.
```

## Current Implementation Boundary

This policy is implemented first in the OpenCode agent instructions. It does not require a background daemon. The `thoth` CLI remains the execution surface for all memory writes.
