export const MIGRATION_PHASES = [
  "workspace",
  "business-and-agents",
  "knowledge",
  "chat",
  "tools-and-crm",
  "files",
  "verify",
] as const;

export type MigrationPhaseName = (typeof MIGRATION_PHASES)[number];
export type MigrationPhaseStatus = "pending" | "running" | "completed" | "failed";

export type UploadFileInventory = {
  path: string;
  sizeBytes: number;
  sha256: string;
};

export type MigrationCounts = {
  agents: number;
  documents: number;
  chunks: number;
  agentDocuments: number;
  conversations: number;
  chatMessages: number;
  workspaceTools: number;
  agentTools: number;
  toolRuns: number;
  toolApprovals: number;
  toolRunAttempts: number;
  toolAuditEvents: number;
  crmContacts: number;
};

export type MigrationManifest = {
  version: 1;
  migrationId: string;
  createdAt: string;
  source: {
    gitCommit: string | null;
    avenlyoJson: { path: string; sha256: string };
    sqlite: { path: string; sha256: string; userVersion: number };
    uploads: { root: string; fileCount: number; totalBytes: number };
  };
  target: {
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    postgresMajor: 18;
    schemaVersion: 1;
    storageRoot: string;
  };
  inventory: {
    counts: MigrationCounts;
    embeddingDimensions: Record<string, number>;
    invalidEmbeddingCount: number;
    orphanCounts: Record<string, number>;
    toolArgumentHashMismatch: number;
    uploadFiles: UploadFileInventory[];
  };
  phases: Array<{
    name: MigrationPhaseName;
    status: MigrationPhaseStatus;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }>;
};

export type LegacyBusiness = {
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

export type LegacyAgent = {
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

export type LegacyAppData = {
  business: LegacyBusiness;
  agents: LegacyAgent[];
};

export type VerificationReport = {
  ok: boolean;
  errors: string[];
  checks: Record<string, number | boolean | string>;
};
