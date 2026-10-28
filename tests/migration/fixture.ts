import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

export async function createLegacyFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "avenlyo-legacy-"));
  const source = path.join(root, "data");
  const migration = path.join(root, "migration");
  await mkdir(source, { recursive: true });
  await mkdir(migration, { recursive: true });

  const now = "2026-10-28T10:00:00.000Z";
  const agentId = "welcome-agent";
  const documentId = "doc-legacy-1";
  const conversationId = "conversation-1";
  const messageId = "message-1";
  const uploadDir = path.join(source, "uploads", documentId);
  const uploadPath = path.join(uploadDir, "bilgi.txt");
  const upload = Buffer.from("ALPHA-TENANT-ONLY-7X9 örnek bilgi tabanı içeriği.", "utf8");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(uploadPath, upload);
  const sha256 = createHash("sha256").update(upload).digest("hex");

  await writeFile(
    path.join(source, "avenlyo.json"),
    JSON.stringify(
      {
        business: {
          name: "Legacy Test İşletmesi",
          industry: "Test",
          description: "Migration fixture",
          audience: "Test kullanıcıları",
          tone: "Sade",
          offer: "Test hizmeti",
          faq: "",
          knowledge: "",
          updatedAt: now,
        },
        agents: [
          {
            id: agentId,
            name: "Müşteri Asistanı",
            emoji: "✦",
            role: "Test",
            goal: "Test",
            instructions: "Test",
            model: "test-model",
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const db = new Database(path.join(source, "knowledge.db"));
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("user_version = 4");
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        page_count INTEGER,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        extraction_method TEXT,
        ocr_page_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        stored_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        page_start INTEGER,
        page_end INTEGER,
        embedding TEXT NOT NULL,
        extraction_method TEXT NOT NULL DEFAULT 'native',
        ocr_confidence REAL
      );
      CREATE TABLE agent_documents (
        agent_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(agent_id, document_id)
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources_json TEXT,
        debug_json TEXT,
        tool_activities_json TEXT,
        created_at TEXT NOT NULL
      );
    `);

    db.prepare(`
      INSERT INTO documents (
        id,name,original_name,mime_type,extension,size,sha256,status,page_count,
        chunk_count,extraction_method,ocr_page_count,error,stored_path,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      documentId,
      "bilgi",
      "bilgi.txt",
      "text/plain",
      ".txt",
      upload.length,
      sha256,
      "ready",
      null,
      1,
      "native",
      0,
      null,
      uploadPath,
      now,
      now,
    );
    db.prepare(`
      INSERT INTO chunks (
        id,document_id,chunk_index,text,token_count,page_start,page_end,embedding,extraction_method,ocr_confidence
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      "chunk-1",
      documentId,
      0,
      "ALPHA-TENANT-ONLY-7X9 örnek bilgi tabanı içeriği.",
      12,
      null,
      null,
      JSON.stringify([0.1, 0.2, 0.3]),
      "native",
      null,
    );
    db.prepare(
      "INSERT INTO agent_documents (agent_id,document_id,created_at) VALUES (?,?,?)",
    ).run(agentId, documentId, now);
    db.prepare(
      "INSERT INTO conversations (id,agent_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",
    ).run(conversationId, agentId, "Test sohbeti", now, now);
    db.prepare(
      "INSERT INTO chat_messages (id,conversation_id,role,content,sources_json,debug_json,tool_activities_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(messageId, conversationId, "user", "Merhaba", null, null, null, now);
  } finally {
    db.close();
  }

  return {
    root,
    source,
    manifestPath: path.join(migration, "legacy-manifest.json"),
    migrationId: randomUUID(),
    workspaceId: randomUUID(),
    now,
  };
}
