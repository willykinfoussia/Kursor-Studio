---
name: testing-engine
description: Use when writing or running tests during a Build. The persisted testing strategy chooses the runner. Do not pick a second framework.
---

# Testing Engine

The Testing Engine decides how this project is tested. You write the tests. The runner executes them.

## Before writing a test

1. Read the persisted strategy (the Test Monitoring plan, or ask the runtime to discover it).
2. Use the runner it names. If Vitest is already in the project, do not add Jest. If Cypress is already in the project, do not add Playwright.
3. Web UI with no end-to-end runner uses Playwright. CLI, library, and backend-only projects do not get a user-interface end-to-end suite.

## Unit cycle

Follow `test-driven-development` for each behavior: one public seam, a failing test, then the minimum code, with RED and GREEN evidence from the runner this strategy names. A bug fix starts with a regression test that fails before the fix.

## After the implementation

Integration tests cover real boundaries (API to database, service to service) when those boundaries exist. End-to-end tests cover critical user cases only: authentication, the main create/update flow, payment, and the primary journey. Link each end-to-end test to a user case id from `.kursor/user-cases.json`.

Do not claim the task is done because the code compiles. The verification harness runs the levels the strategy marks as applicable.
