import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Agent, AppData, BusinessProfile } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "avenlyo.json");

const now = () => new Date().toISOString();

const defaults: AppData = {
  business: {
    name: "",
    industry: "",
    description: "",
    audience: "",
    tone: "Sade, güven veren ve doğal",
    offer: "",
    faq: "",
    knowledge: "",
    updatedAt: now(),
  },
  agents: [
    {
      id: "welcome-agent",
      name: "Müşteri Asistanı",
      emoji: "✦",
      role: "Müşteri deneyimi asistanı",
      goal: "Ziyaretçilerin sorularını işletme bilgilerine dayanarak hızlı ve doğru biçimde yanıtlamak.",
      instructions:
        "Bilmediğin bilgiyi uydurma. Gerekirse eksik bilgiyi açıkça söyle. Yanıtları kısa, anlaşılır ve markanın tonuna uygun tut.",
      model: "gpt-6-luna",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
};

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(defaults, null, 2), "utf8");
  }
}

export async function readData(): Promise<AppData> {
  await ensureStore();
  const raw = await readFile(dataFile, "utf8");

  try {
    return JSON.parse(raw) as AppData;
  } catch {
    await writeData(defaults);
    return defaults;
  }
}

export async function writeData(data: AppData) {
  await mkdir(dataDir, { recursive: true });
  const temp = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await rename(temp, dataFile);
}

export async function updateBusiness(
  patch: Partial<BusinessProfile>,
): Promise<BusinessProfile> {
  const data = await readData();
  const business = {
    ...data.business,
    ...patch,
    updatedAt: now(),
  };

  await writeData({ ...data, business });
  return business;
}

export async function createAgent(
  input: Pick<Agent, "name" | "emoji" | "role" | "goal" | "instructions" | "model">,
): Promise<Agent> {
  const data = await readData();
  const timestamp = now();
  const agent: Agent = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await writeData({ ...data, agents: [agent, ...data.agents] });
  return agent;
}

export async function updateAgent(
  id: string,
  patch: Partial<Omit<Agent, "id" | "createdAt">>,
): Promise<Agent | null> {
  const data = await readData();
  const existing = data.agents.find((agent) => agent.id === id);
  if (!existing) return null;

  const updated: Agent = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  await writeData({
    ...data,
    agents: data.agents.map((agent) => (agent.id === id ? updated : agent)),
  });

  return updated;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const data = await readData();
  const nextAgents = data.agents.filter((agent) => agent.id !== id);
  if (nextAgents.length === data.agents.length) return false;

  await writeData({ ...data, agents: nextAgents });
  return true;
}
