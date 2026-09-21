---
name: error-handling
description: Use when designing error types, retries, circuit breakers, or user-facing failure messages in TypeScript, Python, or Go.
triggers: [error, retry, circuit, exception, failure, timeout]
allowedTools: [read_file, search_files, apply_patch]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). Match the error style already used in this repo. Use read_file and search_files; apply_patch for edits.

## Principles

1. Fail at the boundary where the error is known. Do not bury it.
2. Typed errors over ad-hoc strings. Errors are part of the API contract.
3. User text ≠ developer text. Friendly to users; full context in logs.
4. Never swallow. Every `catch` handles, rethrows, or logs.
5. Document codes a client may receive.

## TypeScript

Prefer a small hierarchy (`AppError` + `code` + `statusCode`) or a `Result<T, E>` for expected failures (parse, HTTP). Map known errors to HTTP envelopes `{ error: { code, message } }`. Unexpected errors: log details, return a generic 500. Wrap React trees that can throw with an ErrorBoundary.

## Python

Custom exceptions with `code` / `status_code`. Framework handler returns JSON; log unexpected exceptions with traceback, generic body to clients.

## Go

Sentinel errors (`ErrNotFound`). Wrap with `%w`. Handlers switch on `errors.Is`; default 500 without leaking internals.

## Retry

Retry only transient failures (timeouts, 5xx, network). Never retry 4xx. Exponential backoff with jitter. Cap attempts and delay. Circuit-break a dependency that is persistently down.

## User copy

Map codes to stable sentences. No stack traces, SQL, or paths in the UI.

## Checklist

- [ ] No silent `catch`
- [ ] Stable error envelope
- [ ] User messages have no internals
- [ ] Server logs have context
- [ ] Retries skip client errors
- [ ] Async work is not fire-and-forget without a fallback
