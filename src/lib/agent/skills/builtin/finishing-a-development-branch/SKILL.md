---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work
---

# Finishing a Development Branch

## Overview

**Core principle:** Verify tests → Present options → Execute choice (merge / PR / keep / discard) → Resolve conflicts if merge stops.

Kursor uses **one working tree**. The agent branch is an in-place `checkout -b`, not a `.worktrees/` copy. Cleanup is checkout base + delete the feature branch.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

Call `finish_development_branch` **without** `choice` so the human gets merge / pr / keep / discard. Do not invent a fourth option. Do not merge after each todo — only after **every** plan todo is complete.

## Step 1: Verify Tests

Run the project's full test suite (`npm test` / `cargo test` / `pytest` / `go test ./...`).

**If tests fail**, report the failures and stop — the menu comes after a green suite.

**If tests pass:** call `finish_development_branch` with no `choice`.

## Step 2: Base Branch

The harness stored `agentBranch.base` when it created the branch. Use that. If missing, ask: "This branch split from &lt;your best guess&gt; — is that correct?" Confirm before merging.

## Step 3: Present Options

The tool presents exactly:

1. Merge back to &lt;base-branch&gt; locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard (only if the human asked to throw the work away)

Wait. Integration is theirs.

## Step 4: Execute Choice

Use `finish_development_branch` with `choice`: `merge` | `pr` | `keep` | `discard`. Do not `run_command` `git merge` / `git push` / `git checkout` for this step.

### Merge locally

The harness: checkout `base` → `git merge --no-edit` feature.

Then re-run tests on the merged tree. If tests fail: stop, leave the merge and feature branch, investigate.

If tests pass: the harness deletes the feature branch with `git branch -d`.

### Merge conflicts

If merge returns conflicts:

1. Do **not** delete the feature branch. Do **not** `--abort` unless the human chooses discard.
2. Read each conflicted file. Edit markers (`<<<<<<<` / `=======` / `>>>>>>>`) with `write_file` or `apply_patch`.
3. Call `finish_development_branch` again with `choice: "merge"` (continues the in-progress merge) or commit the resolved index.
4. Never `--force` to "finish" a conflicted merge.

### Push and create PR

Stay on the feature branch. `git_push`, then `finish_development_branch` `choice: "pr"`. Base of the PR is `agentBranch.base`, not a hardcoded `main`. Keep the branch for PR feedback.

### Keep as-is

Stay on the feature branch. Report the name. No checkout back to base.

### Discard

Only after an explicit request to throw the work away. The harness aborts a merge in progress if needed, checkouts `base`, force-deletes the feature branch.

## Quick Reference

| Option | Checkout base | Merge | Push | Keep feature branch |
|--------|---------------|-------|------|---------------------|
| Merge locally | yes | yes | no | delete after green |
| Create PR | no | no | yes | yes |
| Keep as-is | no | no | no | yes |
| Discard | yes | abort if needed | no | force-delete |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. |
| "They obviously want it merged" | Present the menu and wait. |
| "I'll merge after this one todo" | Finish only when every plan todo is complete. |
| "Conflicts — I'll abort and start over" | Resolve markers, then continue. Abort is discard. |
| "The base is obviously main" | Use `agentBranch.base` or ask. |
| "I'll git worktree remove to clean up" | There is no worktree. Checkout base and delete the branch. |
