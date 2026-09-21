---
name: api-design
description: Use when designing or reviewing REST endpoints, resource names, status codes, pagination, filtering, or versioning.
triggers: [api, rest, endpoint, pagination, versioning, http]
allowedTools: [read_file, search_files, apply_patch]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). Follow existing routes in this repo. Use read_file and search_files; apply_patch for edits.

## Resources

Nouns, plural, lowercase, kebab-case: `/api/v1/users/:id/orders`. No verbs in paths except true actions (`POST /orders/:id/cancel`, `POST /auth/login`). Query params for filters, not `/getUsers`.

## Methods and status

| Method | Use |
| GET | Read |
| POST | Create or action |
| PUT | Full replace |
| PATCH | Partial update |
| DELETE | Remove |

Success: 200 with body, 201 + Location on create, 204 on empty delete. Client: 400/422 validation, 401 auth, 403 forbidden, 404 missing, 409 conflict, 429 rate limit. Server: 500 generic, 503 + Retry-After. Never wrap a failure in HTTP 200.

## Envelope

```
{ "data": { ... } }
{ "data": [...], "meta": { "total", "page", "per_page" }, "links": { "self", "next" } }
{ "error": { "code", "message", "details": [{ "field", "message" }] } }
```

Internal APIs may return the resource flat and distinguish by status. Stay consistent with this repo.

## Pagination

Offset (`page`, `per_page`) for small sets and search UI. Cursor for feeds and large tables. Public APIs default to cursor.

Filter with query params (`status=active`, `price[gte]=10`). Sort with `sort=-created_at,name`. Optional `fields=` to shrink payloads.

## Auth and limits

Bearer or API key as the project already does. Check ownership or role before returning or mutating. Send `X-RateLimit-*` and 429 with Retry-After.

## Versioning

Path `/api/v1` when you version. Additive fields do not need a bump. Removals, type changes, URL or auth changes do. At most current + previous. Announce deprecation; then 410.

## Before shipping an endpoint

- [ ] Plural kebab URL, right method and status
- [ ] Schema validation
- [ ] Standard error body, no stack/SQL leak
- [ ] Pagination on lists
- [ ] Authn/authz explicit (or documented public)
- [ ] Rate limit where exposed
- [ ] OpenAPI or existing docs updated if the project has them
