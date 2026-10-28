import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
let pool: Pool;

describeDb("PostgreSQL tenant core schema", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const roles = await readFile(path.join(process.cwd(), "db", "roles.sql"), "utf8");
    const schema = await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    await pool.query(roles);
    await pool.query(schema);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates every tenant table with workspace_id", async () => {
    const tenantTables = [
      "business_profiles","workspace_memberships","agents","documents","chunks",
      "agent_documents","conversations","chat_messages","workspace_tools","agent_tools",
      "crm_contacts","tool_runs","tool_approvals","tool_run_attempts","tool_audit_events",
    ];
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.columns
       WHERE table_schema = 'app' AND column_name = 'workspace_id'`,
    );
    const actual = new Set(result.rows.map((row) => row.table_name));
    for (const table of tenantTables) expect(actual.has(table)).toBe(true);
  });

  it("enables and forces RLS on tenant tables", async () => {
    const result = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app'
         AND c.relname IN (
           'workspaces','business_profiles','workspace_memberships','agents','documents','chunks',
           'agent_documents','conversations','chat_messages','workspace_tools','agent_tools',
           'crm_contacts','tool_runs','tool_approvals','tool_run_attempts','tool_audit_events'
         )`,
    );
    expect(result.rows.length).toBe(16);
    for (const row of result.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it("uses tenant-scoped uniqueness for document hash and CRM idempotency", async () => {
    const result = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'app'
         AND tablename IN ('documents', 'crm_contacts')`,
    );
    const ddl = result.rows.map((row) => row.indexdef).join("\n");
    expect(ddl).toContain("(workspace_id, sha256)");
    expect(ddl).toContain("(workspace_id, idempotency_key)");
  });
});
