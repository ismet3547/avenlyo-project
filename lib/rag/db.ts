import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ExtractionMethod,
  KnowledgeDocument,
  KnowledgeStatus,
} from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const databasePath = path.join(dataDir, "knowledge.db");

type DocumentRow = {
  id: string;
  name: string;
  original_name: string;
  mime_type: string;
  extension: string;
  size: number;
  sha256: string;
  status: KnowledgeStatus;
  page_count: number | null;
  chunk_count: number;
  extraction_method: ExtractionMethod | null;
  ocr_page_count: number;
  error: string | null;
  stored_path: string;
  created_at: string;
  updated_at: string;
};

type ChunkRow = {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  text: string;
  token_count: number;
  page_start: number | null;
  page_end: number | null;
  embedding: string;
  extraction_method: "native" | "ocr";
  ocr_confidence: number | null;
};

export type StoredKnowledgeDocument = KnowledgeDocument & {
  storedPath: string;
};

export type StoredChunk = {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  embedding: number[];
  extractionMethod: "native" | "ocr";
  ocrConfidence: number | null;
};

export type ChunkInsert = Omit<StoredChunk, "documentName">;

function mapDocument(row: DocumentRow): StoredKnowledgeDocument {
  return {
    id: row.id,
    name: row.name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    extension: row.extension,
    size: row.size,
    sha256: row.sha256,
    status: row.status,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    extractionMethod: row.extraction_method ?? null,
    ocrPageCount: row.ocr_page_count ?? 0,
    error: row.error,
    storedPath: row.stored_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicDocument(document: StoredKnowledgeDocument): KnowledgeDocument {
  const { storedPath: _storedPath, ...rest } = document;
  return rest;
}

function mapChunk(row: ChunkRow): StoredChunk {
  let embedding: number[] = [];
  try {
    const parsed = JSON.parse(row.embedding) as unknown;
    if (Array.isArray(parsed)) {
      embedding = parsed.filter((item): item is number => typeof item === "number");
    }
  } catch {
    embedding = [];
  }

  return {
    id: row.id,
    documentId: row.document_id,
    documentName: row.document_name,
    chunkIndex: row.chunk_index,
    text: row.text,
    tokenCount: row.token_count,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    embedding,
    extractionMethod: row.extraction_method ?? "native",
    ocrConfidence: row.ocr_confidence ?? null,
  };
}

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = database.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createDatabase() {
  mkdirSync(dataDir, { recursive: true });
  const database = new Database(databasePath);

  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('processing', 'ready', 'error')),
      page_count INTEGER,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      extraction_method TEXT,
      ocr_page_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      stored_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      embedding TEXT NOT NULL,
      extraction_method TEXT NOT NULL DEFAULT 'native',
      ocr_confidence REAL,
      UNIQUE(document_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_document_id
      ON chunks(document_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      chunk_id UNINDEXED,
      document_id UNINDEXED,
      text,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE IF NOT EXISTS agent_documents (
      agent_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(agent_id, document_id)
    );
  `);

  ensureColumn(database, "documents", "extraction_method", "TEXT");
  ensureColumn(
    database,
    "documents",
    "ocr_page_count",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    database,
    "chunks",
    "extraction_method",
    "TEXT NOT NULL DEFAULT 'native'",
  );
  ensureColumn(database, "chunks", "ocr_confidence", "REAL");

  database.pragma("user_version = 2");
  return database;
}

let instance: ReturnType<typeof createDatabase> | undefined;

export function getKnowledgeDb() {
  if (!instance) instance = createDatabase();
  return instance;
}

export function listKnowledgeDocuments(): KnowledgeDocument[] {
  const rows = getKnowledgeDb()
    .prepare("SELECT * FROM documents ORDER BY created_at DESC")
    .all() as DocumentRow[];
  return rows.map(mapDocument).map(publicDocument);
}

export function getKnowledgeDocument(id: string): StoredKnowledgeDocument | null {
  const row = getKnowledgeDb()
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as DocumentRow | undefined;
  return row ? mapDocument(row) : null;
}

export function findKnowledgeDocumentByHash(sha256: string): KnowledgeDocument | null {
  const row = getKnowledgeDb()
    .prepare("SELECT * FROM documents WHERE sha256 = ?")
    .get(sha256) as DocumentRow | undefined;
  return row ? publicDocument(mapDocument(row)) : null;
}

export function insertKnowledgeDocument(input: StoredKnowledgeDocument) {
  getKnowledgeDb()
    .prepare(`
      INSERT INTO documents (
        id, name, original_name, mime_type, extension, size, sha256, status,
        page_count, chunk_count, extraction_method, ocr_page_count, error,
        stored_path, created_at, updated_at
      ) VALUES (
        @id, @name, @originalName, @mimeType, @extension, @size, @sha256, @status,
        @pageCount, @chunkCount, @extractionMethod, @ocrPageCount, @error,
        @storedPath, @createdAt, @updatedAt
      )
    `)
    .run(input);
}

export function markKnowledgeDocumentProcessing(id: string) {
  getKnowledgeDb()
    .prepare(`
      UPDATE documents
      SET status = 'processing', error = NULL, updated_at = ?
      WHERE id = ?
    `)
    .run(new Date().toISOString(), id);
}

export function markKnowledgeDocumentReady(
  id: string,
  pageCount: number | null,
  chunkCount: number,
  extractionMethod: ExtractionMethod,
  ocrPageCount: number,
) {
  getKnowledgeDb()
    .prepare(`
      UPDATE documents
      SET status = 'ready',
          page_count = ?,
          chunk_count = ?,
          extraction_method = ?,
          ocr_page_count = ?,
          error = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .run(
      pageCount,
      chunkCount,
      extractionMethod,
      ocrPageCount,
      new Date().toISOString(),
      id,
    );
}

export function markKnowledgeDocumentError(id: string, error: string) {
  getKnowledgeDb()
    .prepare(`
      UPDATE documents
      SET status = 'error', error = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(error.slice(0, 1200), new Date().toISOString(), id);
}

export function replaceKnowledgeChunks(documentId: string, chunks: ChunkInsert[]) {
  const database = getKnowledgeDb();
  const removeFts = database.prepare("DELETE FROM chunks_fts WHERE document_id = ?");
  const removeChunks = database.prepare("DELETE FROM chunks WHERE document_id = ?");
  const insertChunk = database.prepare(`
    INSERT INTO chunks (
      id, document_id, chunk_index, text, token_count, page_start, page_end,
      embedding, extraction_method, ocr_confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = database.prepare(
    "INSERT INTO chunks_fts (chunk_id, document_id, text) VALUES (?, ?, ?)",
  );

  const transaction = database.transaction(() => {
    removeFts.run(documentId);
    removeChunks.run(documentId);

    for (const chunk of chunks) {
      insertChunk.run(
        chunk.id,
        chunk.documentId,
        chunk.chunkIndex,
        chunk.text,
        chunk.tokenCount,
        chunk.pageStart,
        chunk.pageEnd,
        JSON.stringify(chunk.embedding),
        chunk.extractionMethod,
        chunk.ocrConfidence,
      );
      insertFts.run(chunk.id, chunk.documentId, chunk.text);
    }
  });

  transaction();
}

export function deleteKnowledgeDocumentRecord(id: string): boolean {
  const database = getKnowledgeDb();
  const transaction = database.transaction(() => {
    database.prepare("DELETE FROM chunks_fts WHERE document_id = ?").run(id);
    const result = database.prepare("DELETE FROM documents WHERE id = ?").run(id);
    return result.changes > 0;
  });
  return transaction();
}

export function getAgentDocumentIds(agentId: string): string[] {
  const rows = getKnowledgeDb()
    .prepare(`
      SELECT ad.document_id
      FROM agent_documents ad
      JOIN documents d ON d.id = ad.document_id
      WHERE ad.agent_id = ? AND d.status = 'ready'
      ORDER BY d.created_at DESC
    `)
    .all(agentId) as { document_id: string }[];

  return rows.map((row) => row.document_id);
}

export function setAgentDocumentIds(agentId: string, documentIds: string[]) {
  const database = getKnowledgeDb();
  const uniqueIds = [...new Set(documentIds)];
  const validRows = uniqueIds.length
    ? (database
        .prepare(
          `SELECT id FROM documents WHERE status = 'ready' AND id IN (${uniqueIds
            .map(() => "?")
            .join(",")})`,
        )
        .all(...uniqueIds) as { id: string }[])
    : [];

  const validIds = validRows.map((row) => row.id);
  const remove = database.prepare("DELETE FROM agent_documents WHERE agent_id = ?");
  const insert = database.prepare(
    "INSERT INTO agent_documents (agent_id, document_id, created_at) VALUES (?, ?, ?)",
  );

  const transaction = database.transaction(() => {
    remove.run(agentId);
    const timestamp = new Date().toISOString();
    for (const documentId of validIds) {
      insert.run(agentId, documentId, timestamp);
    }
  });

  transaction();
  return validIds;
}

const chunkSelect = `
  SELECT
    c.id,
    c.document_id,
    d.name AS document_name,
    c.chunk_index,
    c.text,
    c.token_count,
    c.page_start,
    c.page_end,
    c.embedding,
    c.extraction_method,
    c.ocr_confidence
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
`;

export function getChunksForDocuments(documentIds: string[]): StoredChunk[] {
  if (!documentIds.length) return [];
  const placeholders = documentIds.map(() => "?").join(",");
  const rows = getKnowledgeDb()
    .prepare(`
      ${chunkSelect}
      WHERE d.status = 'ready' AND c.document_id IN (${placeholders})
    `)
    .all(...documentIds) as ChunkRow[];

  return rows.map(mapChunk);
}

export function searchKnowledgeFts(
  query: string,
  documentIds: string[],
  limit = 8,
): StoredChunk[] {
  if (!documentIds.length) return [];

  const terms =
    query
      .toLocaleLowerCase("tr")
      .match(/[\p{L}\p{N}_-]{2,}/gu)
      ?.slice(0, 12) ?? [];

  if (!terms.length) return [];

  const expression = terms
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
  const placeholders = documentIds.map(() => "?").join(",");

  try {
    const rows = getKnowledgeDb()
      .prepare(`
        SELECT
          c.id,
          c.document_id,
          d.name AS document_name,
          c.chunk_index,
          c.text,
          c.token_count,
          c.page_start,
          c.page_end,
          c.embedding,
          c.extraction_method,
          c.ocr_confidence,
          bm25(chunks_fts) AS rank
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE chunks_fts MATCH ?
          AND chunks_fts.document_id IN (${placeholders})
          AND d.status = 'ready'
        ORDER BY rank
        LIMIT ?
      `)
      .all(expression, ...documentIds, limit) as ChunkRow[];

    return rows.map(mapChunk);
  } catch {
    return [];
  }
}
