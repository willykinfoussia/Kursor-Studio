---
name: finishing-a-development-branch
description: Use when implementation is complete and all tests pass, so the feature branch must be merged locally into its base
---

# Finishing a Development Branch

## Overview

**Core principle:** Verify tests → Merge locally into the base branch → Resolve conflicts if the merge stops → Push the base.

Kursor uses **one working tree**. The agent branch is an in-place `checkout -b`, not a `.worktrees/` copy. Cleanup is checkout base + delete the feature branch.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

The only integration is a local merge. Call `finish_development_branch`. Do not merge after each todo — only after **every** plan todo is complete.

## Step 1: Verify Tests

Run the project's full test suite (`npm test` / `cargo test` / `pytest` / `go test ./...`).

**If tests fail**, report the failures and stop. Do not merge a red suite.

**If tests pass:** call `finish_development_branch`.

## Step 2: Base Branch

The harness stored `agentBranch.base` when it created the branch. Use that. If missing, ask: "This branch split from &lt;your best guess&gt; — is that correct?" Confirm before merging.

## Step 3: Merge locally

Do not `run_command` `git merge` / `git checkout` / `git push` for this step. The tool does it.

The harness: checkout `base` → `git merge --no-edit` feature.

Then re-run tests on the merged tree. If tests fail: stop, leave the merge and feature branch, investigate.

If tests pass: the harness deletes the feature branch with `git branch -d`, then pushes the base.

### Merge conflicts

If merge returns conflicts:

1. Do **not** delete the feature branch.
2. Read each conflicted file. Edit markers (`<<<<<<<` / `=======` / `>>>>>>>`) with `write_file` or `apply_patch`.
3. Call `finish_development_branch` again (continues the in-progress merge).
4. Never `--force` to "finish" a conflicted merge.

## Quick Reference

| Step | What happens |
|------|----------------|
| Tests fail | Stop. Leave the feature branch. |
| Tests pass | Checkout base, merge feature, delete the feature branch, then push the base. |
| Conflicts | Edit markers, then call `finish_development_branch` again. No push until the merge finishes. |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. |
| "I'll open a pull request, keep the branch, or discard it" | The only finish is a local merge. |
| "I'll merge after this one todo" | Finish only when every plan todo is complete. |
| "Conflicts — I'll abort and start over" | Resolve markers, then continue the merge. |
| "The base is obviously main" | Use `agentBranch.base` or ask. |
| "I'll git worktree remove to clean up" | There is no worktree. Checkout base and delete the branch. |
