import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WorkspaceTable {
  id: Generated<string>;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface AgentTable {
  workspace_id: string;
  id: string;
  name: string;
  emoji: string;
  role: string;
  goal: string;
  instructions: string;
  model: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DocumentTable {
  workspace_id: string;
  id: string;
  name: string;
  original_name: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  sha256: string;
  status: "processing" | "ready" | "error";
  page_count: number | null;
  chunk_count: number;
  extraction_method: string | null;
  ocr_page_count: number;
  error: string | null;
  storage_key: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Database {
  "app.workspaces": WorkspaceTable;
  "app.agents": AgentTable;
  "app.documents": DocumentTable;
}

export type WorkspaceRow = Selectable<WorkspaceTable>;
export type NewWorkspace = Insertable<WorkspaceTable>;
export type WorkspaceUpdate = Updateable<WorkspaceTable>;
