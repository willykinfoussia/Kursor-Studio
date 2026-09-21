---
name: git-workflow
description: Use when choosing a branching strategy, writing commit messages, deciding merge versus rebase, or resolving conflicts.
triggers: [git, branch, commit, rebase, merge, conflict, pull-request]
allowedTools: [git_status, git_diff, git_commit, git_push, git_pull, git_fetch, read_file, run_command]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). Inspect with git_status and git_diff. Commit with git_commit. Publish with git_push / git_pull / git_fetch (authenticated). Do not use run_command for remote git. Never rewrite published history (`push --force` on main).

## Branching

Prefer GitHub Flow unless the repo already uses something else: `main` always deployable; short feature branches; PR; merge when CI is green.

Trunk-based: tiny branches or direct-to-main with flags. GitFlow: scheduled releases (`develop`, `release/*`, `hotfix/*`). Follow existing branch names (`feature/…`, `fix/…`).

## Commits

Conventional Commits: `type(scope): subject` in imperative mood.

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, revert.

Bad: `fixed stuff`, `updates`, `WIP`. Good: why, not only what. `Closes #n` in the footer when it does.

## Merge vs rebase

Merge into `main` to preserve shared history. Rebase a local-only feature onto latest main before the PR. Never rebase a branch others already based work on, or protected branches.

## PR

Title matches commit types. Body: what, why, how, how tested. Keep PRs focused. Reviewers: correctness, edges, tests, security. Authors: self-review, CI green.

## Conflicts

Use git_status / git_diff to see them. Resolve by editing files (ask to apply patches), then the user commits. `--ours` / `--theirs` only with an explicit choice. Prevent conflicts: small branches, rebase often, merge promptly.

## Release

Semver MAJOR.MINOR.PATCH. Annotated tags if the repo already tags. Changelog from conventional commits if asked.

## Anti-patterns

- Committing to main when the repo uses PRs
- Committing `.env`, `dist/`, `node_modules/`
- Vague messages
- Force-pushing `main` (revert instead)
- Giant long-lived branches
