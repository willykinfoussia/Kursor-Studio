---
name: code-review
description: Use when every plan todo is complete, before verification-before-completion, or when the user asks to review a branch, a PR, or work since a fixed point. Dispatches two review subagents (Standards and Spec) and applies their findings.
---

# Code Review

Review the diff between `HEAD` and a fixed point on two axes. Do not judge the diff yourself. Dispatch two isolated `review` subagents in the same turn, then aggregate and act.

**Core principle:** Review the branch once, before verification. A `Critical` issue blocks the next implement task.

## When

Once, after every plan todo is complete, before `verification-before-completion` and `finish_development_branch`. Also when the user asks to review a branch, a PR, or changes since a fixed point.

Not after every todo. Not a per-task loop.

## 1. Pin the fixed point

Default fixed point: the implementation branch base. If the user named a commit, branch, tag, or `main`, use that.

Call `git_diff` with `from` set to `<fixed-point>...HEAD` (three dots, so the comparison is against the merge-base).

If the ref is invalid or the diff is empty, stop. Do not dispatch reviewers.

## 2. Spec source

1. The approved plan for this session (the plan body).
2. A path the user passed.
3. If nothing is found, skip the Spec subagent and report "no spec available".

## 3. Standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the smell baseline below. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins. Where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic, never a hard violation. Skip anything tooling already enforces.

Paste this baseline into the Standards prompt. The subagent has no other copy.

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design is murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together. → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if` cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

## 4. Dispatch both review subagents

Dispatch two `review` subagents in the same response. Do not review the diff inline. Do not pass session history. Each reviewer follows only the axis in its prompt. Reviewers cannot spawn further agents.

**Standards prompt** includes:

- The `git_diff` `from` value (`<fixed-point>...HEAD`).
- The standards files you found, plus the smell baseline pasted in full.
- The brief: "Call git_diff with that from. Report (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Documented-standard breaches can be hard. Baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words. Put hard violations only in issues, each prefixed Critical:, Important:, or Minor:. Put smells in findings, never as Critical."

**Spec prompt** includes:

- The same `git_diff` `from` value.
- The plan or spec text.
- The brief: "Call git_diff with that from. Report (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for; (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words. Missing or wrong requirements are Critical: or Important:. Scope creep is Important: or Minor:. Put those only in issues. Use the same prefixes."

If the spec is missing, skip the Spec subagent and note that in the final report.

## 5. Aggregate

Present the two reports under `## Standards` and `## Spec`. Do not merge or rerank findings. The two axes stay separate: code can follow every standard and still implement the wrong thing, or match the spec and break the repo's conventions.

End with one line: finding counts per axis, and the worst issue within each axis.

## 6. Act on findings

The harness blocks the next `implement` subagent while any review `issues` entry contains Critical.

- Fix Critical immediately, before another implement task.
- Fix Important before `finish_development_branch`.
- Note Minor for later.
- Push back when the finding is wrong. Show the code or tests that prove it.

Before editing:

1. Read the full feedback.
2. If any item is unclear, ask before implementing any of them.
3. Verify the finding against this codebase. Check that it does not break existing behavior.
4. If it suggests a feature nothing calls, say so (YAGNI) instead of building it.
5. Implement one item at a time: blocking, then simple, then complex.

Do not write performative agreement ("You're absolutely right", "Great point", "Thanks"). State the fix, or the technical reason you are not applying it.

If you pushed back and were wrong, say what you checked and implement.
