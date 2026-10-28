import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
let pool: Pool;
let workspaceA: string;
let workspaceB: string;
const hash = "a".repeat(64);

describeDb("tenant composite constraints", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    workspaceA = randomUUID();
    workspaceB = randomUUID();
    await pool.query(
      `INSERT INTO app.workspaces (id,slug,name)
       VALUES ($1,$2,'FK A'),($3,$4,'FK B')`,
      [workspaceA, `fk-a-${workspaceA.slice(0,8)}`, workspaceB, `fk-b-${workspaceB.slice(0,8)}`],
    );
    await pool.query(
      `INSERT INTO app.agents
       (workspace_id,id,name,emoji,role,goal,instructions,model,created_at,updated_at)
       VALUES ($1,'agent-a','A','✦','','','','test',now(),now())`,
      [workspaceA],
    );
    await pool.query(
      `INSERT INTO app.documents
       (workspace_id,id,name,original_name,mime_type,extension,size_bytes,sha256,status,
        page_count,chunk_count,extraction_method,ocr_page_count,error,storage_key,created_at,updated_at)
       VALUES
       ($1,'doc-a','A','a.txt','text/plain','.txt',1,$3,'ready',null,0,'native',0,null,'a',now(),now()),
       ($2,'doc-b','B','b.txt','text/plain','.txt',1,$3,'ready',null,0,'native',0,null,'b',now(),now())`,
      [workspaceA, workspaceB, hash],
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM app.workspaces WHERE id IN ($1,$2)", [workspaceA, workspaceB]);
      await pool.end();
    }
  });

  it("allows the same document hash in different workspaces", async () => {
    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM app.documents WHERE sha256=$1 AND workspace_id IN ($2,$3)",
      [hash, workspaceA, workspaceB],
    );
    expect(Number(result.rows[0]?.count)).toBe(2);
  });

  it("rejects cross-workspace agent-document assignment at FK level", async () => {
    await expect(
      pool.query(
        `INSERT INTO app.agent_documents (workspace_id,agent_id,document_id,created_at)
         VALUES ($1,'agent-a','doc-b',now())`,
        [workspaceA],
      ),
    ).rejects.toThrow();
  });

  it("scopes CRM idempotency by workspace", async () => {
    await pool.query(
      `INSERT INTO app.crm_contacts
       (workspace_id,id,name,idempotency_key,created_at)
       VALUES ($1,'crm-a','A','shared-key',now()),($2,'crm-b','B','shared-key',now())`,
      [workspaceA, workspaceB],
    );
    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM app.crm_contacts WHERE idempotency_key='shared-key' AND workspace_id IN ($1,$2)",
      [workspaceA, workspaceB],
    );
    expect(Number(result.rows[0]?.count)).toBe(2);
  });
});
