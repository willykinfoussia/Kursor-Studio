---
name: intent-driven-development
description: Use when a user asks to clarify a feature, define acceptance criteria, de-risk a security/data/migration/integration change, or make a complex request testable. Do not trigger for trivial edits, debugging, or code review.
triggers: [acceptance, criteria, intent, requirements, specification]
allowedTools: [read_file, search_files, list_files]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). Inspect with list_files, search_files, and read_file. Do not write files, commit, or load another skill unless the user asks.

`$ARGUMENTS` is optional feature context.

## When

Clarify, de-risk, or hand off before implementation. Skip one-line fixes, active debugging, review, or work whose acceptance is already clear.

## Rules

1. Discover technical facts from the repo first. Do not infer business rules, SLAs, pricing, retention, or target users from code — list those as assumptions until the user or a PRD states them.
2. Ask only questions that change scope or safety. Group them.
3. Do not block implementation by default. If the user asked to build a clear change, record criteria and continue.
4. Require confirmation only for security exposure, data loss, irreversible migration, contract breakage, real cost, or destructive external action.
5. No secrets or production PII in criteria or examples.
6. No destructive tests, live migrations, or paid calls without an identified safe environment and explicit OK.
7. If an AC cannot be met, mark it `[revised]`, explain the constraint, and re-present only the changed criteria.

## Depth

**Quick Capture** (low/moderate risk): goal, in/out of scope, assumptions, 3–7 ACs, blockers if any.

**Full brief** (auth, data, migration, cross-system, compliance, or a handoff): template below, wait on blockers.

**Existing spec:** review it; do not restart discovery.

## Each AC-NNN

Scenario, action, expected observable result, must-not, verification method, priority (required / important / optional). No "correctly", "securely", "fast" without evidence.

Fail: `The export works correctly and is secure.`
Pass: authenticated user clicks Export CSV → file with columns `[id, name, created_at]`; must not include other users' rows; integration test + schema spot-check.

## Full template (omit unused sections)

```
# Acceptance Brief: <name>
Status / Revision / Approval required before risky work: Yes|No

Goal: one observable sentence
In scope / Out of scope
Discovered facts (from repo) vs product constraints (from user) vs assumptions
Risk table: security, data, external cost, API, UX — only rows that apply
AC-001 … with scenario/action/expected/must-not/verification/priority
Blocking decisions (only those that stop safe progress)
Verification plan
```
