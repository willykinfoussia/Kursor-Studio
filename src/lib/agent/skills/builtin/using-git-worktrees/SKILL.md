---
name: using-git-worktrees
description: Use after Build / planApproved, before mutating implementation files — create an in-place git branch in the open editor checkout (not a .worktrees copy)
---

# Using Git Worktrees (Kursor: in-place branch)

## Overview

After the human clicks **Build**, isolate implementation on a **new git branch in the open project**. Do not create `.worktrees/`. Do not copy the repo. The editor and Git panel follow `git checkout -b`.

**Core principle:** One working tree. Branch for the agent work. Merge back with `finishing-a-development-branch`.

**Announce at start:** "I'm using the using-git-worktrees skill to create an implementation branch."

## When

- `planApproved` is set (human clicked Build).
- Before any `write_file` / `apply_patch` / `create_file` / other source mutations.
- Not during Plan mode. The plan file is written on the current branch; the feature branch starts at implementation.

## Step 0: Detect Existing Branch

Call `git_branch` with `action: "status"` (or `git_status`).

**If the session already has an agent branch, or HEAD is already that branch:** skip create. Report: "Already on implementation branch `<name>` (base `<base>`)."

**If HEAD is `main` or `master`:** you must create a branch before mutating files. Never implement on main/master without explicit user consent.

**If the working tree is dirty (including `.kursor/plans/`):** do not create a branch yet. Call `git_commit` with the uncommitted files, then `git_push` if `origin` exists (if push fails, continue). Then `git_branch create`. Do not stash. Do not use `run_command` for git. Do not carry uncommitted files onto the agent branch.

## Step 1: Create the Branch

Use the native tool only:

```
git_branch action=create branch=<short-name>
```

- Default name if omitted: the harness picks `kursor-<slug-or-time>`.
- Prefer a readable name from the plan (`kursor-boxscore`, not a sentence).
- The tool records base = current branch, then `git checkout -b` in the editor checkout.
- Do **not** run `git worktree add`. Do **not** write under `.worktrees/`.
- Do **not** run `npm install` / `cargo build` as a "copy setup" step — there is no second tree.

If create fails because the tree is dirty, `git_commit` (then `git_push` if origin), then call `git_branch create` again.

## Step 2: Confirm

Report:

```
Implementation branch <name> (from <base>).
Editor checkout switched. Ready to implement.
```

Then continue executing-plans on this branch.

## Quick Reference

| Situation | Action |
|-----------|--------|
| Plan mode / writing the plan | Do not create a branch |
| Build just started, tree clean | `git_branch create` |
| Build, uncommitted files | `git_commit`, then `git_push` if origin, then `git_branch create` |
| Already on the session agent branch | Skip |
| Subagent implement | Do not create another branch; parent already checked out |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll use git worktree so the editor stays on main" | Kursor implements in the open checkout. A worktree copy hides diffs and breaks git tools. |
| "Plan mode should get a branch too" | The plan file is reviewed on the current branch. Branch at Build. |
| "The tree is a bit dirty — checkout -b will carry it" | Commit (and push if origin) first. Refuse until clean. |
| "I'll stash so I can branch" | Commit. Do not stash. |
| "I'm a subagent, I should make my own branch" | The parent created the branch. Implement in place. |
