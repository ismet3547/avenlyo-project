export type BusinessProfile = {
  name: string;
  industry: string;
  description: string;
  audience: string;
  tone: string;
  offer: string;
  faq: string;
  knowledge: string;
  updatedAt: string;
};

export type Agent = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  goal: string;
  instructions: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  business: BusinessProfile;
  agents: Agent[];
};

export type KnowledgeStatus = "processing" | "ready" | "error";

export type KnowledgeDocument = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  sha256: string;
  status: KnowledgeStatus;
  pageCount: number | null;
  chunkCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSource = {
  documentId: string;
  documentName: string;
  pageStart: number | null;
  pageEnd: number | null;
  score?: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: KnowledgeSource[];
};
