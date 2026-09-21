---
name: security-review
description: Use when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment or other sensitive features.
triggers: [security, auth, authentication, authorization, secrets, xss, csrf, injection]
allowedTools: [read_file, search_files, list_files, git_status, git_diff]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). Read-only review. Do not edit files unless the user asks to fix findings.

Inspect with search_files, read_file, git_status, and git_diff. Prefer evidence from this checkout over generic advice.

## When

Auth, user input, uploads, new HTTP endpoints, secrets, payments, PII, or third-party APIs.

## Checklist

### Secrets
- No hardcoded keys, tokens, or passwords.
- Secrets from the environment; fail if missing.
- `.env` / `.env.local` gitignored; none in git history or client bundles.

### Input
- Validate with a schema (whitelist, not blacklist).
- Uploads: size, type, and extension checks.
- Never concatenate user input into SQL, shell, or HTML.
- Error text must not leak internals.

### Queries
- Parameterized queries or a query builder only.
- No string-built SQL.

### Authz
- Check authorization before every sensitive mutation.
- Tokens in httpOnly Secure SameSite cookies, not localStorage.
- Server-side enforcement; do not trust the client.

### XSS / CSRF
- Sanitize user HTML; keep CSP strict (`script-src 'self'`).
- CSRF tokens or SameSite on state-changing routes.

### Rate limits and data
- Rate-limit APIs; tighter limits on expensive routes.
- No secrets, cards, or passwords in logs.
- Generic 5xx to clients; details only in server logs.

### Dependencies
- If the user asks to scan, run the project audit via run_command (for example `pnpm audit`). Do not invent an audit tool.

## Report

List only issues you verified in this repo:

1. Finding (file + what is wrong)
2. Impact
3. Fix (concrete)

Skip sections that do not exist here (for example blockchain). If you cannot inspect a path, say so.
