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
export type ExtractionMethod = "native" | "ocr" | "mixed";

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
  extractionMethod: ExtractionMethod | null;
  ocrPageCount: number;
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
  extractionMethod?: "native" | "ocr";
  ocrConfidence?: number | null;
};

export type RagDebugCandidate = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageStart: number | null;
  extractionMethod: "native" | "ocr";
  ocrConfidence: number | null;
  semanticScore?: number;
  keywordRank?: number;
  finalScore?: number;
};

export type RagDebugTrace = {
  query: string;
  assignedDocumentCount: number;
  indexedChunkCount: number;
  semanticCandidates: RagDebugCandidate[];
  keywordCandidates: RagDebugCandidate[];
  selectedCandidates: RagDebugCandidate[];
  selectedTokenCount: number;
  timings: {
    embeddingMs: number;
    retrievalMs: number;
    totalMs: number;
  };
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: KnowledgeSource[];
  debug?: RagDebugTrace;
};
