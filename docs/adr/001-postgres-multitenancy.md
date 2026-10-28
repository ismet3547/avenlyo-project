# ADR-001 — PostgreSQL multi-tenant foundation

## Status

Accepted for the SaaS foundation phase.

## Decision

Avenlyo will migrate from the current JSON + SQLite + local-files persistence model to PostgreSQL 18 using:

- shared schema with mandatory `workspace_id` on tenant-owned rows,
- composite primary/foreign keys for tenant-owned relationships,
- application-side workspace scoping,
- PostgreSQL Row Level Security with `FORCE ROW LEVEL SECURITY`,
- transaction-local tenant context via `set_config('app.workspace_id', ..., true)`,
- Kysely for typed runtime SQL and `pg` for bootstrap/importer work,
- pgvector exact search first; ANN indexes are deferred until benchmark data justifies them.

The current application runtime remains on JSON/SQLite during PR 1. PostgreSQL becomes the runtime source of truth only after domain-by-domain cutover and the two-workspace security gate.

## Security invariants

1. Client-supplied `workspaceId` is never an authorization source.
2. Production must not use `AVENLYO_DEV_WORKSPACE_ID` as a fallback.
3. `avenlyo_runtime` is not a table owner, superuser, `BYPASSRLS`, schema owner or DDL role.
4. Tenant context is set inside the same transaction/connection used for tenant queries.
5. Missing tenant context fails closed.
6. Tenant-owned references use composite keys so cross-workspace assignments fail at DB level.
7. Document SHA and CRM idempotency uniqueness are scoped by workspace.

## Legacy ID policy

Existing tenant entity IDs remain `text` because legacy IDs such as `welcome-agent` are not UUIDs. New top-level workspace/user IDs use UUID.

## Deferred decisions

Authentication provider, production PostgreSQL provider, object-storage provider, billing and third-party integrations are out of scope for this phase.
