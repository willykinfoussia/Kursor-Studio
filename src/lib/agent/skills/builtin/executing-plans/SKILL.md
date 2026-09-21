---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**REQUIRED SUB-SKILL:** `load_skill` `test-driven-development` before writing implementation code. RED then GREEN for each todo.

Do **not** orchestrate a review subagent per task. You implement in this session. Explore subagents are for brainstorming and planning only. If you do spawn `implement` or `review` subagents, dispatch at least two in the same response; a single spawn is rejected.

## The Process

### Step 1: Load and Review Plan
1. If the working tree is dirty, `git_commit` then `git_push` if origin exists. Then create the implementation branch: `load_skill` using-git-worktrees, then `git_branch` `create` in the open checkout. Skip if already on the session agent branch. Do not use `.worktrees/`. Do not stash. Do not use `run_command` for git.
2. Read plan file
3. Review critically - identify any questions or concerns about the plan
4. If concerns: Raise them with your human partner before starting
5. If no concerns: Create todos for the plan items and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow the todo's Goal, Files, Implementation, Done when, and Verification. Apply TDD when writing code even if the plan has no RED/GREEN micro-steps
3. Run the focused tests for that todo (the harness does not run the project suite while the todo is in progress)
4. Mark as completed

### Step 3: Complete Development

After **every** plan todo is completed:
- **REQUIRED SUB-SKILL:** `load_skill` `verification-before-completion`
- Run the verification commands yourself this turn. Do not trust a subagent report as evidence.
- Then announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
- Follow that skill to present merge / PR / keep / discard

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
