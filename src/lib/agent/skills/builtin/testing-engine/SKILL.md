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

For each behavior:

1. Name the behavior, including a boundary, an invalid input, or an error path. Do not stop at the happy path.
2. Write a failing test (Arrange, Act, Assert). Keep it isolated and deterministic.
3. Run the unit suite and read the failure.
4. Implement the smallest change that makes it pass.
5. Run the unit suite again.
6. Refactor only while the suite stays green.

A bug fix starts with a regression test that fails before the fix.

## After the implementation

Integration tests cover real boundaries (API to database, service to service) when those boundaries exist. End-to-end tests cover critical user cases only: authentication, the main create/update flow, payment, and the primary journey. Link each end-to-end test to a user case id from `.kursor/user-cases.json`.

Do not claim the task is done because the code compiles. The verification harness runs the levels the strategy marks as applicable.
