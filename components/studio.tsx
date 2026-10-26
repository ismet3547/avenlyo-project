"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MarkdownMessage } from "@/components/markdown-message";
import { TextSourceViewer } from "@/components/text-source-viewer";
import type { Agent, BusinessProfile, ChatMessage, Conversation, KnowledgeDocument, ToolActivity } from "@/lib/types";
import type { CrmContact, ToolCatalogItem, ToolFeatureFlags, ToolOperationsSummary, ToolRunDetail, ToolRunStatus, ToolRunSummary } from "@/lib/tools/types";
import type { ConnectorPublicItem, ConnectorTestResult } from "@/lib/connectors/types";

const PdfSourceViewer = dynamic(
  () =>
    import("@/components/pdf-source-viewer").then(
      (module) => module.PdfSourceViewer,
    ),
  { ssr: false },
);

type View = "overview" | "business" | "knowledge" | "tools" | "agents";
type ToolsTab = "catalog" | "runs" | "crm" | "connections";

const emptyBusiness: BusinessProfile = {
  name: "",
  industry: "",
  description: "",
  audience: "",
  tone: "",
  offer: "",
  faq: "",
  knowledge: "",
  updatedAt: "",
};

const blankAgent = {
  name: "",
  emoji: "✦",
  role: "",
  goal: "",
  instructions: "",
  model: "gpt-6-luna",
};

const models = [
  { value: "gpt-6-luna", label: "GPT-6 Luna", hint: "Hızlı · ekonomik" },
  { value: "gpt-6.1-sol", label: "GPT-6.1 Sol", hint: "Dengeli · güçlü" },
  { value: "gpt-6-astra", label: "GPT-6 Astra", hint: "En yüksek kalite" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toolRunStatusLabel(status: ToolRunStatus) {
  const labels: Record<ToolRunStatus, string> = {
    proposed: "Önerildi",
    approval_required: "Onay bekliyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    running: "Çalışıyor",
    success: "Başarılı",
    failed: "Hata",
    cancelled: "İptal",
  };
  return labels[status];
}

function humanizeKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("tr"));
}

function DetailObject({
  value,
  empty = "Kayıt yok",
}: {
  value: Record<string, unknown> | null;
  empty?: string;
}) {
  if (!value || Object.keys(value).length === 0) {
    return <p className="operations-empty-copy">{empty}</p>;
  }

  return (
    <div className="operations-kv-grid">
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <span>{humanizeKey(key)}</span>
          <strong>
            {item === null
              ? "—"
              : typeof item === "object"
                ? JSON.stringify(item)
                : String(item)}
          </strong>
        </div>
      ))}
    </div>
  );
}


function ToolActivityCard({
  activity,
  onDecision,
  busy,
}: {
  activity: ToolActivity;
  onDecision?: (activity: ToolActivity, decision: "approve" | "reject") => void;
  busy?: boolean;
}) {
  const orderId =
    typeof activity.arguments?.order_id === "string"
      ? activity.arguments.order_id
      : null;
  const status =
    typeof activity.result?.status === "string"
      ? activity.result.status
      : null;
  const tracking =
    typeof activity.result?.tracking_status === "string"
      ? activity.result.tracking_status
      : null;

  const crmName =
    typeof activity.arguments?.name === "string"
      ? activity.arguments.name
      : null;
  const crmEmail =
    typeof activity.arguments?.email === "string"
      ? activity.arguments.email
      : null;
  const crmPhone =
    typeof activity.arguments?.phone === "string"
      ? activity.arguments.phone
      : null;
  const crmNotes =
    typeof activity.arguments?.notes === "string"
      ? activity.arguments.notes
      : null;
  const contactId =
    typeof activity.result?.contact_id === "string"
      ? activity.result.contact_id
      : null;

  const statusLabel =
    activity.status === "running"
      ? "Çalışıyor"
      : activity.status === "success"
        ? "Tamamlandı"
        : activity.status === "approval_required"
          ? "Onay bekliyor"
          : activity.status === "approved"
            ? "Onaylandı"
            : activity.status === "rejected"
              ? "Reddedildi"
              : activity.status === "blocked"
                ? "Engellendi"
                : "Hata";

  return (
    <div className={`tool-activity-card status-${activity.status}`}>
      <div className="tool-activity-icon">
        <Icon name="tools" size={16} />
      </div>
      <div className="tool-activity-main">
        <div className="tool-activity-head">
          <strong>{activity.displayName}</strong>
          <span>{statusLabel}</span>
        </div>
        <p>{activity.summary}</p>

        {activity.toolName === "lookup_order" && orderId && (
          <div className="tool-activity-details">
            <span>
              <small>Sipariş</small>
              <strong>{orderId}</strong>
            </span>
            {status && (
              <span>
                <small>Durum</small>
                <strong>{status}</strong>
              </span>
            )}
            {tracking && (
              <span>
                <small>Takip</small>
                <strong>{tracking}</strong>
              </span>
            )}
          </div>
        )}

        {activity.toolName === "create_crm_contact" && (
          <>
            <div className="tool-activity-details crm-approval-details">
              {crmName && (
                <span>
                  <small>Müşteri</small>
                  <strong>{crmName}</strong>
                </span>
              )}
              {crmEmail && (
                <span>
                  <small>E-posta</small>
                  <strong>{crmEmail}</strong>
                </span>
              )}
              {crmPhone && (
                <span>
                  <small>Telefon</small>
                  <strong>{crmPhone}</strong>
                </span>
              )}
              {contactId && (
                <span>
                  <small>CRM ID</small>
                  <strong>{contactId}</strong>
                </span>
              )}
            </div>

            {crmNotes && (
              <div className="tool-approval-notes">
                <small>Not</small>
                <p>{crmNotes}</p>
              </div>
            )}

            {activity.status === "approval_required" &&
              activity.toolRunId &&
              onDecision && (
                <div className="tool-approval-actions">
                  <button
                    type="button"
                    className="approval-reject"
                    disabled={busy}
                    onClick={() => onDecision(activity, "reject")}
                  >
                    Reddet
                  </button>
                  <button
                    type="button"
                    className="approval-approve"
                    disabled={busy}
                    onClick={() => onDecision(activity, "approve")}
                  >
                    {busy ? "İşleniyor…" : "Onayla ve oluştur"}
                  </button>
                </div>
              )}
          </>
        )}
      </div>
      {typeof activity.durationMs === "number" && (
        <span className="tool-activity-duration">{activity.durationMs} ms</span>
      )}
    </div>
  );
}


function Icon({
  name,
  size = 18,
}: {
  name: "home" | "business" | "knowledge" | "tools" | "agents" | "plus" | "arrow" | "spark" | "check" | "trash" | "edit" | "send" | "menu" | "upload" | "refresh";
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-7h6v7" /></>,
    business: <><path d="M4 21V7l8-4 8 4v14" /><path d="M8 21v-5h8v5" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
    knowledge: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>,
    tools: <><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z" /><path d="m6.5 17.5 2 2" /></>,
    agents: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M9 12h.01M15 12h.01M9 16h6M12 7V4M9 4h6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    spark: <path d="m12 3 1.35 4.12L17.5 8.5l-4.15 1.38L12 14l-1.35-4.12L6.5 8.5l4.15-1.38L12 3ZM19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0 1.2 4.2" /><path d="M20 4v7h-7" /></>,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Studio({ initialView = "overview" }: { initialView?: View }) {
  const router = useRouter();
  const view = initialView;
  const [business, setBusiness] = useState<BusinessProfile>(emptyBusiness);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [toolsCatalog, setToolsCatalog] = useState<ToolCatalogItem[]>([]);
  const [toolFlags, setToolFlags] = useState<ToolFeatureFlags | null>(null);
  const [agentToolIds, setAgentToolIds] = useState<string[]>([]);
  const [toolSavingId, setToolSavingId] = useState<string | null>(null);
  const [toolsTab, setToolsTab] = useState<ToolsTab>("catalog");
  const [toolRuns, setToolRuns] = useState<ToolRunSummary[]>([]);
  const [toolOpsSummary, setToolOpsSummary] = useState<ToolOperationsSummary | null>(null);
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [toolOpsLoading, setToolOpsLoading] = useState(false);
  const [toolRunDetail, setToolRunDetail] = useState<ToolRunDetail | null>(null);
  const [toolRunDetailLoading, setToolRunDetailLoading] = useState(false);
  const [runStatusFilter, setRunStatusFilter] = useState<"all" | ToolRunStatus>("all");
  const [crmSearch, setCrmSearch] = useState("");
  const [connectors, setConnectors] = useState<ConnectorPublicItem[]>([]);
  const [connectorTestingId, setConnectorTestingId] = useState<string | null>(null);
  const [connectorResults, setConnectorResults] = useState<Record<string, ConnectorTestResult>>({});
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [agentKnowledgeIds, setAgentKnowledgeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState(blankAgent);
  const [playgroundAgent, setPlaygroundAgent] = useState<Agent | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [viewer, setViewer] = useState<{
    documentId: string;
    documentName: string;
    page: number | null;
  } | null>(null);
  const [sourcePreview, setSourcePreview] = useState<{
    documentId: string;
    documentName: string;
    chunkId?: string;
    page: number | null;
  } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/business").then((response) => response.json()),
      fetch("/api/agents").then((response) => response.json()),
      fetch("/api/knowledge").then((response) => response.json()),
      fetch("/api/tools").then((response) => response.json()),
      fetch("/api/connectors").then((response) => response.json()),
    ])
      .then(([businessData, agentData, knowledgeData, toolsData, connectorData]) => {
        setBusiness(businessData);
        setAgents(agentData);
        setDocuments(Array.isArray(knowledgeData) ? knowledgeData : []);
        setToolsCatalog(Array.isArray(toolsData?.tools) ? toolsData.tools : []);
        setToolFlags(toolsData?.flags ?? null);
        setConnectors(
          Array.isArray(connectorData?.connectors) ? connectorData.connectors : [],
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view !== "tools") return;
    void refreshToolOperations();
  }, [view]);

  const completedFields = useMemo(() => {
    const keys: (keyof BusinessProfile)[] = [
      "name",
      "industry",
      "description",
      "audience",
      "tone",
      "offer",
      "faq",
      "knowledge",
    ];
    return keys.filter((key) => business[key]?.trim()).length;
  }, [business]);

  const profilePercent = Math.round((completedFields / 8) * 100);
  const latestDebug = useMemo(
    () => [...chat].reverse().find((item) => item.debug)?.debug,
    [chat],
  );
  const hasPendingApproval = useMemo(
    () =>
      chat.some((item) =>
        item.toolActivities?.some(
          (activity) => activity.status === "approval_required",
        ),
      ),
    [chat],
  );
  const filteredToolRuns = useMemo(
    () =>
      runStatusFilter === "all"
        ? toolRuns
        : toolRuns.filter((run) => run.status === runStatusFilter),
    [toolRuns, runStatusFilter],
  );
  const filteredCrmContacts = useMemo(() => {
    const query = crmSearch.trim().toLocaleLowerCase("tr");
    if (!query) return crmContacts;

    return crmContacts.filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.id]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("tr").includes(query),
        ),
    );
  }, [crmContacts, crmSearch]);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2400);
  }

  function navigate(next: View) {
    const routes: Record<View, string> = {
      overview: "/",
      business: "/bilgiler",
      knowledge: "/bilgi-tabani",
      tools: "/araclar",
      agents: "/ajanlar",
    };
    setMobileNav(false);
    router.push(routes[next]);
  }

  async function refreshConnectors() {
    try {
      const response = await fetch("/api/connectors");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Connector kataloğu yüklenemedi.");
      }
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Connector kataloğu yüklenemedi.",
      );
    }
  }

  async function testConnectorConnection(connectorId: string) {
    if (connectorTestingId) return;
    setConnectorTestingId(connectorId);

    try {
      const response = await fetch(
        `/api/connectors/${encodeURIComponent(connectorId)}/test`,
        { method: "POST" },
      );
      const data = (await response.json()) as ConnectorTestResult & {
        error?: string;
      };

      const result: ConnectorTestResult = {
        connectorId,
        ok: Boolean(data.ok),
        statusCode:
          typeof data.statusCode === "number" ? data.statusCode : null,
        durationMs:
          typeof data.durationMs === "number" ? data.durationMs : 0,
        hostname:
          typeof data.hostname === "string" ? data.hostname : null,
        message:
          typeof data.message === "string"
            ? data.message
            : data.error || "Connector testi tamamlanamadı.",
      };

      setConnectorResults((current) => ({
        ...current,
        [connectorId]: result,
      }));

      flash(result.message);
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Connector testi tamamlanamadı.",
      );
    } finally {
      setConnectorTestingId(null);
      void refreshConnectors();
    }
  }

  async function refreshToolOperations() {
    setToolOpsLoading(true);
    try {
      const [runsResponse, crmResponse] = await Promise.all([
        fetch("/api/tool-runs?limit=100"),
        fetch("/api/crm/contacts?limit=250"),
      ]);
      const [runsData, crmData] = await Promise.all([
        runsResponse.json(),
        crmResponse.json(),
      ]);

      if (!runsResponse.ok) {
        throw new Error(runsData.error || "İşlem geçmişi yüklenemedi.");
      }
      if (!crmResponse.ok) {
        throw new Error(crmData.error || "CRM kayıtları yüklenemedi.");
      }

      setToolRuns(Array.isArray(runsData.runs) ? runsData.runs : []);
      setToolOpsSummary(runsData.summary ?? null);
      setCrmContacts(Array.isArray(crmData.contacts) ? crmData.contacts : []);
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Araç operasyon verileri yüklenemedi.",
      );
    } finally {
      setToolOpsLoading(false);
    }
  }

  async function openToolRunDetail(runId: string) {
    setToolRunDetailLoading(true);
    try {
      const response = await fetch(
        `/api/tool-runs/${encodeURIComponent(runId)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "İşlem detayı yüklenemedi.");
      }
      setToolRunDetail(data as ToolRunDetail);
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "İşlem detayı yüklenemedi.",
      );
    } finally {
      setToolRunDetailLoading(false);
    }
  }

  function agentName(agentId: string) {
    return agents.find((agent) => agent.id === agentId)?.name || "Silinmiş / bilinmeyen ajan";
  }

  async function saveBusiness(event: FormEvent) {
    event.preventDefault();
    setBusinessSaving(true);
    try {
      const response = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(business),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kaydedilemedi.");
      setBusiness(data);
      flash("İşletme profili kaydedildi.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Bir hata oluştu.");
    } finally {
      setBusinessSaving(false);
    }
  }

  async function refreshDocuments() {
    const response = await fetch("/api/knowledge");
    const data = await response.json();
    if (response.ok && Array.isArray(data)) setDocuments(data);
  }

  async function uploadDocuments(files: FileList | File[]) {
    const queue = Array.from(files);
    if (!queue.length || uploading) return;

    setUploading(true);
    let uploaded = 0;

    try {
      for (const file of queue) {
        const form = new FormData();
        form.append("file", file);

        const response = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: form,
        });
        const data = await response.json();

        if (!response.ok) {
          flash(data.error || `${file.name} yüklenemedi.`);
          continue;
        }

        uploaded += 1;
      }

      await refreshDocuments();
      if (uploaded) {
        flash(
          uploaded === 1
            ? "Belge indekslendi ve bilgi tabanına eklendi."
            : `${uploaded} belge indekslendi ve bilgi tabanına eklendi.`,
        );
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Dosya yüklenemedi.");
      await refreshDocuments();
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  }

  function handleKnowledgeInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void uploadDocuments(event.target.files);
    event.target.value = "";
  }

  function handleKnowledgeDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length) {
      void uploadDocuments(event.dataTransfer.files);
    }
  }

  async function removeKnowledgeDocument(document: KnowledgeDocument) {
    if (!window.confirm(`"${document.originalName}" belgesini silmek istediğinizden emin misiniz?`)) return;

    const response = await fetch(
      `/api/knowledge/${encodeURIComponent(document.id)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const data = await response.json();
      flash(data.error || "Belge silinemedi.");
      return;
    }

    setDocuments((current) => current.filter((item) => item.id !== document.id));
    setAgentKnowledgeIds((current) => current.filter((id) => id !== document.id));
    flash("Belge bilgi tabanından silindi.");
  }

  async function reindexKnowledgeDocument(document: KnowledgeDocument) {
    setDocuments((current) =>
      current.map((item) =>
        item.id === document.id ? { ...item, status: "processing", error: null } : item,
      ),
    );

    const response = await fetch(
      `/api/knowledge/${encodeURIComponent(document.id)}/reindex`,
      { method: "POST" },
    );
    const data = await response.json();
    await refreshDocuments();

    if (!response.ok) {
      flash(data.error || "Belge yeniden indekslenemedi.");
      return;
    }

    flash("Belge yeniden indekslendi.");
  }

  function openNewAgent() {
    setEditingId(null);
    setAgentForm(blankAgent);
    setAgentKnowledgeIds([]);
    setAgentToolIds([]);
    setEditorOpen(true);
  }

  async function openEditAgent(agent: Agent) {
    setEditingId(agent.id);
    setAgentForm({
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      goal: agent.goal,
      instructions: agent.instructions,
      model: agent.model,
    });
    setAgentKnowledgeIds([]);
    setAgentToolIds([]);
    setEditorOpen(true);

    try {
      const [knowledgeResponse, toolsResponse] = await Promise.all([
        fetch(`/api/agents/${encodeURIComponent(agent.id)}/knowledge`),
        fetch(`/api/agents/${encodeURIComponent(agent.id)}/tools`),
      ]);
      const [knowledgeData, toolsData] = await Promise.all([
        knowledgeResponse.json(),
        toolsResponse.json(),
      ]);

      if (knowledgeResponse.ok && Array.isArray(knowledgeData.documentIds)) {
        setAgentKnowledgeIds(knowledgeData.documentIds);
      }
      if (toolsResponse.ok && Array.isArray(toolsData.toolIds)) {
        setAgentToolIds(toolsData.toolIds);
      }
    } catch {
      setAgentKnowledgeIds([]);
      setAgentToolIds([]);
    }
  }

  async function saveAgent(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/agents", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...agentForm, id: editingId } : agentForm),
    });
    const data = await response.json();

    if (!response.ok) {
      flash(data.error || "Ajan kaydedilemedi.");
      return;
    }

    setAgents((current) =>
      editingId
        ? current.map((agent) => (agent.id === editingId ? data : agent))
        : [data, ...current],
    );

    const [knowledgeResponse, toolsResponse] = await Promise.all([
      fetch(`/api/agents/${encodeURIComponent(data.id)}/knowledge`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: agentKnowledgeIds }),
      }),
      fetch(`/api/agents/${encodeURIComponent(data.id)}/tools`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolIds: agentToolIds }),
      }),
    ]);

    setEditorOpen(false);
    if (!knowledgeResponse.ok || !toolsResponse.ok) {
      flash("Ajan kaydedildi ancak kaynak veya araç izinleri güncellenemedi.");
      return;
    }

    flash(editingId ? "Ajan güncellendi." : "Yeni ajan oluşturuldu.");
  }

  async function removeAgent(agent: Agent) {
    if (!window.confirm(`"${agent.name}" ajanını silmek istediğinizden emin misiniz?`)) return;
    const response = await fetch(`/api/agents?id=${encodeURIComponent(agent.id)}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setAgents((current) => current.filter((item) => item.id !== agent.id));
      if (playgroundAgent?.id === agent.id) setPlaygroundAgent(null);
      flash("Ajan silindi.");
    }
  }

  async function toggleToolEnabled(tool: ToolCatalogItem) {
    if (toolSavingId) return;
    setToolSavingId(tool.id);

    try {
      const response = await fetch("/api/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, enabled: !tool.enabled }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Araç durumu güncellenemedi.");
      }

      setToolsCatalog((current) =>
        current.map((item) =>
          item.id === tool.id ? { ...item, enabled: data.enabled } : item,
        ),
      );
      flash(data.enabled ? "Araç katalogda etkinleştirildi." : "Araç katalogda devre dışı bırakıldı.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Araç güncellenemedi.");
    } finally {
      setToolSavingId(null);
    }
  }

  function toolRiskLabel(risk: ToolCatalogItem["riskLevel"]) {
    const labels: Record<ToolCatalogItem["riskLevel"], string> = {
      read: "Okuma · düşük risk",
      sensitive_read: "Hassas okuma",
      write: "Yazma · kontrollü",
      destructive: "Yıkıcı işlem",
      external_share: "Harici veri paylaşımı",
    };
    return labels[risk];
  }

  function toolApprovalLabel(policy: ToolCatalogItem["approvalPolicy"]) {
    if (policy === "always") return "Her zaman onay";
    if (policy === "writes") return "Yazma işlemlerinde onay";
    return "Onay gerekmez";
  }

  async function refreshConversations(agentId: string) {
    const response = await fetch(
      `/api/conversations?agentId=${encodeURIComponent(agentId)}`,
    );
    const data = await response.json();
    if (response.ok && Array.isArray(data)) {
      setConversations(data);
      return data as Conversation[];
    }
    return [];
  }

  async function loadConversation(conversationId: string) {
    setConversationLoading(true);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sohbet açılamadı.");
      setActiveConversationId(data.conversation.id);
      setChat(Array.isArray(data.messages) ? data.messages : []);
      setDebugOpen(false);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Sohbet açılamadı.");
    } finally {
      setConversationLoading(false);
    }
  }

  async function openPlayground(agent: Agent) {
    setPlaygroundAgent(agent);
    setChat([]);
    setConversations([]);
    setActiveConversationId(null);
    setMessage("");
    setDebugOpen(false);
    setConversationLoading(true);

    try {
      const list = await refreshConversations(agent.id);
      if (list[0]) {
        await loadConversation(list[0].id);
      }
    } finally {
      setConversationLoading(false);
    }
  }

  function startNewConversation() {
    if (sending) abortRef.current?.abort();
    setActiveConversationId(null);
    setChat([]);
    setMessage("");
    setDebugOpen(false);
  }

  async function removeConversation(conversation: Conversation) {
    if (!window.confirm(`"${conversation.title}" sohbetini silmek istediğinizden emin misiniz?`)) return;

    const response = await fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      flash("Sohbet silinemedi.");
      return;
    }

    const next = conversations.filter((item) => item.id !== conversation.id);
    setConversations(next);

    if (activeConversationId === conversation.id) {
      if (next[0]) await loadConversation(next[0].id);
      else startNewConversation();
    }
  }

  function openSource(
    documentId: string,
    documentName: string,
    page: number | null,
    chunkId?: string,
  ) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      flash("Kaynak belge bulunamadı.");
      return;
    }

    if (document.extension === ".pdf") {
      setViewer({
        documentId,
        documentName: document.originalName || documentName,
        page,
      });
      return;
    }

    setSourcePreview({
      documentId,
      documentName: document.originalName || documentName,
      chunkId,
      page,
    });
  }

  function updateConversationList(conversation: Conversation) {
    setConversations((current) => {
      const without = current.filter((item) => item.id !== conversation.id);
      return [conversation, ...without].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    });
  }

  async function sendChatMessage(text: string, regenerate = false) {
    if (!playgroundAgent || sending) return;
    if (!text.trim() && !regenerate) return;

    const normalized = text.trim();
    const tempAssistantId = `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tempUserId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (regenerate) {
      setChat((current) => {
        const lastAssistant = [...current]
          .map((item, index) => ({ item, index }))
          .reverse()
          .find(({ item }) => item.role === "assistant");

        const base =
          lastAssistant !== undefined
            ? current.slice(0, lastAssistant.index)
            : current;

        return [
          ...base,
          {
            id: tempAssistantId,
            role: "assistant",
            content: "",
            streaming: true,
          },
        ];
      });
    } else {
      setChat((current) => [
        ...current,
        {
          id: tempUserId,
          role: "user",
          content: normalized,
        },
        {
          id: tempAssistantId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ]);
      setMessage("");
    }

    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          agentId: playgroundAgent.id,
          message: normalized,
          conversationId: activeConversationId,
          regenerate,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Yanıt alınamadı.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");

        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");

          if (!line) continue;

          const event = JSON.parse(line) as {
            type: "meta" | "delta" | "tool" | "done" | "error";
            delta?: string;
            activity?: ToolActivity;
            error?: string;
            conversation?: Conversation;
            userMessage?: ChatMessage;
            message?: ChatMessage;
            sources?: ChatMessage["sources"];
            debug?: ChatMessage["debug"];
          };

          if (event.type === "meta") {
            if (event.conversation) {
              setActiveConversationId(event.conversation.id);
              updateConversationList(event.conversation);
            }

            if (!regenerate && event.userMessage) {
              setChat((current) =>
                current.map((item) =>
                  item.id === tempUserId ? event.userMessage! : item,
                ),
              );
            }

            setChat((current) =>
              current.map((item) =>
                item.id === tempAssistantId
                  ? {
                      ...item,
                      conversationId: event.conversation?.id,
                      sources: event.sources || [],
                      debug: event.debug,
                    }
                  : item,
              ),
            );
          } else if (event.type === "delta" && event.delta) {
            setChat((current) =>
              current.map((item) =>
                item.id === tempAssistantId
                  ? { ...item, content: item.content + event.delta }
                  : item,
              ),
            );
          } else if (event.type === "tool" && event.activity) {
            setChat((current) =>
              current.map((item) => {
                if (item.id !== tempAssistantId) return item;

                const activities = item.toolActivities || [];
                const existingIndex = activities.findIndex(
                  (activity) => activity.id === event.activity!.id,
                );
                const nextActivities =
                  existingIndex === -1
                    ? [...activities, event.activity!]
                    : activities.map((activity, activityIndex) =>
                        activityIndex === existingIndex
                          ? event.activity!
                          : activity,
                      );

                return {
                  ...item,
                  toolActivities: nextActivities,
                };
              }),
            );
          } else if (event.type === "done" && event.message) {
            setChat((current) =>
              current.map((item) =>
                item.id === tempAssistantId
                  ? { ...event.message!, streaming: false }
                  : item,
              ),
            );

            if (event.conversation) updateConversationList(event.conversation);
          } else if (event.type === "error") {
            throw new Error(event.error || "Yanıt sırasında hata oluştu.");
          }
        }
      }

      await refreshConversations(playgroundAgent.id);
    } catch (error) {
      const aborted = controller.signal.aborted;

      setChat((current) =>
        current.map((item) =>
          item.id === tempAssistantId
            ? {
                ...item,
                streaming: false,
                content:
                  item.content ||
                  (aborted
                    ? "Yanıt durduruldu."
                    : error instanceof Error
                      ? error.message
                      : "Bir hata oluştu."),
              }
            : item,
        ),
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  async function decideToolApproval(
    activity: ToolActivity,
    decision: "approve" | "reject",
  ) {
    if (!activity.toolRunId || approvalBusyId) return;

    setApprovalBusyId(activity.toolRunId);

    try {
      const response = await fetch("/api/chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolRunId: activity.toolRunId,
          decision,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Onay kararı uygulanamadı.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const targetMessage = (item: ChatMessage) =>
        item.toolActivities?.some(
          (toolActivity) => toolActivity.id === activity.id,
        );

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");

        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");

          if (!line) continue;

          const event = JSON.parse(line) as {
            type: "delta" | "tool" | "done" | "error";
            delta?: string;
            activity?: ToolActivity;
            message?: ChatMessage;
            conversation?: Conversation;
            error?: string;
          };

          if (event.type === "tool" && event.activity) {
            setChat((current) =>
              current.map((item) => {
                if (!targetMessage(item)) return item;

                const activities = item.toolActivities || [];
                return {
                  ...item,
                  toolActivities: activities.map((toolActivity) =>
                    toolActivity.id === event.activity!.id
                      ? event.activity!
                      : toolActivity,
                  ),
                };
              }),
            );
          } else if (event.type === "delta" && event.delta) {
            setChat((current) =>
              current.map((item) =>
                targetMessage(item)
                  ? { ...item, content: item.content + event.delta }
                  : item,
              ),
            );
          } else if (event.type === "done" && event.message) {
            setChat((current) =>
              current.map((item) =>
                targetMessage(item) || item.id === event.message!.id
                  ? { ...event.message!, streaming: false }
                  : item,
              ),
            );
            if (event.conversation) updateConversationList(event.conversation);
          } else if (event.type === "error") {
            throw new Error(event.error || "Onaylanan işlem tamamlanamadı.");
          }
        }
      }

      if (playgroundAgent) {
        await refreshConversations(playgroundAgent.id);
      }
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Onay kararı uygulanamadı.",
      );
    } finally {
      setApprovalBusyId(null);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || hasPendingApproval || approvalBusyId) return;
    void sendChatMessage(message);
  }

  function stopResponse() {
    abortRef.current?.abort();
  }

  function regenerateLastResponse() {
    if (
      sending ||
      approvalBusyId ||
      hasPendingApproval ||
      !activeConversationId
    ) return;
    const lastUser = [...chat].reverse().find((item) => item.role === "user");
    if (!lastUser) return;
    void sendChatMessage(lastUser.content, true);
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      flash("Yanıt panoya kopyalandı.");
    } catch {
      flash("Yanıt kopyalanamadı.");
    }
  }

  const navItems: { id: View; label: string; icon: "home" | "business" | "knowledge" | "tools" | "agents" }[] = [
    { id: "overview", label: "Genel Bakış", icon: "home" },
    { id: "business", label: "İşletme Bilgileri", icon: "business" },
    { id: "knowledge", label: "Bilgi Tabanı", icon: "knowledge" },
    { id: "tools", label: "Araçlar", icon: "tools" },
    { id: "agents", label: "Ajanlar", icon: "agents" },
  ];

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">A</div>
        <div className="loading-line" />
        <span>Studio hazırlanıyor</span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Avenlyo</strong>
            <span>AI Studio</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={view === item.id ? "nav-item active" : "nav-item"}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="eyebrow">OpenAI bağlantısı</span>
          <div className="connection-row">
            <i className="status-dot" />
            <span>Sunucu tarafında</span>
          </div>
          <small>Anahtarınız tarayıcıya gönderilmez.</small>
        </div>
      </aside>

      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Menüyü kapat" />}

      <section className="main-panel">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Menüyü aç">
            <Icon name="menu" />
          </button>
          <div className="topbar-copy">
            <span className="eyebrow">WORKSPACE</span>
            <strong>{business.name || "Yeni işletme"}</strong>
          </div>
          <button className="primary compact" onClick={openNewAgent}>
            <Icon name="plus" size={16} /> Yeni ajan
          </button>
        </header>

        <div className="content">
          {view === "overview" && (
            <>
              <section className="hero">
                <div>
                  <span className="eyebrow accent">AVENLYO AI STUDIO</span>
                  <h1>İşletmeni bilen ajanlar oluştur.</h1>
                  <p>
                    İşletme bilgisini bir kez tanımla. Satış, destek ve operasyon için
                    tutarlı çalışan yapay zeka ajanlarını dakikalar içinde hazırla.
                  </p>
                  <div className="hero-actions">
                    <button className="primary" onClick={openNewAgent}>
                      <Icon name="spark" /> İlk ajanını oluştur
                    </button>
                    <button className="ghost" onClick={() => navigate("business")}>
                      İşletme bilgilerini düzenle <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </div>
                <div className="hero-orb">
                  <div className="orb-core">✦</div>
                  <span className="orbit orbit-one" />
                  <span className="orbit orbit-two" />
                </div>
              </section>

              <section className="stats-grid">
                <article className="stat-card">
                  <span>Aktif ajan</span>
                  <strong>{agents.length}</strong>
                  <small>Workspace içinde</small>
                </article>
                <article className="stat-card">
                  <span>İşletme profili</span>
                  <strong>%{profilePercent}</strong>
                  <div className="progress"><i style={{ width: `${profilePercent}%` }} /></div>
                </article>
                <article className="stat-card">
                  <span>Varsayılan model</span>
                  <strong className="model-stat">GPT-6 Luna</strong>
                  <small>Hızlı ve ekonomik</small>
                </article>
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">AJANLAR</span>
                    <h2>Çalışma ekibin</h2>
                  </div>
                  <button className="text-button" onClick={() => navigate("agents")}>
                    Tümünü gör <Icon name="arrow" size={15} />
                  </button>
                </div>
                <div className="agent-grid">
                  {agents.slice(0, 3).map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onOpen={() => openPlayground(agent)} onEdit={() => openEditAgent(agent)} />
                  ))}
                  <button className="agent-card add-card" onClick={openNewAgent}>
                    <div className="add-circle"><Icon name="plus" /></div>
                    <strong>Yeni ajan</strong>
                    <span>İşletmen için yeni bir rol tanımla</span>
                  </button>
                </div>
              </section>

              {profilePercent < 100 && (
                <section className="setup-card">
                  <div className="setup-icon"><Icon name="business" /></div>
                  <div>
                    <span className="eyebrow">ÖNERİLEN SONRAKİ ADIM</span>
                    <h3>Ajanlarına daha fazla bağlam ver</h3>
                    <p>İşletme profilini tamamladıkça yanıtlar daha isabetli ve tutarlı olur.</p>
                  </div>
                  <button className="ghost" onClick={() => navigate("business")}>Profili tamamla</button>
                </section>
              )}
            </>
          )}

          {view === "business" && (
            <section className="page-section">
              <div className="page-title">
                <div>
                  <span className="eyebrow accent">BİLGİ TABANI</span>
                  <h1>İşletme Bilgileri</h1>
                  <p>Ajanlarının markanı, müşterini ve sunduğun değeri anlaması için temel bilgileri ekle.</p>
                </div>
                <div className="profile-score">
                  <span>Profil doluluğu</span>
                  <strong>%{profilePercent}</strong>
                </div>
              </div>

              <form className="business-form" onSubmit={saveBusiness}>
                <div className="form-card">
                  <div className="form-card-title">
                    <span>01</span>
                    <div><h3>Temel bilgiler</h3><p>Markanı ve ne yaptığını anlat.</p></div>
                  </div>
                  <div className="form-grid two">
                    <Field label="İşletme adı" value={business.name} placeholder="Örn. Avenlyo" onChange={(value) => setBusiness({ ...business, name: value })} />
                    <Field label="Sektör" value={business.industry} placeholder="Örn. E-ticaret, SaaS, Danışmanlık" onChange={(value) => setBusiness({ ...business, industry: value })} />
                  </div>
                  <Field textarea label="Kısa açıklama" value={business.description} placeholder="İşletmen ne yapıyor, müşteriye hangi değeri sağlıyor?" onChange={(value) => setBusiness({ ...business, description: value })} />
                </div>

                <div className="form-card">
                  <div className="form-card-title">
                    <span>02</span>
                    <div><h3>Müşteri ve marka dili</h3><p>Ajanların kiminle ve nasıl konuşacağını belirle.</p></div>
                  </div>
                  <div className="form-grid two">
                    <Field textarea label="Hedef kitle" value={business.audience} placeholder="İdeal müşterilerini ve ihtiyaçlarını tanımla." onChange={(value) => setBusiness({ ...business, audience: value })} />
                    <Field textarea label="İletişim tonu" value={business.tone} placeholder="Örn. sıcak, net, profesyonel, kısa..." onChange={(value) => setBusiness({ ...business, tone: value })} />
                  </div>
                </div>

                <div className="form-card">
                  <div className="form-card-title">
                    <span>03</span>
                    <div><h3>Ürün ve operasyon bilgisi</h3><p>Ajanların gerçek iş bilgisine dayanmasını sağla.</p></div>
                  </div>
                  <Field textarea tall label="Ürün / hizmetler" value={business.offer} placeholder="Paketler, fiyat mantığı, hizmet kapsamı, teslimat süreci..." onChange={(value) => setBusiness({ ...business, offer: value })} />
                  <div className="form-grid two">
                    <Field textarea tall label="Sık sorulan sorular" value={business.faq} placeholder="Soru: ...&#10;Cevap: ..." onChange={(value) => setBusiness({ ...business, faq: value })} />
                    <Field textarea tall label="Ek bilgi tabanı" value={business.knowledge} placeholder="Politikalar, özel kurallar, süreçler, dikkat edilmesi gerekenler..." onChange={(value) => setBusiness({ ...business, knowledge: value })} />
                  </div>
                </div>

                <div className="sticky-save">
                  <span>Bilgiler yalnızca bu cihazdaki proje klasöründe saklanır.</span>
                  <button className="primary" disabled={businessSaving}>
                    {businessSaving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {view === "knowledge" && (
            <section className="page-section">
              <div className="page-title">
                <div>
                  <span className="eyebrow accent">RAG KNOWLEDGE</span>
                  <h1>Bilgi Tabanı</h1>
                  <p>
                    PDF ve dokümanlarını yerel olarak sakla. Ajanlar yalnızca
                    kendilerine bağladığın hazır kaynaklardan ilgili parçaları getirir.
                  </p>
                </div>
                <div className="knowledge-summary">
                  <span>Hazır belge</span>
                  <strong>{documents.filter((item) => item.status === "ready").length}</strong>
                </div>
              </div>

              <div
                className={`upload-zone ${dragActive ? "drag-active" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleKnowledgeDrop}
              >
                <div className="upload-zone-icon"><Icon name="upload" /></div>
                <div>
                  <h3>{uploading ? "Belgeler işleniyor..." : "Dosyalarını buraya bırak"}</h3>
                  <p>PDF, DOCX, TXT veya MD · dosya başına en fazla 25 MB</p>
                </div>
                <input
                  id="knowledge-upload"
                  className="file-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  multiple
                  disabled={uploading}
                  onChange={handleKnowledgeInput}
                />
                <label className="primary" htmlFor="knowledge-upload">
                  <Icon name="plus" size={16} />
                  {uploading ? "İndeksleniyor..." : "Dosya seç"}
                </label>
              </div>

              <div className="knowledge-privacy">
                <Icon name="check" size={18} />
                <div>
                  <strong>Local-first bilgi tabanı</strong>
                  <span>
                    Orijinal dosyalar bu cihazda kalır. OpenAI'ye yalnızca embedding için
                    metin parçaları ve cevap sırasında getirilen ilgili parçalar gönderilir.
                  </span>
                </div>
              </div>

              <div className="knowledge-list-head">
                <div>
                  <span className="eyebrow">BELGELER</span>
                  <h2>Kaynaklar</h2>
                </div>
                <span>{documents.length} belge</span>
              </div>

              {documents.length === 0 ? (
                <div className="knowledge-empty">
                  <div className="empty-spark"><Icon name="knowledge" /></div>
                  <h3>Henüz belge yok</h3>
                  <p>İlk PDF veya dokümanını yüklediğinde burada indeks durumunu göreceksin.</p>
                </div>
              ) : (
                <div className="knowledge-list">
                  {documents.map((document) => (
                    <article className="knowledge-row" key={document.id}>
                      <div className="document-icon">
                        {document.extension.replace(".", "").toUpperCase()}
                      </div>
                      <div className="document-main">
                        <div className="document-title-row">
                          <strong>{document.originalName}</strong>
                          <span className={`status-badge status-${document.status}`}>
                            {knowledgeStatusLabel(document.status)}
                          </span>
                        </div>
                        <div className="document-meta">
                          <span>{formatBytes(document.size)}</span>
                          {document.pageCount && <span>{document.pageCount} sayfa</span>}
                          <span>{document.chunkCount} parça</span>
                          {document.extractionMethod === "ocr" && (
                            <span>OCR · {document.ocrPageCount} sayfa</span>
                          )}
                          {document.extractionMethod === "mixed" && (
                            <span>Native + OCR · {document.ocrPageCount} sayfa OCR</span>
                          )}
                          {document.extractionMethod === "native" && (
                            <span>Native text</span>
                          )}
                        </div>
                        {document.error && <p className="document-error">{document.error}</p>}
                      </div>
                      <div className="document-actions">
                        {document.extension === ".pdf" && document.status === "ready" && (
                          <button
                            className="document-view-button"
                            onClick={() =>
                              openSource(document.id, document.originalName, 1)
                            }
                          >
                            Görüntüle
                          </button>
                        )}
                        <button
                          className="icon-button"
                          onClick={() => void reindexKnowledgeDocument(document)}
                          disabled={document.status === "processing"}
                          aria-label="Yeniden indeksle"
                          title="Yeniden indeksle"
                        >
                          <Icon name="refresh" size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => void removeKnowledgeDocument(document)}
                          aria-label="Belgeyi sil"
                          title="Belgeyi sil"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {view === "tools" && (
            <section className="page-section">
              <div className="page-title">
                <div>
                  <span className="eyebrow accent">TOOLS / ACTIONS</span>
                  <h1>Araçlar</h1>
                  <p>
                    Ajanların kullanabileceği yetenekleri buradan yönet. Araç izinleri
                    modelden bağımsız olarak Avenlyo tarafından uygulanır.
                  </p>
                </div>
                <div className="tools-summary">
                  <span>Katalog</span>
                  <strong>{toolsCatalog.filter((tool) => tool.enabled).length} / {toolsCatalog.length}</strong>
                </div>
              </div>

              <div className="tools-foundation-banner">
                <div className="tools-foundation-icon"><Icon name="tools" /></div>
                <div>
                  <strong>
                    {toolFlags?.toolsEnabled
                      ? toolFlags.writesEnabled
                        ? "Read + onaylı write execution hazır"
                        : "Read-only execution hazır · write kapalı"
                      : "Tools hazır · master anahtarı kapalı"}
                  </strong>
                  <span>
                    <code>lookup_order</code> doğrudan çalışır. <code>create_crm_contact</code>
                    ise yalnız write anahtarı açıksa modele verilir ve çalışmadan önce kullanıcı onayı ister.
                    Dry-run açıksa onay akışı tamamlanır ama gerçek CRM kaydı oluşturulmaz.
                  </span>
                </div>
                <span className={`tools-master-state ${toolFlags?.toolsEnabled ? "on" : "off"}`}>
                  {toolFlags?.toolsEnabled ? "Master açık" : "Master kapalı"}
                </span>
              </div>

              <div className="tools-safety-strip">
                <span>
                  <i className={toolFlags?.readsEnabled ? "status-dot" : "status-dot muted"} />
                  Okuma {toolFlags?.readsEnabled ? "açık" : "kapalı"}
                </span>
                <span>
                  <i className={toolFlags?.writesEnabled ? "status-dot" : "status-dot muted"} />
                  Yazma {toolFlags?.writesEnabled ? "açık" : "kapalı"}
                </span>
                <span>
                  <i className={toolFlags?.destructiveEnabled ? "status-dot" : "status-dot muted"} />
                  Yıkıcı işlemler {toolFlags?.destructiveEnabled ? "açık" : "kapalı"}
                </span>
                <span>
                  <i className={toolFlags?.dryRun ? "status-dot warning" : "status-dot muted"} />
                  Dry-run {toolFlags?.dryRun ? "açık" : "kapalı"}
                </span>
              </div>

              <div className="tools-tabs" role="tablist" aria-label="Araçlar bölümleri">
                <button
                  type="button"
                  role="tab"
                  aria-selected={toolsTab === "catalog"}
                  className={toolsTab === "catalog" ? "active" : ""}
                  onClick={() => setToolsTab("catalog")}
                >
                  Katalog
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={toolsTab === "runs"}
                  className={toolsTab === "runs" ? "active" : ""}
                  onClick={() => setToolsTab("runs")}
                >
                  İşlem geçmişi
                  {toolOpsSummary?.pendingApprovals ? (
                    <span>{toolOpsSummary.pendingApprovals}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={toolsTab === "crm"}
                  className={toolsTab === "crm" ? "active" : ""}
                  onClick={() => setToolsTab("crm")}
                >
                  Yerel CRM
                  <span>{toolOpsSummary?.crmContacts ?? crmContacts.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={toolsTab === "connections"}
                  className={toolsTab === "connections" ? "active" : ""}
                  onClick={() => setToolsTab("connections")}
                >
                  Bağlantılar
                  <span>{connectors.filter((connector) => connector.configured).length}</span>
                </button>
              </div>

              {toolsTab === "catalog" && (
                <>
              {toolsCatalog.length === 0 ? (
                <div className="knowledge-empty">
                  <div className="empty-spark"><Icon name="tools" /></div>
                  <h3>Henüz araç yok</h3>
                  <p>Built-in araçlar registry'ye eklendiğinde burada görünecek.</p>
                </div>
              ) : (
                <div className="tools-grid">
                  {toolsCatalog.map((tool) => {
                    const writeLike =
                      tool.riskLevel === "write" ||
                      tool.riskLevel === "destructive" ||
                      tool.riskLevel === "external_share";

                    return (
                      <article className={`tool-card ${tool.enabled ? "" : "disabled"}`} key={tool.id}>
                        <div className="tool-card-top">
                          <div className="tool-card-icon"><Icon name="tools" /></div>
                          <div className="tool-card-heading">
                            <strong>{tool.displayName}</strong>
                            <code>{tool.name}</code>
                          </div>
                          <button
                            className={`tool-toggle ${tool.enabled ? "active" : ""}`}
                            onClick={() => void toggleToolEnabled(tool)}
                            disabled={toolSavingId === tool.id}
                            aria-pressed={tool.enabled}
                          >
                            <span />
                            {toolSavingId === tool.id
                              ? "Kaydediliyor"
                              : tool.enabled
                                ? "Katalog aktif"
                                : "Kapalı"}
                          </button>
                        </div>

                        <p>{tool.description}</p>

                        <div className="tool-card-meta">
                          <span className={`tool-risk risk-${tool.riskLevel}`}>
                            {toolRiskLabel(tool.riskLevel)}
                          </span>
                          <span className="tool-approval">
                            {toolApprovalLabel(tool.approvalPolicy)}
                          </span>
                        </div>

                        <div className="tool-card-foot">
                          <span>
                            {writeLike && !toolFlags?.writesEnabled
                              ? "Global yazma anahtarı kapalı"
                              : !toolFlags?.toolsEnabled
                                ? "Master tool anahtarı kapalı"
                                : "Policy katmanı hazır"}
                          </span>
                          <span>{tool.executionReady ? "Execution hazır" : "Yakında"}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="tools-note">
                <Icon name="check" size={18} />
                <div>
                  <strong>Yetki prompt'tan gelmez</strong>
                  <span>
                    Bir araç yalnız katalogda aktifse ve ayrıca ajana atanmışsa
                    kullanılabilir. Model, PDF veya kullanıcı mesajı bu izni genişletemez.
                  </span>
                </div>
              </div>
                </>
              )}

              {toolsTab === "runs" && (
                <div className="operations-panel">
                  <div className="operations-summary-grid">
                    <article>
                      <span>Toplam işlem</span>
                      <strong>{toolOpsSummary?.totalRuns ?? 0}</strong>
                    </article>
                    <article>
                      <span>Başarılı</span>
                      <strong>{toolOpsSummary?.successRuns ?? 0}</strong>
                    </article>
                    <article>
                      <span>Onay bekleyen</span>
                      <strong>{toolOpsSummary?.pendingApprovals ?? 0}</strong>
                    </article>
                    <article>
                      <span>Hata</span>
                      <strong>{toolOpsSummary?.failedRuns ?? 0}</strong>
                    </article>
                  </div>

                  <div className="operations-toolbar">
                    <div>
                      <span className="eyebrow">TOOL RUNS</span>
                      <h2>İşlem geçmişi</h2>
                    </div>
                    <div className="operations-actions">
                      <select
                        value={runStatusFilter}
                        onChange={(event) =>
                          setRunStatusFilter(
                            event.target.value as "all" | ToolRunStatus,
                          )
                        }
                        aria-label="Durum filtresi"
                      >
                        <option value="all">Tüm durumlar</option>
                        <option value="success">Başarılı</option>
                        <option value="approval_required">Onay bekleyen</option>
                        <option value="rejected">Reddedildi</option>
                        <option value="failed">Hata</option>
                        <option value="cancelled">İptal</option>
                      </select>
                      <button
                        type="button"
                        className="ghost compact"
                        onClick={() => void refreshToolOperations()}
                        disabled={toolOpsLoading}
                      >
                        <Icon name="refresh" size={15} />
                        {toolOpsLoading ? "Yenileniyor" : "Yenile"}
                      </button>
                    </div>
                  </div>

                  {toolOpsLoading && toolRuns.length === 0 ? (
                    <div className="operations-empty">
                      <span>İşlem geçmişi yükleniyor…</span>
                    </div>
                  ) : filteredToolRuns.length === 0 ? (
                    <div className="operations-empty">
                      <div className="empty-spark"><Icon name="tools" /></div>
                      <h3>Bu filtrede işlem yok</h3>
                      <p>Playground'da bir tool çalıştırdığında burada görünecek.</p>
                    </div>
                  ) : (
                    <div className="operations-table-wrap">
                      <div className="operations-table operations-table-head">
                        <span>Araç</span>
                        <span>Ajan</span>
                        <span>Durum</span>
                        <span>Süre</span>
                        <span>Zaman</span>
                        <span />
                      </div>
                      {filteredToolRuns.map((run) => (
                        <button
                          type="button"
                          className="operations-table operations-row"
                          key={run.id}
                          onClick={() => void openToolRunDetail(run.id)}
                          disabled={toolRunDetailLoading}
                        >
                          <span className="operation-tool-cell">
                            <strong>{run.toolDisplayName}</strong>
                            <small>{run.toolName}</small>
                          </span>
                          <span>{agentName(run.agentId)}</span>
                          <span>
                            <i className={`run-status status-${run.status}`}>
                              {toolRunStatusLabel(run.status)}
                            </i>
                          </span>
                          <span>
                            {typeof run.durationMs === "number"
                              ? `${run.durationMs} ms`
                              : "—"}
                          </span>
                          <span>{formatDateTime(run.createdAt)}</span>
                          <span className="operation-arrow">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {toolsTab === "crm" && (
                <div className="operations-panel">
                  <div className="crm-overview-card">
                    <div>
                      <span className="eyebrow">LOCAL CRM</span>
                      <h2>Yerel müşteriler</h2>
                      <p>
                        Onaylanmış <code>create_crm_contact</code> işlemleriyle
                        oluşturulan kayıtlar. Bu görünüm salt okunurdur.
                      </p>
                    </div>
                    <strong>{toolOpsSummary?.crmContacts ?? crmContacts.length}</strong>
                  </div>

                  <div className="operations-toolbar crm-toolbar">
                    <label className="crm-search">
                      <span>Ara</span>
                      <input
                        value={crmSearch}
                        onChange={(event) => setCrmSearch(event.target.value)}
                        placeholder="İsim, e-posta, telefon veya CRM ID"
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost compact"
                      onClick={() => void refreshToolOperations()}
                      disabled={toolOpsLoading}
                    >
                      <Icon name="refresh" size={15} />
                      {toolOpsLoading ? "Yenileniyor" : "Yenile"}
                    </button>
                  </div>

                  {filteredCrmContacts.length === 0 ? (
                    <div className="operations-empty">
                      <div className="empty-spark"><Icon name="business" /></div>
                      <h3>
                        {crmSearch.trim() ? "Eşleşen müşteri yok" : "Henüz CRM kaydı yok"}
                      </h3>
                      <p>
                        {crmSearch.trim()
                          ? "Arama terimini değiştirip tekrar deneyebilirsin."
                          : "Gerçek write onayı tamamlandığında müşteri burada görünür."}
                      </p>
                    </div>
                  ) : (
                    <div className="crm-contact-list">
                      {filteredCrmContacts.map((contact) => (
                        <article className="crm-contact-row" key={contact.id}>
                          <div className="crm-avatar">
                            {contact.name.trim().slice(0, 1).toLocaleUpperCase("tr") || "?"}
                          </div>
                          <div className="crm-contact-main">
                            <div>
                              <strong>{contact.name}</strong>
                              <code>{contact.id}</code>
                            </div>
                            <div className="crm-contact-meta">
                              <span>{contact.email || "E-posta yok"}</span>
                              <span>{contact.phone || "Telefon yok"}</span>
                              <span>{formatDateTime(contact.createdAt)}</span>
                            </div>
                            {contact.notes && <p>{contact.notes}</p>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {toolsTab === "connections" && (
                <div className="connections-panel">
                  <div className="connector-foundation-card">
                    <div>
                      <span className="eyebrow accent">HTTP / WEBHOOK FOUNDATION</span>
                      <h2>Harici bağlantılar</h2>
                      <p>
                        Connector hedefleri model veya kullanıcı mesajından gelmez.
                        Origin ve secret yalnız sunucu ortam değişkenlerinden okunur;
                        outbound istekler HTTPS, SSRF policy, DNS doğrulama ve pinned IP
                        üzerinden çalışır.
                      </p>
                    </div>
                    <span className="connector-foundation-badge">
                      {connectors.filter((connector) => connector.configured).length}
                      /{connectors.length} yapılandırılmış
                    </span>
                  </div>

                  <div className="connector-security-strip">
                    <span><Icon name="check" size={14} /> HTTPS only</span>
                    <span><Icon name="check" size={14} /> Redirect kapalı</span>
                    <span><Icon name="check" size={14} /> Public IPv4</span>
                    <span><Icon name="check" size={14} /> Secret server-side</span>
                  </div>

                  <div className="connector-grid">
                    {connectors.map((connector) => {
                      const result = connectorResults[connector.id];
                      const isTesting = connectorTestingId === connector.id;

                      return (
                        <article
                          className={`connector-card ${connector.configured ? "configured" : ""}`}
                          key={connector.id}
                        >
                          <div className="connector-card-head">
                            <div className="connector-icon">
                              <Icon name="tools" size={17} />
                            </div>
                            <div>
                              <strong>{connector.displayName}</strong>
                              <span>
                                {connector.kind === "webhook"
                                  ? "Outbound webhook"
                                  : "HTTP JSON API"}
                              </span>
                            </div>
                            <i
                              className={`connector-status ${connector.configured ? "ready" : "missing"}`}
                            >
                              {connector.configured
                                ? "Yapılandırıldı"
                                : "Yapılandırılmadı"}
                            </i>
                          </div>

                          <p>{connector.description}</p>

                          <div className="connector-meta-grid">
                            <div>
                              <span>Origin</span>
                              <strong>{connector.origin || "—"}</strong>
                            </div>
                            <div>
                              <span>Mod</span>
                              <strong>
                                {connector.outboundMode === "write"
                                  ? "Write / external"
                                  : "Read"}
                              </strong>
                            </div>
                            <div>
                              <span>Auth</span>
                              <strong>
                                {connector.authType === "none"
                                  ? "Yok"
                                  : connector.secretConfigured
                                    ? "Bearer · hazır"
                                    : "Bearer · secret yok"}
                              </strong>
                            </div>
                            <div>
                              <span>Host</span>
                              <strong>{connector.hostname || "—"}</strong>
                            </div>
                          </div>

                          {connector.configurationError && (
                            <div className="connector-error">
                              {connector.configurationError}
                            </div>
                          )}

                          <div className="connector-env">
                            <span>Sunucu ayarları</span>
                            <code>{connector.env.baseUrl}</code>
                            {connector.env.secret && (
                              <code>{connector.env.secret}</code>
                            )}
                            {connector.env.healthPath && (
                              <code>{connector.env.healthPath}</code>
                            )}
                          </div>

                          {result && (
                            <div
                              className={`connector-test-result ${result.ok ? "success" : "failed"}`}
                            >
                              <strong>
                                {result.ok ? "Bağlantı başarılı" : "Bağlantı başarısız"}
                              </strong>
                              <span>{result.message}</span>
                              <small>
                                {result.hostname || "—"}
                                {result.statusCode !== null
                                  ? ` · HTTP ${result.statusCode}`
                                  : ""}
                                {result.durationMs
                                  ? ` · ${result.durationMs} ms`
                                  : ""}
                              </small>
                            </div>
                          )}

                          <div className="connector-card-actions">
                            {connector.testable ? (
                              <button
                                type="button"
                                className="primary connector-test-button"
                                disabled={!connector.configured || isTesting}
                                onClick={() =>
                                  void testConnectorConnection(connector.id)
                                }
                              >
                                {isTesting ? "Test ediliyor…" : "Bağlantıyı test et"}
                              </button>
                            ) : (
                              <span className="connector-planned">
                                Gönderim executor'ı sonraki aşama
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="tools-note connector-note">
                    <Icon name="check" size={18} />
                    <div>
                      <strong>Arbitrary URL yok</strong>
                      <span>
                        Model endpoint, host, header veya secret seçemez. Bu foundation
                        yalnız operator tarafından sunucuda tanımlanan sabit connector
                        profillerini kullanır.
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </section>
          )}

          {view === "agents" && (
            <section className="page-section">
              <div className="page-title">
                <div>
                  <span className="eyebrow accent">AI WORKFORCE</span>
                  <h1>Ajanlar</h1>
                  <p>Her görev için ayrı rol, hedef ve talimat seti oluştur.</p>
                </div>
                <button className="primary" onClick={openNewAgent}>
                  <Icon name="plus" /> Yeni ajan
                </button>
              </div>

              <div className="agent-grid large">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onOpen={() => openPlayground(agent)}
                    onEdit={() => openEditAgent(agent)}
                    onDelete={() => removeAgent(agent)}
                  />
                ))}
                <button className="agent-card add-card" onClick={openNewAgent}>
                  <div className="add-circle"><Icon name="plus" /></div>
                  <strong>Yeni ajan oluştur</strong>
                  <span>Yeni bir uzman rolü ekle</span>
                </button>
              </div>
            </section>
          )}
        </div>
      </section>

      {toolRunDetail && (
        <div className="modal-layer operations-layer" role="dialog" aria-modal="true">
          <button
            className="modal-backdrop"
            onClick={() => setToolRunDetail(null)}
            aria-label="İşlem detayını kapat"
          />
          <aside className="operations-drawer">
            <div className="operations-drawer-head">
              <div>
                <span className="eyebrow accent">TOOL RUN</span>
                <h2>{toolRunDetail.toolDisplayName}</h2>
                <p>{formatDateTime(toolRunDetail.createdAt)}</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setToolRunDetail(null)}
              >
                ×
              </button>
            </div>

            <div className="operations-drawer-body">
              <div className="run-detail-status-row">
                <span className={`run-status status-${toolRunDetail.status}`}>
                  {toolRunStatusLabel(toolRunDetail.status)}
                </span>
                <code>{toolRunDetail.toolName}</code>
              </div>

              <div className="run-detail-grid">
                <div><span>Ajan</span><strong>{agentName(toolRunDetail.agentId)}</strong></div>
                <div><span>Süre</span><strong>{typeof toolRunDetail.durationMs === "number" ? `${toolRunDetail.durationMs} ms` : "—"}</strong></div>
                <div><span>Risk</span><strong>{toolRiskLabel(toolRunDetail.riskLevel)}</strong></div>
                <div><span>Deneme</span><strong>{toolRunDetail.attemptCount}</strong></div>
                <div><span>Run ID</span><strong className="mono-wrap">{toolRunDetail.id}</strong></div>
                <div><span>Trace ID</span><strong className="mono-wrap">{toolRunDetail.traceId}</strong></div>
              </div>

              {toolRunDetail.approval && (
                <section className="run-detail-section">
                  <div className="run-detail-section-title">
                    <strong>Onay</strong>
                    <span>{toolRunDetail.approval.decision}</span>
                  </div>
                  <div className="run-detail-grid compact">
                    <div><span>Onaylandı</span><strong>{formatDateTime(toolRunDetail.approval.approvedAt)}</strong></div>
                    <div><span>Reddedildi</span><strong>{formatDateTime(toolRunDetail.approval.rejectedAt)}</strong></div>
                    <div><span>Son geçerlilik</span><strong>{formatDateTime(toolRunDetail.approval.expiresAt)}</strong></div>
                  </div>
                </section>
              )}

              <section className="run-detail-section">
                <div className="run-detail-section-title"><strong>Argümanlar</strong></div>
                <DetailObject value={toolRunDetail.arguments} />
              </section>

              <section className="run-detail-section">
                <div className="run-detail-section-title"><strong>Sonuç</strong></div>
                <DetailObject value={toolRunDetail.result} empty="Sonuç kaydı yok" />
                {toolRunDetail.errorCode && (
                  <p className="run-error-code">Hata kodu: {toolRunDetail.errorCode}</p>
                )}
              </section>

              <section className="run-detail-section">
                <div className="run-detail-section-title">
                  <strong>Denemeler</strong>
                  <span>{toolRunDetail.attempts.length}</span>
                </div>
                {toolRunDetail.attempts.length === 0 ? (
                  <p className="operations-empty-copy">Execution attempt kaydı yok.</p>
                ) : (
                  <div className="attempt-list">
                    {toolRunDetail.attempts.map((attempt) => (
                      <div key={attempt.attemptNumber}>
                        <span>#{attempt.attemptNumber}</span>
                        <strong>{attempt.outcome}</strong>
                        <small>
                          {typeof attempt.durationMs === "number"
                            ? `${attempt.durationMs} ms`
                            : "—"}
                        </small>
                        {attempt.errorCode && <code>{attempt.errorCode}</code>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="run-detail-section">
                <div className="run-detail-section-title">
                  <strong>Audit trail</strong>
                  <span>{toolRunDetail.auditEvents.length}</span>
                </div>
                {toolRunDetail.auditEvents.length === 0 ? (
                  <p className="operations-empty-copy">Audit olayı yok.</p>
                ) : (
                  <div className="audit-timeline">
                    {toolRunDetail.auditEvents.map((event) => (
                      <article key={event.id}>
                        <i />
                        <div>
                          <div className="audit-event-head">
                            <strong>{humanizeKey(event.eventType)}</strong>
                            <span>{formatDateTime(event.createdAt)}</span>
                          </div>
                          {Object.keys(event.metadata).length > 0 && (
                            <DetailObject value={event.metadata} />
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}

      {editorOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true">
          <button className="modal-backdrop" onClick={() => setEditorOpen(false)} aria-label="Pencereyi kapat" />
          <form className="drawer" onSubmit={saveAgent}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow accent">{editingId ? "AJANI DÜZENLE" : "YENİ AJAN"}</span>
                <h2>{editingId ? "Ajan ayarları" : "Yeni uzman oluştur"}</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setEditorOpen(false)}>×</button>
            </div>
            <div className="drawer-body">
              <div className="form-grid emoji-name">
                <Field label="Simge" value={agentForm.emoji} onChange={(value) => setAgentForm({ ...agentForm, emoji: value })} />
                <Field label="Ajan adı" value={agentForm.name} placeholder="Örn. Satış Danışmanı" onChange={(value) => setAgentForm({ ...agentForm, name: value })} />
              </div>
              <Field label="Rol" value={agentForm.role} placeholder="Örn. B2B satış danışmanı" onChange={(value) => setAgentForm({ ...agentForm, role: value })} />
              <Field textarea label="Ana hedef" value={agentForm.goal} placeholder="Bu ajan neyi başarmalı?" onChange={(value) => setAgentForm({ ...agentForm, goal: value })} />
              <Field textarea tall label="Özel talimatlar" value={agentForm.instructions} placeholder="Davranış kuralları, sınırlar, cevap formatı, öncelikler..." onChange={(value) => setAgentForm({ ...agentForm, instructions: value })} />

              <label className="field">
                <span>Model</span>
                <select value={agentForm.model} onChange={(event) => setAgentForm({ ...agentForm, model: event.target.value })}>
                  {models.map((model) => (
                    <option key={model.value} value={model.value}>{model.label} — {model.hint}</option>
                  ))}
                </select>
              </label>

              <div className="knowledge-picker">
                <div className="knowledge-picker-head">
                  <div>
                    <strong>Bilgi kaynakları</strong>
                    <span>Bu ajanın RAG aramasında kullanabileceği belgeleri seç.</span>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setAgentKnowledgeIds(
                        documents
                          .filter((document) => document.status === "ready")
                          .map((document) => document.id),
                      )
                    }
                  >
                    Tümünü seç
                  </button>
                </div>

                {documents.some((document) => document.status === "ready") ? (
                  <div className="knowledge-options">
                    {documents
                      .filter((document) => document.status === "ready")
                      .map((document) => {
                        const checked = agentKnowledgeIds.includes(document.id);
                        return (
                          <label className="knowledge-option" key={document.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAgentKnowledgeIds((current) =>
                                  checked
                                    ? current.filter((id) => id !== document.id)
                                    : [...current, document.id],
                                )
                              }
                            />
                            <span className="knowledge-option-check">
                              {checked && <Icon name="check" size={14} />}
                            </span>
                            <span>
                              <strong>{document.originalName}</strong>
                              <small>{document.chunkCount} parça</small>
                            </span>
                          </label>
                        );
                      })}
                  </div>
                ) : (
                  <div className="knowledge-picker-empty">
                    Hazır belge yok. Önce Bilgi Tabanı sayfasından bir dosya yükle.
                  </div>
                )}
              </div>

              <div className="knowledge-picker tool-picker">
                <div className="knowledge-picker-head">
                  <div>
                    <strong>Araç izinleri</strong>
                    <span>Bu ajanın hangi araçları kullanabileceğini belirle.</span>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setAgentToolIds(
                        toolsCatalog
                          .filter((tool) => tool.enabled && tool.riskLevel === "read")
                          .map((tool) => tool.id),
                      )
                    }
                  >
                    Okuma araçlarını seç
                  </button>
                </div>

                {toolsCatalog.length ? (
                  <div className="tool-permission-options">
                    {toolsCatalog.map((tool) => {
                      const checked = agentToolIds.includes(tool.id);
                      const unavailable =
                        !tool.enabled || (!tool.executionReady && !checked);

                      return (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-disabled={unavailable}
                          disabled={unavailable}
                          className={`tool-permission-option ${checked ? "selected" : ""} ${unavailable ? "disabled" : ""}`}
                          key={tool.id}
                          onClick={() =>
                            setAgentToolIds((current) =>
                              checked
                                ? current.filter((id) => id !== tool.id)
                                : [...current, tool.id],
                            )
                          }
                        >
                          <span className="knowledge-option-check">
                            {checked && <Icon name="check" size={14} />}
                          </span>
                          <span className="tool-permission-copy">
                            <strong>{tool.displayName}</strong>
                            <small>
                              {toolRiskLabel(tool.riskLevel)} · {toolApprovalLabel(tool.approvalPolicy)}
                            </small>
                          </span>
                          <span className={`tool-permission-state ${tool.enabled && tool.executionReady ? "active" : ""}`}>
                            {!tool.executionReady
                              ? "Yakında"
                              : tool.enabled
                                ? "Execution hazır"
                                : "Araç kapalı"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="knowledge-picker-empty">
                    Araç kataloğu boş. Önce Araçlar sayfasını kontrol et.
                  </div>
                )}

                <div className="tool-picker-note">
                  Seçilen araçlar yalnız global güvenlik anahtarları izin veriyorsa Playground içinde kullanılabilir. Write araçları ayrıca kullanıcı onayı ister.
                </div>
              </div>

              <div className="context-note">
                <Icon name="check" />
                <div>
                  <strong>İşletme bağlamı otomatik eklenir</strong>
                  <span>Bu ajan, “İşletme Bilgileri” sayfasındaki tüm güncel bilgileri kullanır.</span>
                </div>
              </div>
            </div>
            <div className="drawer-actions">
              <button type="button" className="ghost" onClick={() => setEditorOpen(false)}>Vazgeç</button>
              <button className="primary">{editingId ? "Ajanı güncelle" : "Ajanı oluştur"}</button>
            </div>
          </form>
        </div>
      )}

      {playgroundAgent && (
        <div className="modal-layer playground-layer" role="dialog" aria-modal="true">
          <button
            className="modal-backdrop"
            onClick={() => {
              abortRef.current?.abort();
              setPlaygroundAgent(null);
            }}
            aria-label="Playground'u kapat"
          />
          <section className="playground playground-v2">
            <header className="playground-head">
              <div className="agent-icon">{playgroundAgent.emoji}</div>
              <div>
                <span className="eyebrow">PLAYGROUND</span>
                <h3>{playgroundAgent.name}</h3>
              </div>
              {latestDebug && (
                <button
                  className={`debug-toggle ${debugOpen ? "active" : ""}`}
                  onClick={() => setDebugOpen((value) => !value)}
                >
                  RAG Debug
                </button>
              )}
              <button
                className="close-button"
                onClick={() => {
                  abortRef.current?.abort();
                  setPlaygroundAgent(null);
                }}
              >
                ×
              </button>
            </header>

            <div className="playground-workspace">
              <aside className="conversation-sidebar">
                <div className="conversation-sidebar-head">
                  <div>
                    <span className="eyebrow">SOHBETLER</span>
                    <strong>Sohbet geçmişi</strong>
                  </div>
                  <button
                    className="conversation-new"
                    onClick={startNewConversation}
                    title="Yeni sohbet"
                  >
                    <Icon name="plus" size={14} />
                    <span>Yeni sohbet</span>
                  </button>
                </div>

                <div className="conversation-list">
                  {conversationLoading && conversations.length === 0 ? (
                    <div className="conversation-empty">Sohbetler yükleniyor…</div>
                  ) : conversations.length === 0 ? (
                    <div className="conversation-empty">
                      İlk mesajını gönderdiğinde sohbet burada kaydedilecek.
                    </div>
                  ) : (
                    conversations.map((conversation) => (
                      <div
                        className={`conversation-item ${activeConversationId === conversation.id ? "active" : ""}`}
                        key={conversation.id}
                      >
                        <button
                          className="conversation-open"
                          onClick={() => void loadConversation(conversation.id)}
                        >
                          <strong>{conversation.title}</strong>
                        </button>
                        <button
                          className="conversation-delete"
                          onClick={() => void removeConversation(conversation)}
                          aria-label="Sohbeti sil"
                          title="Sohbeti sil"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </aside>

              <div className="playground-chat-panel">
                {debugOpen && latestDebug && (
                  <aside className="rag-debug-panel rag-debug-v2">
                    <div className="rag-debug-head">
                      <div>
                        <span className="eyebrow accent">RETRIEVAL TRACE</span>
                        <strong>RAG Debug</strong>
                      </div>
                      <button className="close-button" onClick={() => setDebugOpen(false)}>×</button>
                    </div>

                    <div className="rag-debug-body">
                      <div className="debug-query">
                        <span>Sorgu</span>
                        <strong>{latestDebug.query}</strong>
                      </div>

                      <div className="debug-confidence-row">
                        <span className={`confidence-pill confidence-${latestDebug.confidence}`}>
                          {latestDebug.confidence === "high"
                            ? "Yüksek güven"
                            : latestDebug.confidence === "medium"
                              ? "Orta güven"
                              : latestDebug.confidence === "low"
                                ? "Düşük güven"
                                : "Kaynak yok"}
                        </span>
                        <small>semantic eşik {latestDebug.semanticThreshold.toFixed(2)}</small>
                      </div>

                      <div className="debug-stats">
                        <div><span>Belge</span><strong>{latestDebug.assignedDocumentCount}</strong></div>
                        <div><span>Chunk</span><strong>{latestDebug.indexedChunkCount}</strong></div>
                        <div><span>Seçilen token</span><strong>{latestDebug.selectedTokenCount}</strong></div>
                        <div><span>Toplam süre</span><strong>{latestDebug.timings.totalMs} ms</strong></div>
                      </div>

                      <div className="debug-timing">
                        Embedding {latestDebug.timings.embeddingMs} ms · retrieval {latestDebug.timings.retrievalMs} ms
                      </div>

                      <div className="debug-section">
                        <div className="debug-section-title">
                          <strong>Final seçim</strong>
                          <span>{latestDebug.selectedCandidates.length} chunk</span>
                        </div>

                        {latestDebug.selectedCandidates.length === 0 ? (
                          <p className="debug-empty">
                            Relevance eşiğini geçen kaynak bulunamadı.
                          </p>
                        ) : (
                          <div className="debug-candidates">
                            {latestDebug.selectedCandidates.map((candidate, index) => (
                              <button
                                key={candidate.chunkId}
                                onClick={() =>
                                  openSource(
                                    candidate.documentId,
                                    candidate.documentName,
                                    candidate.pageStart,
                                    candidate.chunkId,
                                  )
                                }
                              >
                                <span className="debug-rank">#{index + 1}</span>
                                <span className="debug-candidate-main">
                                  <strong>
                                    {candidate.documentName}
                                    {candidate.pageStart ? ` · s.${candidate.pageStart}` : ""}
                                  </strong>
                                  <small>
                                    {candidate.semanticScore !== undefined
                                      ? `semantic ${candidate.semanticScore.toFixed(3)} · `
                                      : ""}
                                    {candidate.keywordRank
                                      ? `keyword #${candidate.keywordRank} · `
                                      : ""}
                                    final {candidate.finalScore?.toFixed(4) || "—"}
                                  </small>
                                  {candidate.selectionReason && (
                                    <small>seçim: {candidate.selectionReason}</small>
                                  )}
                                  {candidate.preview && (
                                    <span className="debug-preview">{candidate.preview}</span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {latestDebug.rejectedCandidates.length > 0 && (
                        <div className="debug-section">
                          <div className="debug-section-title">
                            <strong>Elenen adaylar</strong>
                            <span>{latestDebug.rejectedCandidates.length}</span>
                          </div>
                          <div className="debug-rejected">
                            {latestDebug.rejectedCandidates.slice(0, 6).map((candidate) => (
                              <div key={`rejected-${candidate.chunkId}-${candidate.rejectedReason}`}>
                                <strong>
                                  {candidate.documentName}
                                  {candidate.pageStart ? ` · s.${candidate.pageStart}` : ""}
                                </strong>
                                <span>{candidate.rejectedReason || "elendi"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="debug-foot">
                        Semantic aday: {latestDebug.semanticCandidates.length} · keyword aday: {latestDebug.keywordCandidates.length}
                      </div>
                    </div>
                  </aside>
                )}

                <div className="chat-body">
                  {conversationLoading ? (
                    <div className="chat-empty">
                      <div className="empty-spark">✦</div>
                      <h3>Sohbet yükleniyor</h3>
                    </div>
                  ) : chat.length === 0 ? (
                    <div className="chat-empty">
                      <div className="empty-spark">✦</div>
                      <h3>Yeni sohbet</h3>
                      <p>
                        Mesaj gönderdiğinde sohbet bu ajan için yerel olarak kaydedilir.
                        Ajan yalnızca kendisine bağlanan bilgi kaynaklarından ilgili
                        parçaları kullanır.
                      </p>
                      <div className="suggestions">
                        {[
                          "Bana işletmenizi kısaca anlat.",
                          "Hangi hizmetleri sunuyorsunuz?",
                          "Neden sizi tercih etmeliyim?",
                        ].map((text) => (
                          <button key={text} onClick={() => setMessage(text)}>
                            {text}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="messages">
                      {chat.map((item, index) => {
                        const isLastAssistant =
                          item.role === "assistant" &&
                          index === chat.length - 1;

                        return (
                          <div
                            key={item.id || index}
                            className={`message ${item.role}`}
                          >
                            <span>
                              {item.role === "assistant"
                                ? playgroundAgent.emoji
                                : "Siz"}
                            </span>

                            <div className="message-content">
                              {item.role === "assistant" &&
                                item.toolActivities &&
                                item.toolActivities.length > 0 && (
                                  <div className="tool-activity-list">
                                    {item.toolActivities.map((activity) => (
                                      <ToolActivityCard
                                        key={activity.id}
                                        activity={activity}
                                        busy={approvalBusyId === activity.toolRunId}
                                        onDecision={decideToolApproval}
                                      />
                                    ))}
                                  </div>
                                )}

                              {item.role === "assistant" ? (
                                item.content ? (
                                  <MarkdownMessage content={item.content} />
                                ) : item.streaming ? (
                                  <p className="typing">
                                    Yanıt hazırlanıyor<span>...</span>
                                  </p>
                                ) : null
                              ) : (
                                <p>{item.content}</p>
                              )}

                              {item.role === "assistant" &&
                                item.sources &&
                                item.sources.length > 0 && (
                                  <div className="message-sources">
                                    <strong>Kaynaklar</strong>
                                    <div>
                                      {item.sources.map((source, sourceIndex) => (
                                        <button
                                          className="source-chip"
                                          key={`${source.documentId}-${source.chunkId || source.pageStart}-${sourceIndex}`}
                                          onClick={() =>
                                            openSource(
                                              source.documentId,
                                              source.documentName,
                                              source.pageStart,
                                              source.chunkId,
                                            )
                                          }
                                        >
                                          {source.documentName}
                                          {source.pageStart
                                            ? ` · s.${source.pageStart}`
                                            : ""}
                                          {source.extractionMethod === "ocr"
                                            ? " · OCR"
                                            : ""}
                                          {source.ocrConfidence !== null &&
                                          source.ocrConfidence !== undefined
                                            ? ` %${source.ocrConfidence}`
                                            : ""}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              {item.role === "assistant" &&
                                item.content &&
                                !item.streaming && (
                                  <div className="message-actions">
                                    <button
                                      onClick={() => void copyMessage(item.content)}
                                    >
                                      Kopyala
                                    </button>
                                    {isLastAssistant &&
                                      activeConversationId &&
                                      !sending && (
                                        <button onClick={regenerateLastResponse}>
                                          Yeniden oluştur
                                        </button>
                                      )}
                                  </div>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <form className="chat-input" onSubmit={sendMessage}>
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={
                      hasPendingApproval
                        ? "Önce bekleyen işlemi onaylayın veya reddedin."
                        : "Bir mesaj yazın..."
                    }
                    disabled={sending || hasPendingApproval || Boolean(approvalBusyId)}
                  />
                  {sending ? (
                    <button
                      type="button"
                      className="stop-button"
                      onClick={stopResponse}
                      aria-label="Yanıtı durdur"
                    >
                      ■
                    </button>
                  ) : (
                    <button
                      disabled={
                        !message.trim() ||
                        hasPendingApproval ||
                        Boolean(approvalBusyId)
                      }
                      aria-label="Gönder"
                    >
                      <Icon name="send" />
                    </button>
                  )}
                </form>
              </div>
            </div>
          </section>
        </div>
      )}

      {viewer && (
        <PdfSourceViewer
          documentId={viewer.documentId}
          documentName={viewer.documentName}
          initialPage={viewer.page}
          onClose={() => setViewer(null)}
        />
      )}

      {sourcePreview && (
        <TextSourceViewer
          documentId={sourcePreview.documentId}
          documentName={sourcePreview.documentName}
          chunkId={sourcePreview.chunkId}
          page={sourcePreview.page}
          onClose={() => setSourcePreview(null)}
        />
      )}

      {notice && <div className="toast"><Icon name="check" size={16} /> {notice}</div>}
    </main>
  );
}

function AgentCard({
  agent,
  onOpen,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  onOpen: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const model = models.find((item) => item.value === agent.model);

  return (
    <article className="agent-card">
      <div className="agent-card-top">
        <div className="agent-icon">{agent.emoji}</div>
        <span className="model-pill">{model?.label || agent.model}</span>
      </div>
      <div>
        <h3>{agent.name}</h3>
        <p>{agent.role || "Özel yapay zeka ajanı"}</p>
      </div>
      <div className="agent-card-actions">
        <button className="run-button" onClick={onOpen}><Icon name="spark" size={15} /> Test et</button>
        <button className="icon-button" onClick={onEdit} aria-label="Düzenle"><Icon name="edit" size={16} /></button>
        {onDelete && <button className="icon-button danger" onClick={onDelete} aria-label="Sil"><Icon name="trash" size={16} /></button>}
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  tall,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
  tall?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {textarea ? (
        <textarea
          className={tall ? "tall" : ""}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}


function knowledgeStatusLabel(status: KnowledgeDocument["status"]) {
  if (status === "ready") return "Hazır";
  if (status === "processing") return "İşleniyor";
  return "Hata";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
