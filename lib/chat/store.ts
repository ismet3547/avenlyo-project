import { randomUUID } from "node:crypto";
import { getKnowledgeDb } from "@/lib/rag/db";
import type {
  ChatMessage,
  Conversation,
  KnowledgeSource,
  RagDebugTrace,
  ToolActivity,
} from "@/lib/types";

type ConversationRow = {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources_json: string | null;
  debug_json: string | null;
  tool_activities_json: string | null;
  created_at: string;
};

function db() {
  const database = getKnowledgeDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_agent_updated
      ON conversations(agent_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sources_json TEXT,
      debug_json TEXT,
      tool_activities_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
      ON chat_messages(conversation_id, created_at ASC);
  `);

  const messageColumns = database.pragma("table_info(chat_messages)") as Array<{ name: string }>;
  if (!messageColumns.some((column) => column.name === "tool_activities_json")) {
    database.exec("ALTER TABLE chat_messages ADD COLUMN tool_activities_json TEXT");
  }

  return database;
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    sources: parseJson<KnowledgeSource[]>(row.sources_json),
    debug: parseJson<RagDebugTrace>(row.debug_json),
    toolActivities: parseJson<ToolActivity[]>(row.tool_activities_json),
    createdAt: row.created_at,
  };
}

export function listConversations(agentId: string): Conversation[] {
  return (
    db()
      .prepare(
        `SELECT * FROM conversations
         WHERE agent_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(agentId) as ConversationRow[]
  ).map(mapConversation);
}

export function getConversation(id: string): Conversation | null {
  const row = db()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as ConversationRow | undefined;
  return row ? mapConversation(row) : null;
}

export function createConversation(agentId: string, seedText = ""): Conversation {
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: randomUUID(),
    agentId,
    title: titleFromText(seedText),
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare(
      `INSERT INTO conversations
       (id, agent_id, title, created_at, updated_at)
       VALUES (@id, @agentId, @title, @createdAt, @updatedAt)`,
    )
    .run(conversation);

  return conversation;
}

export function deleteConversation(id: string) {
  return db().prepare("DELETE FROM conversations WHERE id = ?").run(id).changes > 0;
}

export function deleteAgentConversations(agentId: string) {
  return db().prepare("DELETE FROM conversations WHERE agent_id = ?").run(agentId).changes;
}

export function listConversationMessages(conversationId: string): ChatMessage[] {
  return (
    db()
      .prepare(
        `SELECT * FROM chat_messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
      )
      .all(conversationId) as MessageRow[]
  ).map(mapMessage);
}

export function insertConversationMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sources?: KnowledgeSource[];
  debug?: RagDebugTrace;
  toolActivities?: ToolActivity[];
}): ChatMessage {
  const message: ChatMessage = {
    id: randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    sources: input.sources,
    debug: input.debug,
    toolActivities: input.toolActivities,
    createdAt: new Date().toISOString(),
  };

  const database = db();
  const transaction = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO chat_messages
         (id, conversation_id, role, content, sources_json, debug_json, tool_activities_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        input.conversationId,
        input.role,
        input.content,
        input.sources ? JSON.stringify(input.sources) : null,
        input.debug ? JSON.stringify(input.debug) : null,
        input.toolActivities ? JSON.stringify(input.toolActivities) : null,
        message.createdAt,
      );

    database
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(message.createdAt, input.conversationId);
  });

  transaction();
  return message;
}

export function deleteLastAssistantMessage(conversationId: string) {
  const row = db()
    .prepare(
      `SELECT id FROM chat_messages
       WHERE conversation_id = ? AND role = 'assistant'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(conversationId) as { id: string } | undefined;

  if (!row) return false;
  return db().prepare("DELETE FROM chat_messages WHERE id = ?").run(row.id).changes > 0;
}

export function latestUserMessage(conversationId: string): ChatMessage | null {
  const row = db()
    .prepare(
      `SELECT * FROM chat_messages
       WHERE conversation_id = ? AND role = 'user'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(conversationId) as MessageRow | undefined;

  return row ? mapMessage(row) : null;
}

export function touchConversationTitle(conversationId: string, text: string) {
  const conversation = getConversation(conversationId);
  if (!conversation) return;

  if (conversation.title !== "Yeni sohbet") return;

  db()
    .prepare("UPDATE conversations SET title = ? WHERE id = ?")
    .run(titleFromText(text), conversationId);
}

export function titleFromText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "Yeni sohbet";
  return compact.length > 54 ? `${compact.slice(0, 54).trim()}…` : compact;
}


export function getConversationMessage(id: string): ChatMessage | null {
  const row = db()
    .prepare("SELECT * FROM chat_messages WHERE id = ?")
    .get(id) as MessageRow | undefined;
  return row ? mapMessage(row) : null;
}

export function updateConversationMessage(input: {
  id: string;
  content: string;
  toolActivities?: ToolActivity[];
}): ChatMessage | null {
  const existing = getConversationMessage(input.id);
  if (!existing) return null;

  db()
    .prepare(
      `UPDATE chat_messages
       SET content = ?, tool_activities_json = ?
       WHERE id = ? AND role = 'assistant'`,
    )
    .run(
      input.content,
      input.toolActivities ? JSON.stringify(input.toolActivities) : null,
      input.id,
    );

  return getConversationMessage(input.id);
}
