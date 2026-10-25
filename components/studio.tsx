"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent, BusinessProfile, ChatMessage } from "@/lib/types";

type View = "overview" | "business" | "agents";

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

function Icon({
  name,
  size = 18,
}: {
  name: "home" | "business" | "agents" | "plus" | "arrow" | "spark" | "check" | "trash" | "edit" | "send" | "menu";
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-7h6v7" /></>,
    business: <><path d="M4 21V7l8-4 8 4v14" /><path d="M8 21v-5h8v5" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
    agents: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M9 12h.01M15 12h.01M9 16h6M12 7V4M9 4h6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    spark: <path d="m12 3 1.35 4.12L17.5 8.5l-4.15 1.38L12 14l-1.35-4.12L6.5 8.5l4.15-1.38L12 3ZM19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
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
  const [loading, setLoading] = useState(true);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState(blankAgent);
  const [playgroundAgent, setPlaygroundAgent] = useState<Agent | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/business").then((response) => response.json()),
      fetch("/api/agents").then((response) => response.json()),
    ])
      .then(([businessData, agentData]) => {
        setBusiness(businessData);
        setAgents(agentData);
      })
      .finally(() => setLoading(false));
  }, []);

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

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2400);
  }

  function navigate(next: View) {
    const routes: Record<View, string> = {
      overview: "/",
      business: "/bilgiler",
      agents: "/ajanlar",
    };
    setMobileNav(false);
    router.push(routes[next]);
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

  function openNewAgent() {
    setEditingId(null);
    setAgentForm(blankAgent);
    setEditorOpen(true);
  }

  function openEditAgent(agent: Agent) {
    setEditingId(agent.id);
    setAgentForm({
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      goal: agent.goal,
      instructions: agent.instructions,
      model: agent.model,
    });
    setEditorOpen(true);
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
    setEditorOpen(false);
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

  function openPlayground(agent: Agent) {
    setPlaygroundAgent(agent);
    setChat([]);
    setMessage("");
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!playgroundAgent || !message.trim() || sending) return;

    const userMessage: ChatMessage = { role: "user", content: message.trim() };
    const history = chat;
    setChat((current) => [...current, userMessage]);
    setMessage("");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: playgroundAgent.id,
          message: userMessage.content,
          history,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Yanıt alınamadı.");
      setChat((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (error) {
      setChat((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Bir hata oluştu.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const navItems: { id: View; label: string; icon: "home" | "business" | "agents" }[] = [
    { id: "overview", label: "Genel Bakış", icon: "home" },
    { id: "business", label: "İşletme Bilgileri", icon: "business" },
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
          <button className="modal-backdrop" onClick={() => setPlaygroundAgent(null)} aria-label="Playground'u kapat" />
          <section className="playground">
            <header className="playground-head">
              <div className="agent-icon">{playgroundAgent.emoji}</div>
              <div>
                <span className="eyebrow">PLAYGROUND</span>
                <h3>{playgroundAgent.name}</h3>
              </div>
              <button className="close-button" onClick={() => setPlaygroundAgent(null)}>×</button>
            </header>
            <div className="chat-body">
              {chat.length === 0 ? (
                <div className="chat-empty">
                  <div className="empty-spark">✦</div>
                  <h3>Ajanı test et</h3>
                  <p>Gerçek bir müşteri gibi mesaj gönder. Ajan işletme profilindeki bilgileri kullanarak yanıt verecek.</p>
                  <div className="suggestions">
                    {["Bana işletmenizi kısaca anlat.", "Hangi hizmetleri sunuyorsunuz?", "Neden sizi tercih etmeliyim?"].map((text) => (
                      <button key={text} onClick={() => setMessage(text)}>{text}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {chat.map((item, index) => (
                    <div key={index} className={`message ${item.role}`}>
                      <span>{item.role === "assistant" ? playgroundAgent.emoji : "Siz"}</span>
                      <p>{item.content}</p>
                    </div>
                  ))}
                  {sending && <div className="message assistant"><span>{playgroundAgent.emoji}</span><p className="typing">Yanıt hazırlanıyor<span>...</span></p></div>}
                </div>
              )}
            </div>
            <form className="chat-input" onSubmit={sendMessage}>
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Bir mesaj yazın..." />
              <button disabled={!message.trim() || sending} aria-label="Gönder"><Icon name="send" /></button>
            </form>
          </section>
        </div>
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
