import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
let pool: Pool;
let workspaceA: string;
let workspaceB: string;

async function asRuntime<T>(
  client: PoolClient,
  workspaceId: string | null,
  operation: () => Promise<T>,
) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE avenlyo_runtime");
    if (workspaceId) {
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    }
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

describeDb("PostgreSQL RLS isolation", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    workspaceA = randomUUID();
    workspaceB = randomUUID();

    await pool.query(
      `INSERT INTO app.workspaces (id, slug, name)
       VALUES ($1, $2, 'Workspace A'), ($3, $4, 'Workspace B')
       ON CONFLICT (id) DO NOTHING`,
      [workspaceA, `a-${workspaceA.slice(0, 8)}`, workspaceB, `b-${workspaceB.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO app.agents
       (workspace_id,id,name,emoji,role,goal,instructions,model,created_at,updated_at)
       VALUES
       ($1,'agent-a','A','✦','','','','test',now(),now()),
       ($2,'agent-b','B','✦','','','','test',now(),now())
       ON CONFLICT DO NOTHING`,
      [workspaceA, workspaceB],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("shows only the active workspace rows", async () => {
    const client = await pool.connect();
    try {
      const result = await asRuntime(client, workspaceA, () =>
        client.query<{ id: string }>("SELECT id FROM app.agents ORDER BY id"),
      );
      expect(result.rows.map((row) => row.id)).toEqual(["agent-a"]);
    } finally {
      client.release();
    }
  });

  it("fails closed when tenant context is missing", async () => {
    const client = await pool.connect();
    try {
      await expect(
        asRuntime(client, null, () => client.query("SELECT id FROM app.agents")),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("rejects a cross-tenant insert", async () => {
    const client = await pool.connect();
    try {
      await expect(
        asRuntime(client, workspaceA, () =>
          client.query(
            `INSERT INTO app.agents
             (workspace_id,id,name,emoji,role,goal,instructions,model,created_at,updated_at)
             VALUES ($1,'forged','Forged','✦','','','','test',now(),now())`,
            [workspaceB],
          ),
        ),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("does not leak tenant context across pooled transactions", async () => {
    const client = await pool.connect();
    try {
      await asRuntime(client, workspaceA, () => client.query("SELECT id FROM app.agents"));
      await expect(
        asRuntime(client, null, () => client.query("SELECT id FROM app.agents")),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("keeps the runtime role least-privileged", async () => {
    const result = await pool.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
       FROM pg_roles WHERE rolname = 'avenlyo_runtime'`,
    );
    expect(result.rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
    });
    const privilege = await pool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('avenlyo_runtime','app.documents','TRUNCATE') AS allowed`,
    );
    expect(privilege.rows[0]?.allowed).toBe(false);
  });
});
