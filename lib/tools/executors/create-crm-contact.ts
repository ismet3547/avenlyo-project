import { randomUUID } from "node:crypto";
import { getKnowledgeDb } from "@/lib/rag/db";

type CreateCrmContactInput = {
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

type CrmContactRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  idempotency_key: string;
  created_at: string;
};

export function createCrmContact(
  input: CreateCrmContactInput,
  idempotencyKey: string,
) {
  if (!idempotencyKey) {
    throw new Error("TOOL_IDEMPOTENCY_KEY_REQUIRED");
  }

  const database = getKnowledgeDb();
  const transaction = database.transaction(() => {
    const existing = database
      .prepare("SELECT * FROM crm_contacts WHERE idempotency_key = ?")
      .get(idempotencyKey) as CrmContactRow | undefined;

    if (existing) {
      return {
        contact_id: existing.id,
        name: existing.name,
        created: false,
      };
    }

    const contactId = `CRM-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    database
      .prepare(
        `INSERT INTO crm_contacts
         (id, name, phone, email, notes, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        contactId,
        input.name,
        input.phone,
        input.email,
        input.notes,
        idempotencyKey,
        now,
      );

    return {
      contact_id: contactId,
      name: input.name,
      created: true,
    };
  });

  return transaction();
}

export function countCrmContacts() {
  const row = getKnowledgeDb()
    .prepare("SELECT COUNT(*) AS count FROM crm_contacts")
    .get() as { count: number };
  return row.count;
}
