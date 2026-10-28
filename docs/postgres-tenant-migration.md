# PostgreSQL tenant migration harness

PR 1 builds the target schema and migration tooling without switching the live Avenlyo runtime away from JSON/SQLite.

## Environment

```env
DATABASE_ADMIN_URL=postgresql://...
DATABASE_IMPORTER_URL=postgresql://...
DATABASE_URL=postgresql://...
AVENLYO_DEV_WORKSPACE_ID=<uuid>
```

`DATABASE_ADMIN_URL` is only for role/schema bootstrap and migrations. The application runtime must eventually use a least-privilege `avenlyo_runtime` credential through `DATABASE_URL`.

## Database setup

```bash
npm run db:bootstrap
npm run db:migrate
```

The PostgreSQL environment must provide the `vector` extension.

## Legacy migration workflow

Planning creates a consistent source snapshot. SQLite is copied with the SQLite Backup API rather than by copying a live WAL-mode database file.

```bash
npm run legacy:migrate -- plan \
  --source ./data \
  --manifest ./migration/legacy-manifest.json

npm run legacy:migrate -- dry-run \
  --manifest ./migration/legacy-manifest.json

npm run legacy:migrate -- apply \
  --manifest ./migration/legacy-manifest.json

npm run legacy:migrate -- apply \
  --manifest ./migration/legacy-manifest.json \
  --resume

npm run legacy:migrate -- verify \
  --manifest ./migration/legacy-manifest.json
```

`plan` snapshots `avenlyo.json`, `knowledge.db` and uploads; records SHA-256 hashes, row counts, orphan counts and embedding dimensions.

`dry-run` performs the PostgreSQL inserts in a transaction and rolls everything back. It must leave no target user-data delta.

`apply` checkpoints phases in the manifest. Existing rows are never blindly overwritten: a conflicting target row with different values raises `CONFLICT_DIVERGENCE`.

`verify` compares source/target counts, checks RLS/FORCE RLS coverage and verifies copied upload hashes.

## Rollback boundary

Before runtime cutover, rollback is safe because the legacy source is copied, never moved or deleted:

```bash
npm run legacy:migrate -- rollback \
  --manifest ./migration/legacy-manifest.json
```

This deletes the imported target workspace and its workspace-local copied files. It does **not** delete the legacy JSON, SQLite database or original uploads.

After PostgreSQL starts accepting new production writes, returning to SQLite is not automatically lossless. That future cutover must use write-freeze → final snapshot → import/verify → security smoke tests → runtime switch → write-enable.

## PR 1 non-goals

- no authentication rollout,
- no production deployment,
- no real tenant switcher,
- no billing,
- no third-party integration activation,
- no deletion of current local data,
- no PostgreSQL runtime cutover.
