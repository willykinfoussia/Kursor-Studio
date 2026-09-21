---
name: production-audit
description: Use when auditing production readiness before launch, after a merge, or when asked what would break in production. Local evidence only.
triggers: [production, launch, ship, audit, readiness, rollback]
allowedTools: [read_file, search_files, list_files, git_status, git_diff, run_command, fetch_url]
version: "1.0"
enabled: true
---
Adapted from ECC community rewrite (MIT). Do not upload the repo to an external auditor. Do not run unpinned `npx …@latest` scanners. fetch_url only against a URL the user authorized.

## When

"Ready to ship?", "what breaks in prod?", post-merge risk, launch/demo soon, CI green but production risk is the question.

Skip: line-level secure coding (load security-review), libraries/docs-only unless asked for release packaging, formal compliance, or idea-only with no repo.

## Evidence

1. Release surface (app vs lib, what actually deploys).
2. git_status, git_diff, recent files — not assumed main.
3. Auth, data, payments, jobs, AI tools, deploy manifests that exist.
4. CI, tests, migrations, env docs, rollback.
5. Ship/block with specific fixes.

Read package scripts, workflows, Docker, routes, workers, migrations, `.env.example`, health/logging, E2E for critical paths. A deployed URL: unauthenticated checks only unless the user gave a test account.

## Lenses

**Security:** public vs admin routes; server-side authz; secrets out of client/logs/git; rate limits, CSRF, CORS, uploads; agent/tool surfaces must not treat untrusted content as instructions.

**Data:** forward migrations; rollback/recovery; tenancy vs grants; idempotent retries.

**Payments:** verify webhook signatures; idempotent fulfillment; replay/duplicates; test vs live keys.

**Ops:** documented boot; required env fail-fast; health checks; deploy/rollback/owner; logs without PII.

**UX:** launch paths on desktop/mobile; loading/empty/error/denied states.

## Score (prioritization, not precision)

0–49 blocked · 50–69 risky · 70–84 launchable with caveats · 85–100 strong.

Cap 69 if missing authz on sensitive data, non-idempotent payment webhooks, unsafe migrations, leaked secrets, or no rollback for a high-impact release. Cap 84 if CI is red or the critical path has no E2E.

## Output

One sentence: `Production audit: 76/100, launchable with caveats, …`

Then Blockers, High-value fixes, Evidence checked, Evidence missing, Next action (one step). Green CI is not production readiness.
