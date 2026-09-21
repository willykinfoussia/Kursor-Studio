---
name: coding-standards
description: Use when reviewing code quality or naming with no framework-specific skill that applies. Baseline conventions for naming, readability, immutability, and smells.
triggers: [standards, naming, readability, refactor, quality, conventions]
allowedTools: [read_file, search_files, apply_patch]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). Shared floor, not a framework playbook. Follow existing files in this repo before these defaults. For React/API/backend-specific work, load a narrower skill with load_skill if one exists.

Use read_file and search_files. Prefer apply_patch for edits.

## When

New module, quality review, naming/structure consistency, or lint/format setup. Not the primary source for React composition, API shape, or database layering.

## Principles

- Readability first: names that explain intent; comments only for why.
- KISS: simplest thing that works; no premature abstraction.
- DRY: extract after the second real copy, not the first guess.
- YAGNI: do not build unused extension points.

## Naming and types

- Variables and functions: descriptive; functions are verb-noun; booleans read as questions (`isReady`).
- No `any`. Prefer explicit types and narrow unions.
- Public APIs: JSDoc only when the signature is not enough.

## Immutability

Prefer copies (`{ ...obj, x }`, `[...items, next]`) over in-place mutation. Mutate only with a comment explaining why (hot path, required API).

## Control flow

- Early returns instead of deep nesting.
- Named constants instead of magic numbers.
- Parallel independent async work with `Promise.all`; do not serialize without a reason.
- Every `catch` handles, rethrows, or logs. Never swallow.

## Smells to flag

- Functions that do more than one job or run past ~50 lines without a split.
- Tests named `works` / `test search`.
- Implementation-detail tests instead of observable behavior.
- Copy-pasted blocks that already have a local helper.

Match formatter and lint config already in the repo. Do not introduce a new style tool unless asked.
