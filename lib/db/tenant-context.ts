import { sql, type Transaction } from "kysely";
import { getPostgresDb } from "./pool";
import type { Database } from "./types";

export type WorkspaceContext = {
  workspaceId: string;
  source: "development" | "auth";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertWorkspaceId(value: string) {
  if (!UUID_RE.test(value)) {
    throw new Error("Geçersiz workspace kimliği.");
  }
  return value;
}

export function developmentWorkspaceContext(): WorkspaceContext {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Production ortamında development workspace fallback kullanılamaz.");
  }
  const workspaceId = process.env.AVENLYO_DEV_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    throw new Error("AVENLYO_DEV_WORKSPACE_ID tanımlı değil.");
  }
  return { workspaceId: assertWorkspaceId(workspaceId), source: "development" };
}

export async function withWorkspaceTransaction<T>(
  context: WorkspaceContext,
  operation: (trx: Transaction<Database>) => Promise<T>,
) {
  const workspaceId = assertWorkspaceId(context.workspaceId);
  return getPostgresDb().transaction().execute(async (trx) => {
    await sql`select set_config('app.workspace_id', ${workspaceId}, true)`.execute(trx);
    return operation(trx);
  });
}
