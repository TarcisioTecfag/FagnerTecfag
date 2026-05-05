/**
 * client/src/pages/LiveChat.tsx
 *
 * Painel de monitoramento do Live Chat â€” REFATORADO
 * 4 abas: Chats | Visitantes | CRM | EstatÃ­sticas
 * 
 * Layout 100vh fixo, scroll apenas interno.
 * Fagner atende 100% via IA â€” este painel Ã© para MONITORAMENTO.
 * OpÃ§Ã£o de assumir manualmente em emergÃªncia.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { WS_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  Eye,
  Users,
  BarChart3,
  Send,
  AlertTriangle,
  Bot,
  User,
  Globe,
  Clock,
  MapPin,
  MousePointer,
  TrendingUp,
  RefreshCw,
  Search,
  Activity,
  Zap,
  ChevronRight,
  ExternalLink,
  Hash,
  Layers,
  FileText,
  X,
  Filter,
  Settings,
  Calendar,
  Plus,
  Trash2,
  RotateCcw,
  UserCheck,
  Pencil,
  Check,
  Code,
  Mic,
  MicOff,
  Square,
  Target,
  Paperclip,
} from "lucide-react";
import { CustomerModal } from "@/components/CustomerModal";
import ActivationRateCard    from "../components/dashboard/ActivationRateCard";
import ContainmentRateCard   from "../components/dashboard/ContainmentRateCard";
import LatencyCard           from "../components/dashboard/LatencyCard";
import UnhandledIntentsCard  from "../components/dashboard/UnhandledIntentsCard";
import RetentionCohortCard   from "../components/dashboard/RetentionCohortCard";
import FunnelCard            from "../components/dashboard/FunnelCard";
import LeadScoringCard       from "../components/dashboard/LeadScoringCard";
import PreChatPagesCard      from "../components/dashboard/PreChatPagesCard";
import ReportExportModal     from "../components/dashboard/ReportExportModal";
import { useStatsData }      from "../components/dashboard/useStatsData";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Visitor {
  id: string;
  cookieId: string;
  ip?: string;
  city?: string;
  country?: string;
  browser?: string;
  deviceType?: string;                   // #9 — 'mobile' | 'tablet' | 'desktop'
  currentPage?: string;
  currentPageTitle?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  totalVisits: number;
  totalPages: number;
  totalChats: number;
  category: string;
  engagementScore: number;
  purchaseIntentScore?: number;           // #4 — Score de intenção de compra (0-100)
  totalTimeSeconds?: number;              // Tempo total acumulado no site (em segundos) — campo TEMPO
  aiBriefing?: {                          // #7 — Briefing estruturado gerado pela IA
    produtoInteresse?: string;
    fabricaO?: string;
    volume?: string;
    sentimento?: string;
    proximaAcao?: string;
    geradoEm?: string;
  };
  isOnline: string;
  pipelineStage: string;
  firstSeenAt: string;
  lastSeenAt: string;
  name?: string;
  notes?: { date: string; stage: string; content: string }[];
  // Dados do cliente (base — usados em todos os fluxos)
  posVendaNome?: string;
  posVendaTelefone?: string;
  posVendaEmail?: string;
  posVendaCnpjCpf?: string;
  // Pós Venda específico
  posVendaNotaPedido?: string;
  posVendaProblema?: string;
  // Peças específico
  pecaDesejada?: string;
  pecasECliente?: string;
  // Máquinas específico
  maquinaProdutoFabricado?: string;
  maquinaVolumeProducao?: string;
  maquinaQualificacaoSDR?: string;
  maquinaClienteNovo?: string;
  maquinaDesejada?: string;
}

interface Chat {
  id: string;
  visitorId: string;
  agentId?: string | null;
  status: string;
  startedAt: string;
  endedAt?: string;
  visitorName?: string;
  source: string;
  aiHandled: string;
  needsHuman: string;
  mood?: string;
  // Melhoria 1: score de engajamento da conversa
  engagementScore?: number;
  // Melhoria 2: produto VTEX detectado na conversa
  vtexProduct?: string;
  // Melhoria 3: quantidade de msgs filtradas como ruído
  noiseFiltered?: number;
}

interface Message {
  id: string;
  chatId: string;
  sender: string;
  content: string;
  read: string;
  sentAt: string;
  attachments?: { url: string; name: string; mimeType: string; size?: number }[];
}

interface Stats {
  onlineVisitors: number;
  activeChats: number;
  needsHuman: number;
  totalChatsToday: number;
  totalVisitorsToday: number;
  totalVisitorsAll: number;
  totalIdentifiedAll?: number;
  totalOfflineAll?: number;
}

interface Pageview {
  id: string;
  visitorId: string;
  url: string;
  pageTitle?: string;
  scrollDepth?: number;     // #1 — % da página scrollada
  timeSpent?: number;       // #1 — segundos na página
  intentTag?: string;       // #2 — tag de intenção resolvida
  visitedAt: string;
}

// #10 — Evento na timeline unificada
interface TimelineEvent {
  type: string;
  timestamp: string;
  label: string;
  meta?: Record<string, any>;
}

// #8 — Analytics pré-chat
interface PreChatPage {
  url: string;
  pageTitle: string | null;
  count: number;
}

interface ConversionRate {
  url: string;
  visitors: number;
  converted: number;
  rate: number;
}

// ——— Helpers —————————————————————————————————————————————————

function categoryLabel(cat: string): { label: string; emoji: string; color: string; bg: string } {
  switch (cat) {
    case "lead_hot": return { label: "Lead Quente", emoji: "\u{1F534}", color: "text-red-400", bg: "bg-red-500/15 border-red-500/20" };
    case "lead_warm": return { label: "Lead Morno", emoji: "\u{1F7E1}", color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/20" };
    case "customer": return { label: "Cliente", emoji: "\u2B50", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/20" };
    case "returning": return { label: "Retorno", emoji: "\u{1F504}", color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/20" };
    default: return { label: "Visitante", emoji: "\u{1F7E2}", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/20" };
  }
}

function statusBadge(status: string): { label: string; icon: string; color: string; bg: string } {
  switch (status) {
    case "ai_active": return { label: "IA Ativa", icon: "\u{1F916}", color: "text-emerald-600", bg: "bg-emerald-500/15" };
    case "human_active": return { label: "Agente", icon: "\u{1F464}", color: "text-blue-600", bg: "bg-blue-500/15" };
    case "waiting": return { label: "Aguardando", icon: "\u23F3", color: "text-yellow-600", bg: "bg-yellow-500/15" };
    case "closed": return { label: "Encerrado", icon: "\u2705", color: "text-zinc-500", bg: "bg-zinc-500/15" };
    default: return { label: status, icon: "\u25FB", color: "text-zinc-500", bg: "bg-zinc-500/15" };
  }
}

function sourceLabel(src?: string): { label: string; icon: string } {
  switch (src) {
    case "google_organic": return { label: "Google Orgânico", icon: "\u{1F50D}" };
    case "google_ads": return { label: "Google Ads", icon: "\u{1F4E2}" };
    case "instagram": return { label: "Instagram", icon: "\u{1F4F8}" };
    case "facebook": return { label: "Facebook", icon: "\u{1F4D8}" };
    case "youtube": return { label: "YouTube", icon: "\u25B6\uFE0F" };
    case "direct": return { label: "Direto", icon: "\u{1F517}" };
    case "referral": return { label: "Indicação", icon: "\u{1F91D}" };
    case "whatsapp": return { label: "WhatsApp", icon: "\u{1F4AC}" };
    default: return { label: src ?? "Outro", icon: "\u{1F30E}" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// Bug 3.1: horário exato (HH:MM) para as mensagens do chat do operador
function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Retorna data no formato dd/MM/yyyy para exibição na lista de chats
function formatDateBR(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

function formatTextWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
    }
    return part;
  });
}

// ─── Admin Product Card (igual ao widget, mas adaptado para fundo escuro/claro) ─
function AdminProductCard({ url, isAgentMsg }: { url: string; isAgentMsg: boolean }) {
  const [meta, setMeta] = useState<{ title: string; image: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const BACKEND = (import.meta.env.VITE_BACKEND_URL || "https://fagnertecfag-production.up.railway.app").replace(/\/$/, "");

  useEffect(() => {
    let cancelled = false;
    const segments = url.split("/").filter(Boolean);
    let slug = segments.pop() || "";
    if (slug.toLowerCase() === "p" && segments.length > 0) slug = segments.pop() || slug;
    const fallbackTitle = slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\.html?$/, "");
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/proxy-meta?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setMeta({ title: data.title || fallbackTitle, image: data.image || "" });
        } else {
          if (!cancelled) setMeta({ title: fallbackTitle, image: "" });
        }
      } catch {
        if (!cancelled) setMeta({ title: fallbackTitle, image: "" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-white/20 bg-white/10 p-3 animate-pulse w-full max-w-[260px]">
        <div className="h-20 bg-white/10 rounded-lg mb-2" />
        <div className="h-3 bg-white/10 rounded w-3/4" />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-xl overflow-hidden border border-white/20 bg-white/10 hover:bg-white/15 transition-all hover:scale-[1.01] no-underline w-full max-w-[260px]"
      style={{ textDecoration: "none" }}
    >
      {meta?.image && (
        <div className="w-full h-24 overflow-hidden bg-white">
          <img
            src={`${BACKEND}/api/proxy-image?url=${encodeURIComponent(meta.image)}`}
            alt={meta?.title || "Produto"}
            className="w-full h-full object-contain p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate text-white">{meta?.title || "Produto Tecfag"}</p>
          <p className="text-[10px] text-white/60 mt-0.5">tecfag.com.br</p>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </div>
    </a>
  );
}

function renderMessageContent(text: string, isAgentMsg = false) {
  if (!text) return null;

  // ── Detecta mensagem de áudio do operador: [AUDIO:url] ──────────────────────
  const audioTagMatch = text.trim().match(/^\[AUDIO:(https?:\/\/[^\]]+)\]$/);
  if (audioTagMatch) {
    const audioUrl = audioTagMatch[1];
    return (
      <div className="flex flex-col gap-1.5 my-1">
        <span className="text-[10px] font-semibold opacity-70">🎙️ Mensagem de voz</span>
        <audio
          controls
          src={audioUrl}
          className="rounded-lg"
          style={{ minWidth: 200, maxWidth: 280 }}
        />
      </div>
    );
  }

  const BACKEND = (import.meta.env.VITE_BACKEND_URL || "https://fagnertecfag-production.up.railway.app").replace(/\/$/, "");
  const BACKEND_HOST = BACKEND.replace(/^https?:\/\//, "");

  // Normaliza URLs sem protocolo (ex: dominio.com/uploads/...) para https://dominio.com/uploads/...
  const normalizedText = text.replace(
    new RegExp(`(?<![:/])\\b(${BACKEND_HOST.replace(/\\./g, "\\\\.")}\/[^\\s)]+)`, "gi"),
    "https://$1"
  );

  // Regex de deteccao
  const TECFAG_URL_REGEX = /https?:\/\/(?:www\.)?tecfag\.com\.br\/[^\s)]+/gi;
  const PDF_URL_REGEX = /https?:\/\/[^\s)]+\.pdf(?:\?[^\s)]*)?/gi;
  const BACKEND_PDF_REGEX = /\/uploads\/[^\s)]+\.pdf/gi;
  const ANEXO_REGEX = /\[Anexo_Cliente:\s*(.+?)\]/g;

  // Extrai rich embeds — PDFs detectados para agentes E para IA
  const productUrls: string[] = [];
  const pdfUrls: { url: string; title: string }[] = [];
  let processedText = normalizedText;

  // Produto Tecfag — apenas mensagens do agente humano
  if (isAgentMsg) {
    const productMatches = Array.from(normalizedText.matchAll(new RegExp(TECFAG_URL_REGEX.source, "gi")));
    for (const m of productMatches) {
      const u = m[0];
      if (!u.toLowerCase().endsWith(".pdf") && !u.includes("/checkout?")) {
        productUrls.push(u);
        processedText = processedText.replace(u, "").trim();
      }
    }
  }

  // PDF com https:// — agente + IA
  const pdfMatches = Array.from(processedText.matchAll(new RegExp(PDF_URL_REGEX.source, "gi")));
  for (const m of pdfMatches) {
    const u = m[0].trim();
    const rawName = u.split("/").pop()?.split("?")[0] || "Manual.pdf";
    const title = decodeURIComponent(rawName).replace(/-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-?/i, " ").replace(/\.pdf$/i,"").trim() + ".pdf";
    pdfUrls.push({ url: u, title });
    processedText = processedText.replace(m[0], "").trim();
  }

  // PDF com /uploads/ relativo — converte para URL absoluta
  const backendPdfMatches = Array.from(processedText.matchAll(new RegExp(BACKEND_PDF_REGEX.source, "gi")));
  for (const m of backendPdfMatches) {
    const relPath = m[0].trim();
    const absUrl = `${BACKEND}${relPath}`;
    const rawName = relPath.split("/").pop() || "Manual.pdf";
    const title = decodeURIComponent(rawName).replace(/-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-?/i, " ").replace(/\.pdf$/i,"").trim() + ".pdf";
    pdfUrls.push({ url: absUrl, title });
    processedText = processedText.replace(relPath, "").trim();
  }

  // Anexos do cliente ([Anexo_Cliente: url])
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const anexoRegex = new RegExp(ANEXO_REGEX.source, "g");

  // Limpa texto de tags internas antes de exibir
  const INTERNAL_TAG_REGEX = /\[(?:PRODUTO_IDENTIFICADO|PRODUCT_IDENTIFIED|SCORE|OUTCOME|STAGE|VTEX_PEDIDO_INICIADO|VTEX_ORDER_DADOS|VTEX_CHECKOUT_REQUEST|VTEX_CUPOM|MAQUINAS_DADOS|POS_VENDA_DADOS|PECAS_DADOS|CNPJ_CHECK|CNPJ_RESULT|LOG_OCULTO)[^\]]*\]/gi;
  const displayText = processedText.replace(INTERNAL_TAG_REGEX, "").replace(/\s{2,}/g, " ").trim();

  while ((match = anexoRegex.exec(displayText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={lastIndex}>{formatTextWithLinks(displayText.substring(lastIndex, match.index))}</span>);
    }
    let attachUrl = match[1].trim();
    if (attachUrl.startsWith("/uploads/")) attachUrl = `${BACKEND}${attachUrl}`;
    const isImage = /\.(jpeg|jpg|gif|png|webp|svg|heic)$/i.test(attachUrl) || attachUrl.startsWith("data:image/");
    if (isImage) {
      parts.push(
        <div key={`anexo-${match.index}`} className="mt-2 mb-2 max-w-[280px] rounded-lg overflow-hidden border border-zinc-200 shadow-sm bg-white">
          <a href={attachUrl} target="_blank" rel="noopener noreferrer" className="block p-1">
            <img src={attachUrl} alt="Anexo do Cliente" className="w-full h-auto max-h-[220px] object-scale-down rounded hover:opacity-90 transition-opacity" />
          </a>
        </div>
      );
    } else {
      parts.push(
        <div key={`anexo-${match.index}`} className="block">
          <a href={attachUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 mb-2 px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg text-xs font-semibold hover:bg-zinc-200 border border-zinc-200 shadow-sm transition-all hover:-translate-y-0.5">
            📎 Abrir Anexo (PDF/Outros)
          </a>
        </div>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < displayText.length) {
    parts.push(<span key={lastIndex}>{formatTextWithLinks(displayText.substring(lastIndex))}</span>);
  }

  // Adiciona os rich cards de produto ao final
  if (productUrls.length > 0 || pdfUrls.length > 0) {
    parts.push(
      <div key="rich-embeds" className="flex flex-col gap-2 mt-1">
        {productUrls.map((u, i) => (
          <AdminProductCard key={`prod-${i}`} url={u} isAgentMsg={isAgentMsg} />
        ))}
        {pdfUrls.map((p, i) => (
          <a key={`pdf-${i}`} href={p.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs text-white font-semibold no-underline hover:bg-white/15 transition max-w-[260px]">
            📄 {p.title}
          </a>
        ))}
      </div>
    );
  }

  return parts;
}


function scoreColor(score: number): string {
  if (score >= 70) return "from-red-500 to-orange-500";
  if (score >= 40) return "from-yellow-500 to-amber-500";
  return "from-emerald-500 to-teal-500";
}

// ——— Main Component —————————————————————————————————————————————————

// ——— Notification popup type ——————————————————————————————————————————
interface NotifPopup {
  id: string;
  visitorName: string;
  content: string;
  chatId: string;
}

// ——— Sound helper (Web Audio API — sem arquivo externo) ——————————————
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.35, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    gainNode.connect(ctx.destination);

    // Tom principal
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    osc1.connect(gainNode);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.6);

    // Tom harmônico para dar corpo
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.15, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {
    // AudioContext not supported — ignore silently
  }
}

// ——— Funnel Config Types ————————————————————————————————————————————
interface FunnelOperator {
  id: string; // RD CRM user ID or name
  name: string;
}

interface FunnelConfig {
  mode: "single" | "rotation";
  operators: FunnelOperator[];
  currentIndex: number; // used for rotation
}

interface LiveChatSettings {
  funnels: {
    pos_venda: FunnelConfig;
    pecas: FunnelConfig;
    maquinas: FunnelConfig;
  };
}

const DEFAULT_SETTINGS: LiveChatSettings = {
  funnels: {
    pos_venda: { mode: "single", operators: [], currentIndex: 0 },
    pecas: { mode: "single", operators: [], currentIndex: 0 },
    maquinas: { mode: "single", operators: [], currentIndex: 0 },
  },
};

function loadSettings(): LiveChatSettings {
  try {
    const raw = localStorage.getItem("livechat_settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s: LiveChatSettings) {
  localStorage.setItem("livechat_settings", JSON.stringify(s));
  // Sincroniza com o servidor para que o backend possa usar os operadores em rodízio
  fetch("/api/livechat/funnel-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(s),
  }).catch(() => {});
}

function LiveChat() {
  const [activeTab, setActiveTab] = useState<"chats" | "visitors" | "crm" | "arquivados" | "atencao" | "stats">("chats");
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const agentFileInputRef = useRef<HTMLInputElement>(null);
  // Preview modal: arquivo selecionado aguardando confirmação de envio
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [allVisitors, setAllVisitors] = useState<Visitor[]>([]);
  const [pipelineData, setPipelineData] = useState<Record<string, Visitor[]>>({});
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionReason, setAttentionReason] = useState("Falta de informação");
  const [attentionObs, setAttentionObs] = useState("");
  // ── CRM Sync Manual ──────────────────────────────────────────────────────
  const [crmSyncState, setCrmSyncState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [crmSyncResult, setCrmSyncResult] = useState<{ dealId?: string; funil?: string; steps?: any[]; message?: string } | null>(null);
  const [crmSyncModalOpen, setCrmSyncModalOpen] = useState(false);
  const [visitorChats, setVisitorChats] = useState<Chat[]>([]);
  const [pastNegotiations, setPastNegotiations] = useState<any[]>([]);
  const [historyModal, setHistoryModal] = useState<{ visitor: Visitor; pageviews: Pageview[]; timeline?: TimelineEvent[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [closeReasonOpen, setCloseReasonOpen] = useState<string | null>(null); // chatId
  const [closeReasonSaving, setCloseReasonSaving] = useState(false);
  // ——— Notificações ———
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({}); // chatId → count
  const [notifPopups, setNotifPopups] = useState<NotifPopup[]>([]);
  // ——— Edição de título do chat ———
  const [editingTitleChatId, setEditingTitleChatId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  // ——— Analytics pré-chat (#8) ———
  const [preChatAnalytics, setPreChatAnalytics] = useState<{ topPages: PreChatPage[]; conversionRates: ConversionRate[] } | null>(null);
  const [preChatLoading, setPreChatLoading] = useState(false);
  // ——— Timeline modal (#10) ———
  const [timelineLoading, setTimelineLoading] = useState(false);
  // ——— Modal de histórico: aba ativa ———
  const [historyActiveTab, setHistoryActiveTab] = useState<'pageviews' | 'timeline' | 'briefing'>('pageviews');
  const selectedChatRef = useRef<Chat | null>(null);
  const activeTabRef = useRef<string>("chats");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // ——— Refresh animation ———
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ——— Date Filter ———
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>(""); // De: YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>("");     // Até: YYYY-MM-DD
  const [dateFilterActive, setDateFilterActive] = useState(false);

  // ——— Visitantes: colapso de seções (online/offline/identificados) ———
  // Offline começa minimizado para não renderizar milhares de cards de uma vez
  const [onlineExpanded, setOnlineExpanded] = useState(true);
  const [offlineExpanded, setOfflineExpanded] = useState(false);
  const [identifiedExpanded, setIdentifiedExpanded] = useState(false);

  // ——— Arquivados: paginação "Mostrar mais" ———
  const ARCHIVED_PAGE_SIZE = 50;
  const [archivedPage, setArchivedPage] = useState(1);

  // ——— Kanban CRM: colunas minimizadas (sem_resposta começa minimizada por padrão) ———
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set(['sem_resposta']));

  // ——— Settings Modal ———
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveSettings, setLiveSettings] = useState<LiveChatSettings>(loadSettings);
  const [activeFunnel, setActiveFunnel] = useState<"pos_venda" | "pecas" | "maquinas">("pos_venda");
  const [newOperatorName, setNewOperatorName] = useState("");
  // Fix 6: usuários reais do RD CRM para dropdown de operadores
  const [rdUsers, setRdUsers] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [rdUsersLoading, setRdUsersLoading] = useState(false);
  // Usuário logado (para exibir nome correto ao assumir atendimento)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; username: string } | null>(null);

  // ——— Áudio do Operador ———
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSendingAudio, setIsSendingAudio] = useState(false);
  // Preview de áudio: blob local gravado, aguardando ação do operador (descartar ou enviar)
  const [pendingAudioBlob, setPendingAudioBlob] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // ——— Drag & Drop (Kanban CRM) ———
  const [draggingVisitorId, setDraggingVisitorId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const draggingFromStage = useRef<string | null>(null);

  // Manter refs sincronizados para uso dentro do WS handler (closure)
  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Fix 6: Buscar usuários do RD CRM quando Settings abre
  useEffect(() => {
    if (!settingsOpen) return;
    setRdUsersLoading(true);
    fetch("/api/livechat/rd-users", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(users => { setRdUsers(Array.isArray(users) ? users : []); })
      .catch(() => setRdUsers([]))
      .finally(() => setRdUsersLoading(false));
  }, [settingsOpen]);

  // Buscar dados do usuário logado ao montar o componente
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setCurrentUser(u); })
      .catch(() => {});
  }, []);

  // Dismiss popup por id
  const dismissPopup = (id: string) =>
    setNotifPopups((prev) => prev.filter((n) => n.id !== id));

  // Mostra popup e agenda auto-dismiss após 6s
  const showPopup = (popup: NotifPopup) => {
    setNotifPopups((prev) => [popup, ...prev].slice(0, 4)); // max 4 simultâneos
    setTimeout(() => dismissPopup(popup.id), 6000);
  };

  const openHistoryModal = async (v: Visitor) => {
    try {
      setHistoryActiveTab('pageviews');
      const res = await fetch(`/api/livechat/visitors/${v.id}/pageviews`, { credentials: "include" });
      const pageviews: Pageview[] = res.ok ? await res.json() : [];
      setHistoryModal({ visitor: v, pageviews: pageviews.reverse() });
    } catch {
      setHistoryModal({ visitor: v, pageviews: [] });
    }
  };

  // #10 — Carregar timeline unificada do visitante
  const loadVisitorTimeline = async (visitorId: string) => {
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/livechat/visitors/${visitorId}/timeline`, { credentials: "include" });
      const timeline: TimelineEvent[] = res.ok ? await res.json() : [];
      setHistoryModal(prev => prev ? { ...prev, timeline } : prev);
    } catch {
      setHistoryModal(prev => prev ? { ...prev, timeline: [] } : prev);
    } finally {
      setTimelineLoading(false);
    }
  };

  // #8 — Carregar analytics pré-chat
  const loadPreChatAnalytics = async () => {
    if (preChatAnalytics || preChatLoading) return;
    setPreChatLoading(true);
    try {
      const res = await fetch('/api/livechat/stats/pre-chat-pages', { credentials: 'include' });
      if (res.ok) setPreChatAnalytics(await res.json());
    } catch {}
    finally { setPreChatLoading(false); }
  };

  // ——— Fetch initial data —————————————————————————————————————————————————
  const fetchData = useCallback(async () => {
    try {
      const [chatsRes, statsRes, allVisitorsRes, pipelineRes] = await Promise.all([
        fetch("/api/livechat/chats", { credentials: "include" }),
        fetch("/api/livechat/stats", { credentials: "include" }),
        fetch("/api/livechat/visitors/all", { credentials: "include" }),
        fetch("/api/livechat/pipeline", { credentials: "include" }),
      ]);
      if (chatsRes.ok) {
        const freshChats: Chat[] = await chatsRes.json();
        // 🛡️ Merge inteligente: nunca sobrescrever se já temos mais chats carregados.
        // O polling de 15s não deve apagar o que o usuário já expandiu via "Mostrar mais".
        setChats(prev => freshChats.length >= prev.length ? freshChats : prev);
      }
      if (statsRes.ok) setStats(await statsRes.json());
      if (allVisitorsRes.ok) {
        const allV = await allVisitorsRes.json();
        setAllVisitors(allV);
        // Visitors tab mostra todos os recentes, não apenas "online" pelo flag
        setVisitors(allV);
      }
      if (pipelineRes.ok) setPipelineData(await pipelineRes.json());
    } catch {}
  }, []);

  const openVisitorChat = (chatId: string) => {
    const chatToOpen = visitorChats.find(c => c.id === chatId) || chats.find(c => c.id === chatId);
    if (chatToOpen) {
      setActiveTab("chats");
      setSelectedChat(chatToOpen);
      loadChatMessages(chatToOpen);
    } else {
      toast({ description: "Chat não encontrado nos registros atuais." });
    }
  };

  // ——— Drag & Drop: mover card entre colunas do Kanban ————————————————————
  const handleMoveCard = async (visitorId: string, toStage: string) => {
    if (!visitorId || !toStage) return;

    // Atualização otimista: move o card no estado local imediatamente
    setPipelineData(prev => {
      const next = { ...prev };
      let movedVisitor: Visitor | undefined;
      for (const stage of Object.keys(next)) {
        const idx = (next[stage] || []).findIndex((v: Visitor) => v.id === visitorId);
        if (idx >= 0) {
          movedVisitor = next[stage][idx];
          next[stage] = next[stage].filter((_: Visitor, i: number) => i !== idx);
          break;
        }
      }
      if (movedVisitor) {
        if (!next[toStage]) next[toStage] = [];
        next[toStage] = [{ ...movedVisitor, pipelineStage: toStage }, ...next[toStage]];
      }
      return next;
    });

    // Persiste no servidor
    try {
      const res = await fetch(`/api/livechat/visitors/${visitorId}/pipeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) throw new Error("Resposta do servidor: " + res.status);
      toast({ description: `📄 Card movido para "${toStage.replace(/_/g, " ")}" ✓` });
    } catch (err: any) {
      toast({ description: "Falha ao mover o card. Recarregando...", variant: "destructive" });
      fetchData(); // rollback: recarrega estado do servidor
    }
  };

  // ——— Global Event Listener for Sub-Components —————————————————————————————
  useEffect(() => {
    const handleAction = (e: any) => {
      const { type, chatId, visitorId } = e.detail || {};
      if (type === 'OPEN_CHAT' && chatId) {
        openVisitorChat(chatId);
      } else if (type === 'OPEN_VISITOR' && visitorId) {
        const v = allVisitors.find(x => x.id === visitorId) || visitors.find(x => x.id === visitorId);
        if (v) {
          openHistoryModal(v);
        } else {
          toast({ description: "Visitante não encontrado nos registros atuais." });
        }
      }
    };
    window.addEventListener("livechat-action", handleAction);
    return () => window.removeEventListener("livechat-action", handleAction);
  }, [allVisitors, visitors, chats, visitorChats]);

  // ——— WebSocket connection —————————————————————————————————————————————————
  useEffect(() => {
    fetchData();

    // Vercel não suporta proxy WebSocket — em produção, conectar diretamente ao Railway
    const WS_BASE = import.meta.env.DEV
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "wss://fagnertecfag-production.up.railway.app";
    const wsUrl = `${WS_BASE}/ws/livechat`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "AGENT_CONNECT", userId: "admin" }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "INIT_STATE":
            setVisitors(data.visitors ?? []);
            setChats(data.chats ?? []);
            setStats(data.stats ?? null);
            if (data.pipeline) setPipelineData(data.pipeline);
            break;
          case "VISITOR_ONLINE":
            setVisitors((prev) => {
              const idx = prev.findIndex((v) => v.id === data.visitor.id);
              if (idx >= 0) { const n = [...prev]; n[idx] = data.visitor; return n; }
              return [data.visitor, ...prev];
            });
            break;
          case "VISITOR_OFFLINE":
            setVisitors((prev) => prev.map((v) => v.id === data.visitorId ? { ...v, isOnline: "false", lastSeenAt: new Date().toISOString() } : v));
            break;
          case "VISITOR_PAGE_UPDATE":
            setHistoryModal(prev => {
              if (prev && prev.visitor.id === data.visitorId) {
                const newPv: Pageview = {
                   id: data.pageviewId ?? `live-${Date.now()}`,
                   visitorId: data.visitorId,
                   url: data.url,
                   pageTitle: data.pageTitle || data.url,
                   intentTag: data.intentTag,
                   visitedAt: new Date().toISOString()
                };
                return { ...prev, pageviews: [newPv, ...prev.pageviews] };
              }
              return prev;
            });
            setVisitors((prev) => prev.map((v) =>
              v.id === data.visitorId ? { ...v, currentPage: data.url, currentPageTitle: data.pageTitle } : v
            ));
            // Atualiza purchaseIntentScore no visitor se vier no evento
            if (data.purchaseIntentScore !== undefined) {
              setAllVisitors(prev => prev.map(v => v.id === data.visitorId ? { ...v, purchaseIntentScore: data.purchaseIntentScore } : v));
            }
            break;

          case "VISITOR_TIME_UPDATE":
            // Atualiza totalTimeSeconds em tempo real — disparado pelo servidor a cada 30s
            // quando o widget envia PAGEVIEW_UPDATE com o tempo acumulado na página.
            setVisitors((prev) => prev.map((v) =>
              v.id === data.visitorId ? { ...v, totalTimeSeconds: data.totalTimeSeconds } : v
            ));
            setAllVisitors((prev) => prev.map((v) =>
              v.id === data.visitorId ? { ...v, totalTimeSeconds: data.totalTimeSeconds } : v
            ));
            // Atualiza o CustomerModal se estiver aberto para este visitante
            setHistoryModal(prev => prev && prev.visitor.id === data.visitorId
              ? { ...prev, visitor: { ...prev.visitor, totalTimeSeconds: data.totalTimeSeconds } }
              : prev
            );
            break;

          case "RETURNING_HOT_LEAD": {
            // #6 — Lead quente voltou ao site: toast especial com link de visita
            const leadUrl = data.currentPageTitle || data.currentPage || "site";
            toast({
              title: `🔥 ${data.visitorName ?? 'Lead Quente'} voltou!`,
              description: `${data.totalVisits} visitas | Engajamento: ${data.engagementScore} | 🎯 Compra: ${data.purchaseIntentScore ?? 0} | Página: ${leadUrl}`,
            });
            break;
          }

          case "VISITOR_BRIEFING_UPDATED": {
            // #7 — Atualiza o briefing da IA no estado do visitor
            setAllVisitors(prev => prev.map(v =>
              v.id === data.visitorId ? { ...v, aiBriefing: data.briefing } : v
            ));
            setHistoryModal(prev => prev && prev.visitor.id === data.visitorId
              ? { ...prev, visitor: { ...prev.visitor, aiBriefing: data.briefing } }
              : prev
            );
            break;
          }
          case "NEW_CHAT":
            setChats((prev) => [data.chat, ...prev]);
            if (data.proactive) {
              toast({ title: "Abordagem Proativa", description: "Fagner abordou um visitante automaticamente!" });
            }
            break;
          case "CHAT_MESSAGE": {
            const isChatOpen = selectedChatRef.current?.id === data.chatId;
            const isOnChatsTab = activeTabRef.current === "chats";
            const isVisitorMsg = data.sender === "visitor";

            // Se é mensagem do visitante → notificação
            if (isVisitorMsg) {
              // Incrementa contador de não lidas SEMPRE (some ao abrir o chat)
              if (!isChatOpen || !isOnChatsTab) {
                setUnreadCounts((prev) => ({
                  ...prev,
                  [data.chatId]: (prev[data.chatId] ?? 0) + 1,
                }));
              }
              // Som e popup SOMENTE quando o chat NÃO está visível
              if (!isChatOpen || !isOnChatsTab) {
                playNotificationSound();
                const visitorName = data.visitorName ||
                  chatsRef.current?.find((c: Chat) => c.id === data.chatId)?.visitorName ||
                  "Visitante";
                showPopup({
                  id: `${data.chatId}-${Date.now()}`,
                  visitorName,
                  content: data.content?.length > 80
                    ? data.content.slice(0, 80) + "..."
                    : (data.content ?? ""),
                  chatId: data.chatId,
                });
              }
            }

            // Adiciona mensagem ao painel se o chat estiver aberto
            if (isChatOpen) {
              setChatMessages((prev) => [...prev, {
                id: Date.now().toString(),
                chatId: data.chatId,
                sender: data.sender,
                content: data.content,
                attachments: data.attachments,
                read: "false",
                sentAt: data.timestamp,
              }]);
            }
            break;
          }
          case "NEEDS_HUMAN":
            toast({
              title: "⚠️ Fagner precisa de ajuda!",
              description: data.message,
              variant: "destructive",
            });
            setChats((prev) => prev.map((c) =>
              c.id === data.chatId ? { ...c, needsHuman: "true" } : c
            ));
            break;
          case "CHAT_CLOSED":
            setChats((prev) => prev.map((c) =>
              c.id === data.chatId ? { ...c, status: "closed" } : c
            ));
            break;
          case "CHAT_FLAGGED":
            setChats((prev) => prev.map((c) =>
              c.id === data.chatId ? { ...c, needsHuman: data.needsHuman, mood: data.mood } : c
            ));
            break;
          case "CHAT_TAKEN_OVER":
            setChats((prev) => prev.map((c) =>
              c.id === data.chatId ? { ...c, status: "human_active" } : c
            ));
            break;
          case "PIPELINE_UPDATE":
            if (data.visitor) {
              setPipelineData((prev) => {
                const next = { ...prev };
                // Remove visitor from all stages
                for (const stage of Object.keys(next)) {
                  next[stage] = (next[stage] || []).filter((v: Visitor) => v.id !== data.visitorId);
                }
                // Add to new stage
                if (!next[data.stage]) next[data.stage] = [];
                next[data.stage] = [data.visitor, ...next[data.stage]];
                return next;
              });
            }
            break;
          case "VISITOR_POS_VENDA_UPDATED": {
            // Atualiza dados de pós venda no estado local
            const mapping: any = {
              posVendaNome: data.posVendaData?.nome,
              posVendaTelefone: data.posVendaData?.telefone,
              posVendaEmail: data.posVendaData?.email,
              posVendaCnpjCpf: data.posVendaData?.cnpjCpf,
              posVendaNotaPedido: data.posVendaData?.notaPedido,
              posVendaProblema: data.posVendaData?.problema,
              name: data.posVendaData?.nome, // Sincroniza nome base
            };

            if (selectedVisitor?.id === data.visitorId) {
              setSelectedVisitor(prev => prev ? { ...prev, ...mapping } : prev);
            }
            
            // Atualiza também no pipeline e chats para refletir o nome em tempo real
            setPipelineData(prev => {
              const next = { ...prev };
              for (const stage of Object.keys(next)) {
                next[stage] = (next[stage] || []).map((v: Visitor) =>
                  v.id === data.visitorId ? { ...v, ...mapping } : v
                );
              }
              return next;
            });
            setAllVisitors(prev => prev.map(v =>
              v.id === data.visitorId ? { ...v, ...mapping } : v
            ));
            
            if (data.posVendaData?.nome) {
               setChats(prev => prev.map(c => 
                 c.visitorId === data.visitorId ? { ...c, visitorName: data.posVendaData.nome } : c
               ));
            }
            break;
          }
          case "VISITOR_PECAS_UPDATED": {
            // Atualiza dados de peças no estado local
            const pecasMapping: any = {
              posVendaNome:     data.pecasData?.nome,
              posVendaTelefone: data.pecasData?.telefone,
              posVendaEmail:    data.pecasData?.email,
              posVendaCnpjCpf:  data.pecasData?.cnpjCpf,
              pecaDesejada:     data.pecasData?.pecaDesejada,
              pecasECliente:    data.pecasData?.eCliente,
              name:             data.pecasData?.nome,
            };
            if (selectedVisitor?.id === data.visitorId) {
              setSelectedVisitor(prev => prev ? { ...prev, ...pecasMapping } : prev);
            }
            setPipelineData(prev => {
              const next = { ...prev };
              for (const stage of Object.keys(next)) {
                next[stage] = (next[stage] || []).map((v: Visitor) =>
                  v.id === data.visitorId ? { ...v, ...pecasMapping } : v
                );
              }
              return next;
            });
            setAllVisitors(prev => prev.map(v =>
              v.id === data.visitorId ? { ...v, ...pecasMapping } : v
            ));
            if (data.pecasData?.nome) {
              setChats(prev => prev.map(c =>
                c.visitorId === data.visitorId ? { ...c, visitorName: data.pecasData.nome } : c
              ));
            }
            break;
          }
          case "VISITOR_MAQUINAS_UPDATED": {
            const maqMapping: any = {
              posVendaNome:       data.maquinasData?.nome,
              posVendaTelefone:   data.maquinasData?.telefone,
              posVendaEmail:      data.maquinasData?.email,
              posVendaCnpjCpf:    data.maquinasData?.cnpjCpf,
              name:               data.maquinasData?.nome,
              // Campos específicos Máquinas
              maqProdutoFabricado: data.maquinasData?.produtoFabricado,
              maqVolumeProducao:   data.maquinasData?.volumeProducao,
              maqQualificacaoSDR:  data.maquinasData?.qualificacaoSDR,
              maqClienteNovo:      data.maquinasData?.clienteNovo,
            };
            if (selectedVisitor?.id === data.visitorId) {
              setSelectedVisitor(prev => prev ? { ...prev, ...maqMapping } : prev);
            }
            setPipelineData(prev => {
              const next = { ...prev };
              for (const stage of Object.keys(next)) {
                next[stage] = (next[stage] || []).map((v: Visitor) =>
                  v.id === data.visitorId ? { ...v, ...maqMapping } : v
                );
              }
              return next;
            });
            setAllVisitors(prev => prev.map(v =>
              v.id === data.visitorId ? { ...v, ...maqMapping } : v
            ));
            if (data.maquinasData?.nome) {
              setChats(prev => prev.map(c =>
                c.visitorId === data.visitorId ? { ...c, visitorName: data.maquinasData.nome } : c
              ));
            }
            break;
          }
          case "VISITOR_NOTE_ADDED":
          case "RD_CRM_OS_CREATED": {
            // Recarrega dados do visitante afetado para atualizar as Notas da IA em tempo real
            const affectedId = data.visitorId;
            if (!affectedId) break;
            try {
              const vRes = await fetch(`/api/livechat/visitors/${affectedId}`, { credentials: "include" });
              if (vRes.ok) {
                const updatedVisitor: Visitor = await vRes.json();
                // Atualiza no selectedVisitor (painel de detalhes aberto)
                setSelectedVisitor(prev =>
                  prev && prev.id === affectedId ? { ...prev, ...updatedVisitor } : prev
                );
                // Atualiza também nas listas gerais
                setAllVisitors(prev =>
                  prev.map(v => v.id === affectedId ? { ...v, ...updatedVisitor } : v)
                );
                setPipelineData(prev => {
                  const next = { ...prev };
                  for (const stage of Object.keys(next)) {
                    next[stage] = (next[stage] || []).map((v: Visitor) =>
                      v.id === affectedId ? { ...v, ...updatedVisitor } : v
                    );
                  }
                  return next;
                });
              }
            } catch { /* ignora erros de fetch — não crítico */ }
            break;
          }
        }
      } catch {}
    };

    ws.onerror = (e) => {
      console.error("[LiveChat WS] erro:", e);
    };

    ws.onclose = () => {
      // Reconectar após 3 segundos
      setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          const WS_BASE2 = import.meta.env.DEV
            ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
            : "wss://fagnertecfag-production.up.railway.app";
          const wsUrl2 = `${WS_BASE2}/ws/livechat`;
          const ws2 = new WebSocket(wsUrl2);
          wsRef.current = ws2;
          ws2.onopen = () => ws2.send(JSON.stringify({ type: "AGENT_CONNECT", userId: "admin" }));
          ws2.onerror = () => {};
          ws2.onclose = ws.onclose;
          ws2.onmessage = ws.onmessage;
        }
      }, 3000);
    };

    const interval = setInterval(fetchData, 15000);
    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Fetch chat history when visitor selected in CRM
  useEffect(() => {
    if (!selectedVisitor) { 
      setVisitorChats([]); 
      setPastNegotiations([]);
      return; 
    }
    fetch(`/api/livechat/visitors/${selectedVisitor.id}/chats`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setVisitorChats)
      .catch(() => setVisitorChats([]));

    fetch(`/api/livechat/visitors/${selectedVisitor.id}/history`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setPastNegotiations)
      .catch(() => setPastNegotiations([]));
  }, [selectedVisitor]);

  // ——— Load chat messages —————————————————————————————————————————————————
  const loadChatMessages = async (chat: Chat) => {
    setSelectedChat(chat);
    // Limpa não lidas ao abrir o chat
    setUnreadCounts((prev) => { const n = { ...prev }; delete n[chat.id]; return n; });
    // Cancela edição de título se abrir outro chat
    setEditingTitleChatId(null);
    try {
      const res = await fetch(`/api/livechat/chats/${chat.id}/messages`, { credentials: "include" });
      if (res.ok) {
        const msgs: Message[] = await res.json();
        // Bug 1.1: parsear [AGENT_ATTACHMENTS:{...}] salvo no banco e mapear para o campo attachments
        const parsed = msgs.map((m) => {
          if (m.sender === "agent" && m.content?.startsWith("[AGENT_ATTACHMENTS:")) {
            try {
              const jsonStr = m.content.replace(/^\[AGENT_ATTACHMENTS:/, "").replace(/\]$/, "");
              const atts = JSON.parse(jsonStr);
              if (Array.isArray(atts)) {
                return { ...m, content: "", attachments: atts };
              }
            } catch {}
          }
          return m;
        });
        setChatMessages(parsed);
      }
    } catch {}
  };


  // ——— Renomear título do chat ——————————————————————————————————————————————
  const startEditTitle = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleChatId(chat.id);
    setEditingTitleValue(chat.visitorName || "");
  };

  const saveChatTitle = async (chat: Chat) => {
    const newTitle = editingTitleValue.trim();
    if (!newTitle || newTitle === chat.visitorName) {
      setEditingTitleChatId(null);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/livechat/chats/${chat.id}/rename`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        // Atualiza estado local imediatamente
        setChats(prev => prev.map(c => c.id === chat.id ? { ...c, visitorName: newTitle } : c));
        if (selectedChat?.id === chat.id) {
          setSelectedChat(prev => prev ? { ...prev, visitorName: newTitle } : prev);
        }
        toast({ description: `Título atualizado: "${newTitle}"` });
      }
    } catch {
      toast({ description: "Erro ao salvar título", variant: "destructive" });
    } finally {
      setSavingTitle(false);
      setEditingTitleChatId(null);
    }
  };

  // ——— Agent: upload e envio de arquivo ao cliente ——————————————————————
  // Passo 1: usuário seleciona o arquivo → exibe preview
  const handleAgentFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (agentFileInputRef.current) agentFileInputRef.current.value = "";
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => setPendingFile({ file, previewUrl: ev.target?.result as string });
      reader.readAsDataURL(file);
    } else {
      setPendingFile({ file, previewUrl: null });
    }
  };

  // Passo 2: confirmação do agente → faz upload e envia via WS
  const handleAgentFileUpload = async () => {
    if (!pendingFile || !selectedChat) return;
    const file = pendingFile.file;
    setPendingFile(null);
    setIsUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/livechat/upload-agent", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Falha no upload");
      const { url, name, mimeType, size } = await res.json();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "AGENT_MESSAGE",
          chatId: selectedChat.id,
          userId: currentUser?.id ?? "admin",
          content: "",
          attachments: [{ url, name, mimeType, size }],
        }));
      }
      toast({ description: `📎 "${name}" enviado ao cliente!` });
    } catch (err: any) {
      toast({ description: `Erro ao enviar arquivo: ${err.message}`, variant: "destructive" });
    } finally {
      setIsUploadingFile(false);
    }
  };

  // ——— Agent send message (human takeover) —————————————————————————————————
  const handleAgentSend = () => {
    if (!agentInput.trim() || !selectedChat || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "AGENT_MESSAGE",
      chatId: selectedChat.id,
      userId: currentUser?.id ?? "admin",
      content: agentInput.trim(),
    }));
    // Não adicionamos otimisticamente: o servidor faz broadcastToAgents(CHAT_MESSAGE)
    // que o handler WS da linha ~641 já adiciona ao estado. Adicionar aqui causava duplicata.
    setAgentInput("");
  };

  // ─── Audio recording ───────────────────────────────────────────────────
  const BACKEND = (import.meta.env.VITE_BACKEND_URL || "https://fagnertecfag-production.up.railway.app").replace(/\/$/, "");

  const startRecording = async () => {
    if (!selectedChat || selectedChat.status !== "human_active") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      audioChunksRef.current = [];

      // Tenta webm/opus (Chrome/Edge), cai para ogg (Firefox) ou mp4 (Safari)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/mp4";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        // Para todas as tracks de áudio
        stream.getTracks().forEach((t) => t.stop());
        recordingStreamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size === 0) return;

        // ── Preview antes de enviar ──────────────────────────────────────────
        // Cria URL local para o operador ouvir e decidir se envia ou descarta
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        const previewUrl = URL.createObjectURL(audioBlob);
        setPendingAudioBlob({ blob: audioBlob, url: previewUrl, ext });
      };

      mr.start(100); // coleta chunks a cada 100ms
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      toast({ description: `Não foi possível acessar o microfone: ${err.message}`, variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const discardPendingAudio = () => {
    if (pendingAudioBlob) URL.revokeObjectURL(pendingAudioBlob.url);
    setPendingAudioBlob(null);
  };

  const sendPendingAudio = async () => {
    if (!pendingAudioBlob || !selectedChat) return;
    const { blob, url: previewUrl, ext } = pendingAudioBlob;
    setIsSendingAudio(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, `audio-${Date.now()}.${ext}`);
      const uploadRes = await fetch(`/api/livechat/audio-upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!uploadRes.ok) throw new Error("Falha no upload de áudio");
      const { url } = await uploadRes.json();
      const audioContent = `[AUDIO:${url}]`;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "AGENT_MESSAGE",
          chatId: selectedChat.id,
          userId: currentUser?.id ?? "admin",
          content: audioContent,
        }));
      }
      URL.revokeObjectURL(previewUrl);
      setPendingAudioBlob(null);
      toast({ description: "🎤 Áudio enviado!" });
    } catch (err: any) {
      toast({ description: `Erro ao enviar áudio: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSendingAudio(false);
    }
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;


  // ——— Take over chat —————————————————————————————————————————————————
  const handleTakeOver = async (chatId: string) => {
    const operatorName = currentUser?.name ?? currentUser?.username ?? "Atendente";
    const userId = currentUser?.id ?? "admin";
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "TAKE_OVER", chatId, userId, operatorName }));
    }
    try {
      await fetch(`/api/livechat/chats/${chatId}/take-over`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, operatorName }),
      });
    } catch {}
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, status: "human_active" } : c));
    toast({ title: "Chat assumido", description: `Você (${operatorName}) agora está respondendo este chat.` });
  };
  // ——— Return chat to AI (Fagner) —————————————————————————————————————
  const handleReturnToAI = (chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "RETURN_TO_AI", chatId }));
    }
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, status: "ai_active", agentId: undefined } : c));
    toast({ title: "Fagner reativado", description: "O Fagner voltará a responder quando o cliente mandar mensagem." });
  };

  // ——— Bug 3.2: Copiar histórico completo da conversa ——————————————————————
  const handleCopyHistory = async () => {
    if (!chatMessages.length) {
      toast({ description: "Não há mensagens para copiar." });
      return;
    }
    const visitorLabel = selectedChat?.visitorName ?? "Visitante";
    const dateHeader = selectedChat?.startedAt
      ? new Date(selectedChat.startedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : "";
    const header = `=== Histórico de Chat — ${visitorLabel} | ${dateHeader} ===\n`;
    const lines = chatMessages.map((m) => {
      const who =
        m.sender === "visitor" ? visitorLabel
        : m.sender === "ai" ? "Fagner (IA)"
        : m.sender === "system" ? "Sistema"
        : "Agente";
      const time = formatTime(m.sentAt);
      const body = m.content?.trim()
        || (m.attachments?.length ? `[Arquivo: ${m.attachments.map(a => a.name).join(", ")}]` : "");
      return `[${time}] ${who}: ${body}`;
    });
    const text = header + lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: "📋 Histórico copiado para a área de transferência!" });
    } catch {
      toast({ description: "Erro ao copiar. Tente novamente.", variant: "destructive" });
    }
  };


  // ——— Close chat —————————————————————————————————————————————————
  const handleCloseChat = async (chatId: string) => {
    // Notifica o visitante via WS (se disponível)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CLOSE_CHAT", chatId }));
    }
    // REST garante que o BD é atualizado mesmo se WS estiver offline
    try {
      await fetch(`/api/livechat/chats/${chatId}/close`, { method: "POST", credentials: "include" });
    } catch {}
    // Atualizar estado local imediatamente
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, status: "closed" } : c));
    if (selectedChat?.id === chatId) {
      setSelectedChat(null);
      setChatMessages([]);
    }
  };

  // ——— Attention Flag —————————————————————————————————————————————————
  const handleFlagAttention = () => {
    if (!selectedChat || !wsRef.current) return;
    
    // Fagner system uses `needsHuman` to flag it. We'll set needsHuman to "attention" and "mood" to the reason
    wsRef.current.send(JSON.stringify({ 
      type: "FLAG_ATTENTION",
      chatId: selectedChat.id,
      userId: "admin",
      attentionReason: attentionReason,
      attentionObs: attentionObs,
    }));

    toast({ title: "🚨 Atenção Registrada", description: "O chat foi enviado para a aba de revisão de atenção." });
    
    setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, needsHuman: "attention", mood: `${attentionReason}: ${attentionObs}` } : c));
    setAttentionOpen(false);
    setAttentionObs("");
  };

  // ——— Derived data —————————————————————————————————————————————————
  const sq = searchQuery.toLowerCase().trim();

  // Date filter helper — suporta range De/Até
  const passesDateFilter = (dateStr?: string) => {
    if (!dateFilterActive || (!dateFrom && !dateTo) || !dateStr) return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      if (d < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      if (d > to) return false;
    }
    return true;
  };

  const activeChats = chats.filter((c) => c.status !== "closed" &&
    passesDateFilter(c.startedAt) &&
    (!sq || (c.visitorName ?? "").toLowerCase().includes(sq))
  );
  const archivedChats = chats.filter((c) => c.status === "closed" &&
    passesDateFilter(c.startedAt) &&
    (!sq || (c.visitorName ?? "").toLowerCase().includes(sq))
  );
  const attentionChats = chats.filter((c) => c.needsHuman === "attention" && passesDateFilter(c.startedAt));
  const needsHumanChats = chats.filter((c) => c.needsHuman === "true" && c.status !== "closed" && passesDateFilter(c.startedAt));
  const filteredVisitors = visitors.filter((v) =>
    passesDateFilter(v.lastSeenAt) && (
      !sq ||
      (v.name ?? "").toLowerCase().includes(sq) ||
      (v.city ?? "").toLowerCase().includes(sq) ||
      (v.source ?? "").toLowerCase().includes(sq)
    )
  );

  // ——— TABS —————————————————————————————————————————————————————————————
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const mainTabs = [
    { id: "chats" as const, label: "Chats", icon: MessageCircle, count: activeChats.length, unread: totalUnread },
    { id: "visitors" as const, label: "Visitantes", icon: Eye, count: stats?.totalVisitorsAll ?? visitors.length, unread: 0 },
    { id: "crm" as const, label: "CRM", icon: Users, count: undefined as number | undefined, unread: 0 },
  ];
  const secondaryTabs = [
    { id: "arquivados" as const, label: "Arquivados", icon: Layers, count: archivedChats.length, unread: 0 },
    { id: "atencao" as const, label: "Atenção", icon: AlertTriangle, count: attentionChats.length, unread: 0 },
    { id: "stats" as const, label: "Estatísticas", icon: BarChart3, count: undefined as number | undefined, unread: 0 },
  ];
  const tabs = [...mainTabs, ...secondaryTabs];

  // Ref para acessar chats dentro do WS handler sem stale closure
  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  // ── Listener: abrir visitante pelo DrillDownPanel do FunnelCard (stats) ────
  // O FunnelCard dispara 'fagner:open-visitor' via window.dispatchEvent.
  // Aqui capturamos e navegamos pro visitante no sistema interno.
  useEffect(() => {
    const handler = (e: Event) => {
      const visitorId = (e as CustomEvent)?.detail?.visitorId;
      if (!visitorId) return;
      const found = allVisitors.find(v => v.id === visitorId);
      if (found) {
        setSelectedVisitor(found);
        setActiveTab('crm');
      } else {
        // Visitante não está na lista em memória — força busca direta
        fetch(`/api/livechat/visitors/${visitorId}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.id) {
              setSelectedVisitor(data);
              setActiveTab('crm');
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('fagner:open-visitor', handler);
    return () => window.removeEventListener('fagner:open-visitor', handler);
  }, [allVisitors]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(0 0% 97%) 0%, hsl(0 5% 95%) 100%)" }}>

      {/* ——— POPUP NOTIFICATIONS ——— */}
      <div
        aria-live="polite"
        className="fixed bottom-6 left-6 z-50 flex flex-col gap-3 pointer-events-none"
        style={{ width: 380 }}
      >
        {notifPopups.map((n) => (
          <div
            key={n.id}
            className="pointer-events-auto overflow-hidden rounded-2xl shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #fdf2f2 100%)",
              border: "1px solid rgba(220,38,38,0.15)",
              boxShadow: "0 20px 60px rgba(220,38,38,0.22), 0 4px 16px rgba(0,0,0,0.10)",
              animation: "slideInLeft 0.4s cubic-bezier(.22,1,.36,1)",
            }}
          >
            {/* Barra superior vermelha */}
            <div
              className="h-1 w-full"
              style={{ background: "linear-gradient(90deg, #7f1d1d, #dc2626, #f87171)" }}
            />

            <div className="flex items-stretch gap-0">
              {/* Faixa lateral vermelha */}
              <div
                className="w-1.5 flex-shrink-0"
                style={{ background: "linear-gradient(180deg, #dc2626, #7f1d1d)" }}
              />

              <div className="flex-1 px-4 py-3">
                {/* Cabeçalho: remetente + hora */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    >
                      {n.visitorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-zinc-900 leading-tight">{n.visitorName}</p>
                      <p className="text-[10px] text-red-500 font-semibold tracking-wide uppercase leading-tight">
                        💬 Nova mensagem
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={() => dismissPopup(n.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Preview da mensagem */}
                <div
                  className="rounded-lg px-3 py-2 mb-2.5"
                  style={{ background: "rgba(127,29,29,0.05)", border: "1px solid rgba(220,38,38,0.10)" }}
                >
                  <p className="text-[12px] text-zinc-700 leading-relaxed line-clamp-2">
                    {n.content || "Nova mensagem recebida"}
                  </p>
                </div>

                {/* Botão de ação */}
                <button
                  onClick={() => {
                    dismissPopup(n.id);
                    setActiveTab("chats");
                    const chat = chatsRef.current?.find((c) => c.id === n.chatId);
                    if (chat) loadChatMessages(chat);
                  }}
                  className="w-full py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
                    boxShadow: "0 4px 14px rgba(220,38,38,0.35)",
                  }}
                >
                  Abrir conversa →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ——— COMPACT HEADER ——— */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        {/* Row 1: Title + Stats + Refresh */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img
              src="/fagnerfil.jfif"
              alt="Fagner"
              className="w-9 h-9 rounded-xl object-cover shadow-lg"
            />

            <div>
              <h1 className="text-lg font-bold text-zinc-900 leading-tight">Fagner Site</h1>
              <p className="text-[11px] text-zinc-500 leading-tight">Monitoramento em tempo real</p>
            </div>
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="hidden md:flex items-center gap-2">
              {[
                { icon: Eye, value: stats.onlineVisitors, label: "Online", color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
                { icon: MessageCircle, value: stats.activeChats, label: "Ativos", color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
                { icon: AlertTriangle, value: stats.needsHuman, label: "Ajuda", color: "#ef4444", bg: stats.needsHuman > 0 ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.05)" },
                { icon: TrendingUp, value: stats.totalChatsToday, label: "Chats", color: "#a855f7", bg: "rgba(168,85,247,0.08)" },
                { icon: Users, value: stats.totalVisitorsToday, label: "Hoje", color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
              ].map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all hover:scale-105"
                  style={{ background: s.bg, borderColor: `${s.color}20` }}
                >
                  <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                  <span className="text-sm font-bold text-zinc-800">{s.value}</span>
                  <span className="text-[10px] text-zinc-500 font-medium">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRefreshing(true);
                setTimeout(() => window.location.reload(), 600);
              }}
              className="h-8 gap-1.5 text-xs border-zinc-200 hover:border-red-300 hover:bg-red-50/50 transition-all"
              title="Atualizar página"
            >
              <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-500 ${isRefreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>

            {/* Filter Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen(true)}
              className={`h-8 gap-1.5 text-xs transition-all ${
                dateFilterActive
                  ? "border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-zinc-200 hover:border-red-300 hover:bg-red-50/50"
              }`}
              title="Filtrar por data"
            >
              <Filter className="w-3.5 h-3.5" />
              {dateFilterActive
                ? `📅 ${dateFrom}${dateTo && dateTo !== dateFrom ? ' → ' + dateTo : ''}`
                : "Filtro"}
              {dateFilterActive && (
                <span
                  onClick={(e) => { e.stopPropagation(); setDateFilterActive(false); setDateFrom(""); setDateTo(""); }}
                  className="ml-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-200 hover:bg-red-300 text-red-700 cursor-pointer transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
            </Button>

            {/* Settings Gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              title="Configurações do Live Chat"
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
            >
              <Settings className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 transition-colors group-hover:rotate-45" style={{ transition: "transform 0.3s ease" }} />
            </button>
          </div>
        </div>

        {/* Row 2: Tabs */}
        <div className="flex gap-1 bg-white/60 p-1 rounded-xl border border-zinc-200/60 shadow-sm backdrop-blur-sm items-center">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchQuery(""); setArchivedPage(1); }}
                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
                  isActive ? "text-white shadow-md" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/60"
                }`}
                style={isActive ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" } : {}}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {/* Badge de conversas ativas */}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${
                    isActive ? "bg-white/25 text-white" : "bg-zinc-200/80 text-zinc-600"
                  }`}>{tab.count}</span>
                )}
                {/* Badge de não lidas — pulsante, vermelho vivo */}
                {tab.unread > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[9px] font-black text-white leading-none shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                      boxShadow: "0 0 0 2px white, 0 2px 8px rgba(220,38,38,0.5)",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  >
                    {tab.unread > 99 ? "99+" : tab.unread}
                  </span>
                )}
              </button>
            );
          })}

          {/* ── Search Bar (center, hidden on arquivados/atencao/stats) ── */}
          {["chats", "visitors", "crm"].includes(activeTab) ? (
            <div className="flex-1 flex items-center justify-center px-2">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  id="livechat-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={activeTab === "chats" ? "Buscar conversas..." : activeTab === "visitors" ? "Buscar visitantes..." : "Buscar no CRM..."}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white/80 focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-200 transition-all placeholder:text-zinc-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="w-px bg-zinc-200/60 mx-1 self-stretch rounded-full" />
          {secondaryTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchQuery(""); setArchivedPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
                  isActive ? "text-white shadow-md" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/60"
                }`}
                style={isActive ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" } : {}}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${
                    isActive
                      ? tab.id === "atencao" ? "bg-orange-300/60 text-white" : "bg-white/25 text-white"
                      : tab.id === "atencao" ? "bg-orange-100 text-orange-700" : "bg-zinc-200/80 text-zinc-600"
                  }`}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ——— TAB CONTENT (flex-1, overflow-hidden) ——— */}
      <div className="flex-1 overflow-hidden px-6 pb-5">

        {/* ——— Tabs: Chats, Arquivados, Atenção ———————————————————————————————— */}
        {(activeTab === "chats" || activeTab === "arquivados" || activeTab === "atencao") && (() => {
          const currentList = activeTab === "chats" ? activeChats : activeTab === "arquivados" ? archivedChats : attentionChats;
          const currentTitle = activeTab === "chats" ? "Conversas" : activeTab === "arquivados" ? "Arquivados" : "Em Atenção";
          // Paginação aplicada apenas na aba Arquivados
          const pagedList = activeTab === "arquivados"
            ? currentList.slice(0, archivedPage * ARCHIVED_PAGE_SIZE)
            : currentList;
          const hasMoreArchived = activeTab === "arquivados" && pagedList.length < currentList.length;
          
          return (
          <div className="h-full flex gap-4 animate-tab-enter">
            {/* Chat list panel */}
            <div className="w-[320px] flex-shrink-0 flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-red-500" />
                  {currentTitle}
                </h3>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {activeTab === "arquivados" ? `${pagedList.length} de ${currentList.length}` : `${currentList.length} itens`}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {currentList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                    <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-xs">Nenhum chat listado</p>
                  </div>
                ) : (
                  <>
                  {pagedList.map((chat) => {
                    const sb = statusBadge(chat.status);
                    const isSelected = selectedChat?.id === chat.id;
                    const isUrgent = chat.needsHuman === "true";

                    return (
                      <div
                        key={chat.id}
                        onClick={() => loadChatMessages(chat)}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border group ${
                          isSelected
                            ? "border-red-300 shadow-md"
                            : isUrgent
                            ? "border-red-200 hover:border-red-300"
                            : "border-transparent hover:border-zinc-200"
                        }`}
                        style={{
                          background: isSelected
                            ? "linear-gradient(135deg, rgba(127,29,29,0.06), rgba(220,38,38,0.04))"
                            : isUrgent
                            ? "rgba(239,68,68,0.04)"
                            : "transparent",
                        }}
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isUrgent ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600"
                            }`}>
                              {(chat.visitorName || "V")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              {/* Título editável ao clicar */}
                              {editingTitleChatId === chat.id ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <input
                                    autoFocus
                                    value={editingTitleValue}
                                    onChange={e => setEditingTitleValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") saveChatTitle(chat);
                                      if (e.key === "Escape") setEditingTitleChatId(null);
                                    }}
                                    className="text-xs font-semibold text-zinc-800 border border-red-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-red-300"
                                    disabled={savingTitle}
                                  />
                                  <button
                                    onClick={() => saveChatTitle(chat)}
                                    disabled={savingTitle}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTitleChatId(null)}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 group/title">
                                  <p className="text-sm font-semibold text-zinc-800 leading-tight truncate">
                                    {chat.visitorName || "Visitante"}
                                  </p>
                                  <button
                                    onClick={e => startEditTitle(chat, e)}
                                    title="Editar título"
                                    className="opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                              <p className="text-[10px] text-zinc-400">
                                {chat.source === "proactive" ? "Proativo" : "Widget"} &bull; {timeAgo(chat.startedAt)} &bull; {formatDateBR(chat.startedAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Badge de não-lidas por chat */}
                            {(unreadCounts[chat.id] ?? 0) > 0 && (
                              <span
                                className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[9px] font-black text-white leading-none"
                                style={{
                                  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                                  boxShadow: "0 0 0 2px white, 0 2px 6px rgba(220,38,38,0.4)",
                                  animation: "pulse 1.5s ease-in-out infinite",
                                }}
                              >
                                {(unreadCounts[chat.id] ?? 0) > 99 ? "99+" : unreadCounts[chat.id]}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${sb.bg} ${sb.color}`}>
                              {sb.icon} {sb.label}
                            </span>
                          </div>
                        </div>

                        {/* Melhoria 1: Barra de Temperatura do Lead */}
                        {chat.engagementScore !== undefined && chat.engagementScore > 0 && (
                          <div className="mt-1.5">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-[9px] text-zinc-400">
                                {chat.engagementScore >= 70 ? '🔥 Quente' : chat.engagementScore >= 40 ? '🌡️ Morno' : '🧊 Frio'}
                              </span>
                              <span className="text-[9px] font-bold text-zinc-500">{chat.engagementScore}/100</span>
                            </div>
                            <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${scoreColor(chat.engagementScore)} transition-all duration-700`}
                                style={{ width: `${Math.min(chat.engagementScore, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Melhoria 2: Badge de produto VTEX detectado */}
                        {chat.vtexProduct && (
                          <div className="flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100">
                            <span className="text-[9px]">🛒</span>
                            <span className="text-[9px] text-blue-700 font-semibold truncate max-w-[160px]">{chat.vtexProduct}</span>
                          </div>
                        )}

                        {/* Na aba Atenção, mostrar motivo do flag */}
                        {activeTab === "atencao" && chat.mood && (
                          <div className="flex items-start gap-1 mt-1 px-2 py-1 rounded-md bg-orange-50 border border-orange-100">
                            <span className="text-[10px]">🚨</span>
                            <span className="text-[10px] text-orange-700 font-medium line-clamp-2">{chat.mood}</span>
                          </div>
                        )}
                        {/* Nas outras abas exceto Atenção e Arquivados, mostrar badge de urgência */}
                        {activeTab !== "atencao" && activeTab !== "arquivados" && isUrgent && (
                          <div className="flex items-center gap-1 mt-1 px-2 py-1 rounded-md bg-red-50 border border-red-100">
                            <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                            <span className="text-[10px] text-red-600 font-medium">Fagner precisa de ajuda!</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Botão Mostrar mais — apenas na aba Arquivados */}
                  {hasMoreArchived && (
                    <button
                      onClick={() => setArchivedPage(p => p + 1)}
                      className="w-full mt-2 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-500 hover:text-zinc-700 hover:border-red-300 hover:bg-red-50/40 transition-all flex items-center justify-center gap-2"
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                      Mostrar mais {Math.min(ARCHIVED_PAGE_SIZE, currentList.length - pagedList.length)} arquivados
                      <span className="text-zinc-400 font-normal">({currentList.length - pagedList.length} restantes)</span>
                    </button>
                  )}
                  </>
                )}
              </div>
            </div>

            {/* Chat messages panel */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
              {selectedChat ? (
                <>
                  {/* Chat header */}
                  <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-600 flex-shrink-0">
                        {(selectedChat.visitorName || "V")[0].toUpperCase()}
                      </div>
                      <div>
                        {/* Título editável no header */}
                        {editingTitleChatId === selectedChat.id ? (
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editingTitleValue}
                              onChange={e => setEditingTitleValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") saveChatTitle(selectedChat);
                                if (e.key === "Escape") setEditingTitleChatId(null);
                              }}
                              className="text-sm font-bold text-zinc-800 border border-red-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-200 min-w-[160px]"
                              disabled={savingTitle}
                            />
                            <button
                              onClick={() => saveChatTitle(selectedChat)}
                              disabled={savingTitle}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                              title="Salvar título"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingTitleChatId(null)}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 transition-colors"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/header-title">
                            <h3 className="text-sm font-bold text-zinc-800">
                              {selectedChat.visitorName || "Visitante"}
                            </h3>
                            <button
                              onClick={e => startEditTitle(selectedChat, e)}
                              title="Editar título do chat"
                              className="opacity-0 group-hover/header-title:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                          <span className={`${statusBadge(selectedChat.status).color}`}>
                            {statusBadge(selectedChat.status).icon} {statusBadge(selectedChat.status).label}
                          </span>
                          <span>&bull;</span>
                          <span>Iniciado {timeAgo(selectedChat.startedAt)} &bull; {formatDateBR(selectedChat.startedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 relative">

                      {/* Botões de ação reformulados */}
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        
                        {/* 1. Botão Assumir / Ativar IA (Destaque Principal) */}
                        {activeTab !== "atencao" && activeTab !== "arquivados" && (
                          <>
                            {selectedChat.status === "ai_active" ? (
                              <Button
                                size="sm"
                                onClick={() => handleTakeOver(selectedChat.id)}
                                className="h-8 text-xs font-semibold shadow-sm text-white bg-red-600 hover:bg-red-700"
                              >
                                <User className="w-3.5 h-3.5 mr-1.5" />
                                Assumir Conversa
                              </Button>
                            ) : selectedChat.status === "human_active" ? (
                              <Button
                                size="sm"
                                onClick={() => handleReturnToAI(selectedChat.id)}
                                className="h-8 text-xs font-semibold shadow-sm text-zinc-900 bg-zinc-200 hover:bg-zinc-300"
                              >
                                <Bot className="w-3.5 h-3.5 mr-1.5" />
                                Ativar Fagner
                              </Button>
                            ) : null}
                          </>
                        )}

                        {/* 2. Ferramentas Secundárias (Visuais Coerentes) */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const v = allVisitors.find(x => x.id === selectedChat?.visitorId);
                            if (v) setSelectedVisitor(v);
                            setActiveTab("crm");
                          }}
                          className="h-8 text-xs text-zinc-600 hover:text-zinc-900 border-zinc-200"
                        >
                          <Users className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                          Ver Perfil
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCopyHistory}
                          className="h-8 text-xs text-zinc-600 hover:text-zinc-900 border-zinc-200"
                          title="Copiar todo o histórico desta conversa"
                        >
                          📋 Copiar
                        </Button>

                        {/* 3. Integração CRM (Se não for Atenção) */}
                        {activeTab !== 'atencao' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={crmSyncState === 'loading'}
                            onClick={async () => {
                              const visitorId = selectedChat?.visitorId;
                              if (!visitorId) return;
                              setCrmSyncState('loading');
                              setCrmSyncResult(null);
                              setCrmSyncModalOpen(true);
                              try {
                                const res = await fetch(`/api/livechat/visitors/${visitorId}/manual-crm-sync`, {
                                  method: 'POST',
                                  credentials: 'include',
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setCrmSyncState('success');
                                  setCrmSyncResult(data);
                                } else {
                                  setCrmSyncState('error');
                                  setCrmSyncResult(data);
                                }
                              } catch (e: any) {
                                setCrmSyncState('error');
                                setCrmSyncResult({ message: e.message ?? 'Erro desconhecido' });
                              }
                            }}
                            className={`h-8 text-xs transition-colors border ${
                              crmSyncState === 'loading'
                                ? 'border-red-200 text-red-600 bg-red-50 cursor-wait'
                                : crmSyncState === 'success'
                                ? 'border-zinc-200 text-zinc-700 bg-zinc-50 hover:bg-zinc-100'
                                : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            }`}
                            title="Gera relatório com IA e cria o card no RD CRM"
                          >
                            {crmSyncState === 'loading' ? (
                              <><span className="w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin mr-1.5" /> Enviando...</>
                            ) : crmSyncState === 'success' ? (
                              <>✅ Sincronizado!</>
                            ) : (
                              <>🏷️ Criar Lead</>
                            )}
                          </Button>
                        )}

                        {/* 4. Ações Destrutivas / Warns */}
                        {activeTab !== "atencao" && activeTab !== "arquivados" && (
                          <>
                            <div className="relative">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAttentionOpen(!attentionOpen)}
                                className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                              >
                                🚨 Flag
                              </Button>

                              {attentionOpen && (
                                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-zinc-200 p-4 z-50">
                                  <h4 className="text-sm font-bold text-zinc-800 mb-3">Marcar para Atenção</h4>
                                  <select
                                    className="w-full text-sm p-2 border border-zinc-200 rounded-lg mb-3"
                                    value={attentionReason}
                                    onChange={(e) => setAttentionReason(e.target.value)}
                                  >
                                    <option value="Falta de informação">Falta de informação</option>
                                    <option value="Não respondeu">Não respondeu</option>
                                    <option value="Não entendeu o cliente">Não entendeu o cliente</option>
                                    <option value="Parou de responder">Parou de responder</option>
                                    <option value="Outro problema técnico">Outro problema técnico</option>
                                  </select>
                                  <Textarea
                                    placeholder="Observação (opcional)"
                                    className="text-sm min-h-[60px] mb-3"
                                    value={attentionObs}
                                    onChange={(e) => setAttentionObs(e.target.value)}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setAttentionOpen(false)}>Cancelar</Button>
                                    <Button size="sm" onClick={handleFlagAttention} className="bg-red-600 hover:bg-red-700 text-white">Salvar Flag</Button>
                                  </div>
                                </div>
                              )}
                            </div>

                            <Button
                              size="sm"
                              onClick={() => handleCloseChat(selectedChat.id)}
                              className="h-8 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm"
                            >
                              Encerrar
                            </Button>
                          </>
                        )}

                        {/* Visualização da Aba Atenção */}
                        {activeTab === "atencao" && (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 ml-2">
                            👁 Somente Leitura
                          </span>
                        )}

                        {/* Ações e Tags da Aba Arquivados */}
                        {activeTab === "arquivados" && (() => {
                          const CLOSE_REASONS = [
                            { value: "sem_resposta", label: "Não respondeu mais", color: "#6b7280" },
                            { value: "venda_fechada", label: "Venda fechada", color: "#16a34a" },
                            { value: "venda_cancelada", label: "Venda cancelada", color: "#dc2626" },
                            { value: "atendimento_concluido", label: "Atendimento concluído", color: "#2563eb" },
                            { value: "problema_tecnico", label: "Problema técnico", color: "#d97706" },
                            { value: "outro", label: "Outro", color: "#7c3aed" },
                          ];
                          const currentReason = (selectedChat as any).closeReason;
                          const reasonObj = CLOSE_REASONS.find(r => r.value === currentReason);
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              {reasonObj ? (
                                <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ background: `${reasonObj.color}15`, color: reasonObj.color, borderColor: `${reasonObj.color}40` }}>
                                  📝 {reasonObj.label}
                                </span>
                              ) : null}
                              
                              <div className="relative">
                                <button
                                  id={`close-reason-btn-${selectedChat.id}`}
                                  onClick={() => setCloseReasonOpen(closeReasonOpen === selectedChat.id ? null : selectedChat.id)}
                                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  {currentReason ? "Alterar motivo" : "Definir motivo"}
                                </button>
                                {closeReasonOpen === selectedChat.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 py-1 min-w-[200px]">
                                    {CLOSE_REASONS.map(r => (
                                      <button
                                        key={r.value}
                                        disabled={closeReasonSaving}
                                        onClick={async () => {
                                          setCloseReasonSaving(true);
                                          try {
                                            await fetch(`/api/livechat/chats/${selectedChat.id}/close-reason`, {
                                              method: "PATCH",
                                              headers: { "Content-Type": "application/json" },
                                              credentials: "include",
                                              body: JSON.stringify({ reason: r.value }),
                                            });
                                            setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, closeReason: r.value } as any : c));
                                            setSelectedChat(prev => prev ? { ...prev, closeReason: r.value } as any : prev);
                                            toast({ description: "Motivo salvo com sucesso!" });
                                          } catch {
                                            toast({ description: "Erro ao salvar motivo.", variant: "destructive" });
                                          } finally {
                                            setCloseReasonSaving(false);
                                            setCloseReasonOpen(null);
                                          }
                                        }}
                                        className="w-full text-left px-4 py-2 text-xs hover:bg-zinc-50 transition-colors flex items-center gap-2"
                                      >
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                                        {r.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Messages area */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: "linear-gradient(180deg, hsl(0 0% 98.5%) 0%, hsl(0 0% 97%) 100%)" }}>
                    {/* Card de motivo — visível apenas na aba Atenção */}
                    {activeTab === "atencao" && selectedChat.mood && (
                      <div className="mb-4 p-4 rounded-xl bg-orange-50 border border-orange-200 flex gap-3">
                        <span className="text-2xl">🚨</span>
                        <div>
                          <p className="text-sm font-bold text-orange-800 mb-0.5">Motivo do Flag</p>
                          <p className="text-sm text-orange-700">{selectedChat.mood}</p>
                        </div>
                      </div>
                    )}

                    {/* Card de motivo de encerramento — visível na aba Arquivados */}
                    {activeTab === "arquivados" && (() => {
                      const REASON_MAP: Record<string, { label: string; emoji: string; bg: string; border: string; text: string }> = {
                        sem_resposta:         { label: "Cliente não respondeu mais",   emoji: "⏰", bg: "bg-zinc-50",    border: "border-zinc-200",   text: "text-zinc-600" },
                        venda_fechada:         { label: "Venda fechada com sucesso",    emoji: "✅", bg: "bg-green-50",   border: "border-green-200",  text: "text-green-700" },
                        venda_cancelada:       { label: "Venda cancelada",              emoji: "❌", bg: "bg-red-50",     border: "border-red-200",    text: "text-red-700"   },
                        atendimento_concluido: { label: "Atendimento concluído pela IA",emoji: "🤖", bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700"  },
                        restarted:             { label: "Reiniciado pelo visitante",   emoji: "🔄", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700"},
                        problema_tecnico:      { label: "Problema técnico",            emoji: "⚙️", bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700" },
                        outro:                 { label: "Outro motivo",                emoji: "📝", bg: "bg-zinc-50",   border: "border-zinc-200",   text: "text-zinc-600"  },
                      };
                      const reason = (selectedChat as any).closeReason as string | undefined;
                      const info = reason ? REASON_MAP[reason] : null;
                      if (!info && !reason) return null;
                      return (
                        <div className={`mb-4 p-4 rounded-xl flex gap-3 ${info?.bg ?? "bg-zinc-50"} border ${info?.border ?? "border-zinc-200"}`}>
                          <span className="text-2xl">{info?.emoji ?? "📋"}</span>
                          <div>
                            <p className={`text-sm font-bold mb-0.5 ${info?.text ?? "text-zinc-600"}`}>Motivo do Encerramento</p>
                            <p className={`text-sm ${info?.text ?? "text-zinc-500"}`}>{info?.label ?? reason}</p>
                          </div>
                        </div>
                      );
                    })()}
                    {chatMessages.map((msg) => {
                      const isVisitor = msg.sender === "visitor";
                      const isAI = msg.sender === "ai";
                      const isSystem = msg.sender === "system";

                      // Mensagem de sistema: label discreta centralizada
                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2">
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'rgba(0,0,0,0.05)',
                              borderRadius: '20px',
                              padding: '3px 14px',
                              fontSize: '11px',
                              color: '#888',
                              fontWeight: 500,
                            }}>
                              {msg.content}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isVisitor ? "justify-start" : "justify-end"} animate-pop-in`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                              isVisitor
                                ? "bg-white border border-zinc-200/60 rounded-2xl rounded-bl-md text-zinc-800"
                                : isAI
                                ? "rounded-2xl rounded-br-md text-white"
                                : "bg-blue-600 rounded-2xl rounded-br-md text-white"
                            }`}
                            style={isAI ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)" } : {}}
                          >
                            <div className={`flex items-center gap-1.5 mb-1 text-[10px] font-medium ${
                              isVisitor ? "text-zinc-400" : "text-white/70"
                            }`}>
                              {isVisitor && <User className="w-3 h-3" />}
                              {isAI && <Bot className="w-3 h-3" />}
                              {msg.sender === "agent" && <User className="w-3 h-3" />}
                              <span>{isVisitor ? "Visitante" : isAI ? "Fagner (IA)" : "Agente"}</span>
                              <span>&bull; {formatTime(msg.sentAt)}</span>
                            </div>

                            {/* ── Attachments do agente (imagem/doc enviado pelo operador) ── */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-col gap-2 mb-1">
                                {msg.attachments.map((att, i) => {
                                  const isImg = att.mimeType?.startsWith("image/");
                                  const isVid = att.mimeType?.startsWith("video/");
                                  // Bug 1.1: URL relativa precisa do prefixo do backend Railway
                                  const attUrl = att.url.startsWith("/") ? `${BACKEND}${att.url}` : att.url;
                                  if (isImg) return (
                                    <a key={i} href={attUrl} target="_blank" rel="noopener noreferrer"
                                      className="block rounded-xl overflow-hidden border border-white/20 shadow">
                                      <img src={attUrl} alt={att.name}
                                        className="max-w-[220px] max-h-[180px] object-contain w-full hover:opacity-90 transition-opacity" />
                                    </a>
                                  );
                                  if (isVid) return (
                                    <video key={i} controls src={attUrl}
                                      className="max-w-[240px] rounded-xl border border-white/20 shadow" />
                                  );
                                  return (
                                    <a key={i} href={attUrl} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-xs font-semibold border border-white/20">
                                      <Paperclip className="w-3.5 h-3.5" />
                                      <span className="truncate max-w-[160px]">{att.name}</span>
                                      {att.size && <span className="opacity-60">{Math.round(att.size / 1024)}KB</span>}
                                    </a>
                                  );
                                })}
                              </div>
                            )}


                            <div className="whitespace-pre-wrap break-words text-sm">
                              {(() => {
                                const isLog = /^\s*\[[A-Z0-9_]+(?:[:\]])/s.test(msg.content.trim());
                                const isExpanded = expandedLogs[msg.id] || false;
                                
                                if (isLog) {
                                  return (
                                    <div className="flex flex-col gap-1.5 min-w-[180px]">
                                      <button 
                                        onClick={() => setExpandedLogs(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                        className="flex items-center gap-1.5 text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
                                        style={{ color: isAI ? "#ffc2c2" : "#dc2626" }}
                                      >
                                        <Code size={14} /> 
                                        {isExpanded ? "Ocultar Log" : "Log Oculto (Sistema)"}
                                      </button>
                                      {isExpanded && (
                                        <div className="mt-2 p-2 bg-zinc-50/10 border border-zinc-200/20 rounded text-[11px] font-mono text-current max-h-64 overflow-y-auto block whitespace-pre-wrap">
                                          {renderMessageContent(msg.content, false)}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                // Não mostra nada se não tem texto (é só attachment)
                                if (!msg.content?.trim()) return null;
                                return renderMessageContent(msg.content, !isVisitor);
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* ── Modal de preview antes de enviar arquivo ── */}
                  {pendingFile && (
                    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-4 px-4">
                      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-pop-in">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                          <span className="text-sm font-semibold text-zinc-800">Enviar para o cliente?</span>
                          <button onClick={() => setPendingFile(null)}
                            className="flex items-center justify-center w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Preview */}
                        <div className="px-4 py-3 flex flex-col items-center gap-3">
                          {pendingFile.previewUrl ? (
                            <img src={pendingFile.previewUrl} alt={pendingFile.file.name}
                              className="max-h-52 max-w-full rounded-xl object-contain shadow border border-zinc-100" />
                          ) : (
                            <div className="flex flex-col items-center gap-2 py-4">
                              <Paperclip className="w-8 h-8 text-zinc-400" />
                              <span className="text-xs text-zinc-500 font-medium text-center break-all max-w-[220px]">
                                {pendingFile.file.name}
                              </span>
                            </div>
                          )}
                          <span className="text-[11px] text-zinc-400">{pendingFile.file.name} • {Math.round(pendingFile.file.size / 1024)}KB</span>
                        </div>
                        {/* Ações */}
                        <div className="flex gap-2 px-4 pb-4">
                          <button onClick={() => setPendingFile(null)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-all">
                            Cancelar
                          </button>
                          <button onClick={handleAgentFileUpload}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow"
                            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                            ✈️ Enviar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Input area */}
                  <div className="px-4 py-3 border-t border-zinc-100 bg-white">
                    {activeTab === "arquivados" || selectedChat.status === "closed" ? (
                      <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-50 border border-zinc-100">
                        <Layers className="w-4 h-4 text-zinc-400" />
                        <p className="text-[11px] text-zinc-500 font-medium">
                          Conversa encerrada — hist\u00F3rico somente para leitura.
                        </p>
                      </div>
                    ) : selectedChat.status === "human_active" ? (
                      <div className="space-y-2">
                        {/* Linha de input de texto + botão clipe */}
                        <div className="flex gap-2">
                          {/* Input oculto para upload de arquivo */}
                          <input
                            ref={agentFileInputRef}
                            type="file"
                            accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,video/mp4,video/webm"
                            className="hidden"
                            onChange={handleAgentFileSelected}
                          />
                          {/* Botão clipe */}
                          <button
                            onClick={() => agentFileInputRef.current?.click()}
                            disabled={isRecording || isSendingAudio || isUploadingFile}
                            title="Enviar arquivo (imagem, PDF, planilha, vídeo)"
                            className="self-end flex items-center justify-center h-[44px] w-[44px] rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all disabled:opacity-40"
                          >
                            {isUploadingFile
                              ? <div className="w-4 h-4 border-2 border-zinc-300 border-t-red-500 rounded-full animate-spin" />
                              : <Paperclip className="w-4 h-4" />}
                          </button>
                          <Textarea
                            value={agentInput}
                            onChange={(e) => setAgentInput(e.target.value)}
                            placeholder={isRecording ? "🎙️ Gravando... clique em ⏹ para parar e enviar" : "Escreva sua mensagem..."}
                            disabled={isRecording || isSendingAudio}
                            className="resize-none min-h-[44px] max-h-[100px] text-sm rounded-xl border-zinc-200 focus:border-red-300 focus:ring-red-200 disabled:opacity-60"
                            rows={1}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAgentSend(); }
                            }}
                          />
                          {/* Botão Enviar texto */}
                          <Button
                            onClick={handleAgentSend}
                            disabled={!agentInput.trim() || isRecording || isSendingAudio}
                            className="self-end h-[44px] w-[44px] rounded-xl p-0 disabled:opacity-40"
                            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Linha de áudio */}
                        <div className="flex flex-col gap-2">

                          {/* ─ Preview pós-gravação: player + descartar/enviar ─ */}
                          {pendingAudioBlob && !isSendingAudio && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                              style={{ background: "rgba(127,29,29,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
                              <audio
                                src={pendingAudioBlob.url}
                                controls
                                style={{ height: 28, minWidth: 160, maxWidth: 220 }}
                              />
                              {/* Descartar */}
                              <button
                                onClick={discardPendingAudio}
                                title="Descartar e regravar"
                                className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {/* Enviar */}
                              <button
                                onClick={sendPendingAudio}
                                title="Enviar áudio"
                                className="flex items-center justify-center w-8 h-8 rounded-xl text-white transition-all"
                                style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {isSendingAudio && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-500"
                              style={{ background: "rgba(0,0,0,0.04)" }}>
                              <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                              <span>Enviando áudio...</span>
                            </div>
                          )}

                          {/* ─ Botão Mic / Stop (só mostra se não há preview pendente) ─ */}
                          {!pendingAudioBlob && !isSendingAudio && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={isRecording ? stopRecording : startRecording}
                                title={isRecording ? "Parar gravação" : "Gravar mensagem de voz"}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all select-none"
                                style={isRecording ? {
                                  background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
                                  color: "#fff",
                                  boxShadow: "0 0 0 3px rgba(220,38,38,0.25)",
                                  animation: "pulse 1.2s infinite",
                                } : {
                                  background: "rgba(0,0,0,0.05)",
                                  color: "#555",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                }}
                              >
                                {isRecording ? (
                                  <>
                                    <Square className="w-3.5 h-3.5" />
                                    <span>{formatRecordingTime(recordingSeconds)}</span>
                                  </>
                                ) : (
                                  <>
                                    <Mic className="w-3.5 h-3.5" />
                                    <span>Áudio</span>
                                  </>
                                )}
                              </button>
                              {isRecording && (
                                <span className="text-[10px] text-red-500 font-medium animate-pulse">
                                  ● Gravando — clique em ⏹ para parar
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                        <Bot className="w-4 h-4 text-emerald-500" />
                        <p className="text-[11px] text-emerald-700 font-medium">
                          Fagner está conduzindo este atendimento. Clique em "Assumir" para intervir.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-3">
                    <MessageCircle className="w-8 h-8 text-zinc-300" />
                  </div>
                  <p className="text-sm font-medium text-zinc-500">Selecione uma conversa</p>
                  <p className="text-[11px] text-zinc-400">para visualizar as mensagens</p>
                </div>
              )}
            </div>
          </div>
        )})()}

        {/* ——— Tab: Visitantes ———————————————————————————————————————— */}
        {activeTab === "visitors" && (
          <div className="h-full flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden animate-tab-enter">
            {/* ── Online Header ── */}
            <div
              className="shrink-0 px-5 py-3 border-b border-zinc-100 flex items-center justify-between cursor-pointer select-none hover:bg-zinc-50/60 transition-colors"
              onClick={() => setOnlineExpanded(p => !p)}
              title={onlineExpanded ? "Minimizar visitantes online" : "Expandir visitantes online"}
            >
              <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-all ${onlineExpanded ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-300'}`} />
                Visitantes Online
                <span className="text-zinc-400 font-normal">({filteredVisitors.filter(v => v.isOnline === "true").length})</span>
              </h3>
              <ChevronRight
                className={`w-4 h-4 text-zinc-300 transition-transform duration-200 ${onlineExpanded ? 'rotate-90' : ''}`}
              />
            </div>

            {/* Visitor cards list — só renderiza quando expandido */}
            {onlineExpanded && <div
              className="overflow-y-auto p-4"
              style={{ flex: offlineExpanded ? '0 0 45%' : '1 1 auto', minHeight: 0 }}
            >
              {filteredVisitors.filter(v => v.isOnline === "true").length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                  <Eye className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">{sq ? "Nenhum resultado encontrado" : "Nenhum visitante online"}</p>
                  <p className="text-[11px]">{sq ? "Tente outro termo de busca" : "Os visitantes aparecerão aqui em tempo real"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredVisitors.filter(v => v.isOnline === "true").map((v, idx) => {
                    const cat = categoryLabel(v.category);
                    const src = sourceLabel(v.source);

                    return (
                      <div
                        key={v.id}
                        onClick={() => openHistoryModal(v)}
                        className="p-4 rounded-xl border border-zinc-100 hover:border-red-200 hover:shadow-md transition-all duration-200 bg-white group animate-pop-in cursor-pointer"
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        {/* Top line: Nome + Badge */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
                                <User className="w-5 h-5 text-zinc-400" />
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${v.isOnline === "true" ? "bg-emerald-400" : "bg-zinc-300"}`} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-800">
                                {v.name || "NÃO IDENTIFICADO"}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-3 h-3" />
                                  {v.city ? `${v.city}${v.country ? `, ${v.country}` : ""}` : "Localização desconhecida"}
                                </span>
                                <span className="text-zinc-200">·</span>
                                <span className="flex items-center gap-0.5">
                                  <Hash className="w-3 h-3" /> {v.totalVisits} vis
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cat.bg}`}>
                            {cat.emoji} {cat.label}
                          </span>
                        </div>

                        {/* Current page — clicável para abrir modal do visitante */}
                        {(v.currentPageTitle || v.currentPage) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openHistoryModal(v); }}
                            title="Abrir modal do visitante"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 mb-2 group-hover:bg-red-50/30 group-hover:border-red-100/50 transition-colors w-full text-left hover:bg-red-50/50 hover:border-red-200/60 cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3 text-red-400 flex-shrink-0" />
                            <p className="text-[11px] text-zinc-600 truncate font-medium">
                              {v.currentPage && v.currentPage !== '/' && v.currentPage !== v.currentPageTitle 
                                ? v.currentPage 
                                : v.currentPageTitle || v.currentPage || "Página inativa"}
                            </p>
                          </button>
                        )}

                        {/* Metrics row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                            <span className="flex items-center gap-0.5">
                              {src.icon} {src.label}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Layers className="w-3 h-3" /> {v.totalPages} pgs
                            </span>
                          </div>

                          {/* Score bar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${scoreColor(v.engagementScore)} transition-all duration-500`}
                                style={{ width: `${Math.min(v.engagementScore, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-zinc-600">{v.engagementScore}</span>
                          </div>
                        </div>

                        {/* Browser + Timestamp */}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-zinc-300">{v.browser}</span>
                          <span className="text-[10px] text-zinc-300 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {timeAgo(v.lastSeenAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>}

            {/* ── Offline Visitors Section ── */}
            <div
              className="shrink-0 px-5 py-2.5 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/60 cursor-pointer select-none hover:bg-zinc-100/70 transition-colors"
              onClick={() => setOfflineExpanded(p => !p)}
              title={offlineExpanded ? "Minimizar visitantes offline" : "Expandir visitantes offline"}
            >
              <h3 className="text-xs font-semibold text-zinc-500 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-300" />
                Visitantes Offline
                <span className="text-zinc-400 font-normal text-[11px]">
                  ({filteredVisitors.filter(v => v.isOnline !== "true").length} recentes)
                </span>
                {!offlineExpanded && (
                  <span className="text-[10px] text-zinc-400 italic font-normal">— clique para carregar</span>
                )}
              </h3>
              <ChevronRight
                className={`w-4 h-4 text-zinc-300 transition-transform duration-200 ${offlineExpanded ? 'rotate-90' : ''}`}
              />
            </div>
            
            {/* Offline cards — SÓ renderiza quando expandido (evita processar 3k+ cards no DOM) */}
            {offlineExpanded && <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-zinc-50/30">
              {filteredVisitors.filter(v => v.isOnline !== "true").length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                  <User className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs font-medium">{sq ? "Nenhum resultado encontrado" : "Nenhum visitante offline recente"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 opacity-80 hover:opacity-100 transition-opacity">
                  {filteredVisitors.filter(v => v.isOnline !== "true").map((v, idx) => {
                    const cat = categoryLabel(v.category);
                    const src = sourceLabel(v.source);
                    const displayUrl = v.currentPage && v.currentPage !== '/' && v.currentPage !== v.currentPageTitle 
                        ? v.currentPage 
                        : v.currentPageTitle || v.currentPage || "Página inativa";

                    return (
                      <div
                        key={v.id}
                        onClick={() => openHistoryModal(v)}
                        className="p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 transition-all duration-200 bg-white group cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center">
                                <User className="w-5 h-5 text-zinc-300" />
                              </div>
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white bg-zinc-300" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-500">
                                {v.name || "NÃO IDENTIFICADO"}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-3 h-3" />
                                  {v.city ? `${v.city}${v.country ? `, ${v.country}` : ""}` : "Localização desconhecida"}
                                </span>
                                <span className="text-zinc-200">·</span>
                                <span className="flex items-center gap-0.5">
                                  <Hash className="w-3 h-3" /> {v.totalVisits} vis
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cat.bg} grayscale opacity-70`}>
                            {cat.emoji} {cat.label}
                          </span>
                        </div>

                        {/* Página atual — clicável para abrir modal do visitante */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openHistoryModal(v); }}
                          title="Abrir modal do visitante"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 mb-2 w-full text-left hover:bg-red-50/40 hover:border-red-200/60 cursor-pointer transition-colors"
                        >
                          <ExternalLink className="w-3 h-3 text-red-400 flex-shrink-0" />
                          <p className="text-[11px] text-zinc-500 truncate font-medium" title={v.currentPage || ""}>
                            {displayUrl}
                          </p>
                        </button>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                            <span className="flex items-center gap-0.5">
                              {src.icon} {src.label}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Layers className="w-3 h-3" /> {v.totalPages} pgs
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-zinc-300">{v.browser}</span>
                          <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            Inativo há {timeAgo(v.lastSeenAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>}

            {/* ── Identified Visitors Section ── */}
            {(() => {
              const identifiedVisitors = allVisitors.filter(v =>
                passesDateFilter(v.lastSeenAt) &&
                v.name && v.name.trim() !== "" && (
                  !sq ||
                  (v.name ?? "").toLowerCase().includes(sq) ||
                  (v.city ?? "").toLowerCase().includes(sq)
                )
              );
              return (
                <>
                  <div
                    className="shrink-0 px-5 py-2.5 border-t border-zinc-100 flex items-center justify-between bg-blue-50/40 cursor-pointer select-none hover:bg-blue-100/40 transition-colors"
                    onClick={() => setIdentifiedExpanded(p => !p)}
                    title={identifiedExpanded ? "Minimizar visitantes identificados" : "Expandir visitantes identificados"}
                  >
                    <h3 className="text-xs font-semibold text-blue-700 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      Visitantes Identificados
                      <span className="text-blue-500 font-normal text-[11px]">({identifiedVisitors.length} com nome)</span>
                      {!identifiedExpanded && (
                        <span className="text-[10px] text-blue-400 italic font-normal">— clique para carregar</span>
                      )}
                    </h3>
                    <ChevronRight
                      className={`w-4 h-4 text-blue-300 transition-transform duration-200 ${identifiedExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>

                  {identifiedExpanded && (
                    <div className="flex-1 overflow-y-auto p-4 bg-blue-50/10 border-t border-blue-100/50">
                      {identifiedVisitors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                          <User className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-xs font-medium">{sq ? "Nenhum resultado encontrado" : "Nenhum visitante identificado ainda"}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {identifiedVisitors.map((v, idx) => {
                            const cat = categoryLabel(v.category);
                            const src = sourceLabel(v.source);
                            return (
                              <div
                                key={v.id}
                                onClick={() => openHistoryModal(v)}
                                className="p-4 rounded-xl border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all duration-200 bg-white group cursor-pointer"
                                style={{ animationDelay: `${idx * 40}ms` }}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2.5">
                                    <div className="relative">
                                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                                        <span className="text-sm font-bold text-blue-600">
                                          {(v.name || "?")[0].toUpperCase()}
                                        </span>
                                      </div>
                                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${v.isOnline === "true" ? "bg-emerald-400" : "bg-zinc-300"}`} />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-zinc-800">{v.name}</p>
                                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                                        <span className="flex items-center gap-0.5">
                                          <MapPin className="w-3 h-3" />
                                          {v.city ? `${v.city}${v.country ? `, ${v.country}` : ""}` : "Localização desconhecida"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cat.bg}`}>
                                    {cat.emoji} {cat.label}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                                    <span className="flex items-center gap-0.5">{src.icon} {src.label}</span>
                                    <span className="flex items-center gap-0.5"><Hash className="w-3 h-3" /> {v.totalVisits} vis</span>
                                  </div>
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${v.isOnline === "true" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500"}`}>
                                    {v.isOnline === "true" ? "Online agora" : `Inativo ${timeAgo(v.lastSeenAt)}`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ——— MODAL: Customer Glance (novo modal de visitante) ——— */}
        {historyModal && (
          <CustomerModal
            visitor={historyModal.visitor}
            pageviews={historyModal.pageviews}
            timeline={historyModal.timeline}
            timelineLoading={timelineLoading}
            open={!!historyModal}
            onClose={() => setHistoryModal(null)}
            onOpenCRM={() => {
              const crmV = allVisitors.find(x => x.id === historyModal.visitor.id);
              if (crmV) setSelectedVisitor(crmV);
              setHistoryModal(null);
              setActiveTab("crm");
            }}
            onLoadTimeline={(visitorId) => loadVisitorTimeline(visitorId)}
          />
        )}


        {/* ——— Tab: CRM Kanban ————————————————————————————————————————————————— */}
        {activeTab === "crm" && (
          <div className="h-full flex flex-col animate-tab-enter">
            {/* Kanban columns */}
            <div className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden pb-2">
              {[
                { stage: "novo_atendimento", label: "Novo Atendimento", color: "#22c55e", bgLight: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.3)" },
                { stage: "em_atendimento", label: "Em Atendimento", color: "#3b82f6", bgLight: "rgba(59,130,246,0.06)", borderColor: "rgba(59,130,246,0.3)" },
                { stage: "maquinas", label: "Máquinas", color: "#ea580c", bgLight: "rgba(234,88,12,0.06)", borderColor: "rgba(234,88,12,0.3)" },
                { stage: "pecas", label: "Peças", color: "#d97706", bgLight: "rgba(217,119,6,0.06)", borderColor: "rgba(217,119,6,0.3)" },
                { stage: "pos_venda", label: "Pós Venda", color: "#8b5cf6", bgLight: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.3)" },
                { stage: "finalizado_com_venda", label: "Vendido", color: "#f59e0b", bgLight: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)" },
                { stage: "sem_resposta", label: "Sem Resposta", color: "#71717a", bgLight: "rgba(113,113,122,0.06)", borderColor: "rgba(113,113,122,0.3)" },
                { stage: "outros", label: "Outros", color: "#64748b", bgLight: "rgba(100,116,139,0.06)", borderColor: "rgba(100,116,139,0.3)" },
              ].map((col) => {
                // Aplica o filtro de search no kanban: filtra por nome do visitante
                const allItems = pipelineData[col.stage] || [];
                const items = allItems.filter((v: Visitor) => 
                  passesDateFilter(v.lastSeenAt || v.firstSeenAt) &&
                  (!sq ||
                    (v.name ?? "").toLowerCase().includes(sq) ||
                    (v.city ?? "").toLowerCase().includes(sq)
                  )
                );
                const isCollapsed = collapsedStages.has(col.stage);
                const toggleCollapse = () => setCollapsedStages(prev => {
                  const next = new Set(prev);
                  if (next.has(col.stage)) next.delete(col.stage);
                  else next.add(col.stage);
                  return next;
                });
                return (
                  <div
                    key={col.stage}
                    className={`flex flex-col rounded-2xl border shadow-sm overflow-hidden transition-all duration-300 ${
                      isCollapsed ? "flex-none w-[52px]" : "flex-1 min-w-[220px] max-w-[280px]"
                    } ${
                      dragOverStage === col.stage
                        ? "scale-[1.015] shadow-xl border-2"
                        : "bg-white border-zinc-200/60"
                    }`}
                    style={{
                      background: dragOverStage === col.stage ? col.bgLight : "white",
                      borderColor: dragOverStage === col.stage ? col.color : undefined,
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(col.stage); }}
                    onDragLeave={(e) => {
                      // Ignora dragLeave de filhos
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverStage(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverStage(null);
                      const vId = draggingVisitorId;
                      const fromStage = draggingFromStage.current;
                      setDraggingVisitorId(null);
                      draggingFromStage.current = null;
                      if (vId && fromStage !== col.stage) {
                        handleMoveCard(vId, col.stage);
                      }
                    }}
                  >
                    {/* Column header with color bar */}
                    {isCollapsed ? (
                      /* ── Header minimizado: vertical ── */
                      <div
                        className="flex-1 flex flex-col items-center pt-2 pb-3 gap-2 cursor-pointer select-none hover:bg-zinc-50/60 transition-colors"
                        onClick={toggleCollapse}
                        title={`Expandir ${col.label}`}
                      >
                        <div className="w-full h-1" style={{ background: col.color }} />
                        <span
                          className="mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                          style={{ background: col.color }}
                        >
                          {allItems.length}
                        </span>
                        <p
                          className="text-[9px] font-bold text-zinc-500 mt-1 select-none"
                          style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)", letterSpacing: "0.05em" }}
                        >
                          {col.label}
                        </p>
                        <ChevronRight className="w-3 h-3 text-zinc-300 mt-auto" style={{ transform: "rotate(180deg)" }} />
                      </div>
                    ) : (
                      <div className="flex-shrink-0">
                        <div className="h-1 w-full" style={{ background: col.color }} />
                        <div className="px-3 py-2.5 border-b border-zinc-100" style={{ background: col.bgLight }}>
                          <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-bold text-zinc-700 leading-tight">{col.label}</h4>
                            <div className="flex items-center gap-1">
                              <span
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                                style={{ background: col.color }}
                              >
                                {items.length}
                              </span>
                              <button
                                onClick={toggleCollapse}
                                title={`Minimizar ${col.label}`}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/5 transition-colors"
                              >
                                <ChevronRight className="w-3 h-3 text-zinc-400" style={{ transform: "rotate(90deg)" }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Scrollable card list — SÓ renderiza quando expandido (evita processar 5k+ cards no DOM) */}
                    {!isCollapsed && <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-zinc-300">
                          <Users className="w-6 h-6 mb-1.5 opacity-40" />
                          <p className="text-[10px]">Nenhum</p>
                        </div>
                      ) : (
                        items.map((v: Visitor) => {
                          const src = sourceLabel(v.source);
                          const isSelected = selectedVisitor?.id === v.id;

                          return (
                            <div
                              key={v.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggingVisitorId(v.id);
                                draggingFromStage.current = col.stage;
                                // Snapshot fantasma no drag nativo
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggingVisitorId(null);
                                setDragOverStage(null);
                                draggingFromStage.current = null;
                              }}
                              onClick={() => setSelectedVisitor(isSelected ? null : v)}
                              className={`p-2.5 rounded-xl border cursor-grab active:cursor-grabbing select-none transition-all duration-200 hover:shadow-md group ${
                                draggingVisitorId === v.id
                                  ? "opacity-40 scale-95 rotate-1 shadow-lg"
                                  : isSelected
                                  ? "shadow-md"
                                  : "hover:border-zinc-200"
                              }`}
                              style={{
                                borderColor: isSelected && draggingVisitorId !== v.id ? col.borderColor : "rgba(228,228,231,0.6)",
                                background: isSelected && draggingVisitorId !== v.id ? col.bgLight : "white",
                              }}
                            >
                              {/* Name + online status */}
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="relative">
                                    <div
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                                      style={{ background: col.color }}
                                    >
                                      {(v.name || v.city || "?")[0].toUpperCase()}
                                    </div>
                                    {v.isOnline === "true" && (
                                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-semibold text-zinc-800 leading-tight truncate max-w-[120px]">
                                      {v.name || v.city || "Visitante"}
                                    </p>
                                    <p className="text-[9px] text-zinc-400">{v.browser}</p>
                                  </div>
                                </div>
                                <span className="text-[9px] text-zinc-300">{timeAgo(v.lastSeenAt)}</span>
                              </div>

                              {/* Score bar */}
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <div className="flex-1 h-1 rounded-full bg-zinc-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${scoreColor(v.engagementScore)}`}
                                    style={{ width: `${Math.min(v.engagementScore, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-bold text-zinc-500 w-4 text-right">{v.engagementScore}</span>
                              </div>

                              {/* Meta info */}
                               <div className="flex items-center gap-2 text-[9px] text-zinc-400">
                                <span>{src.icon} {src.label}</span>
                                <span>{"\u2022"} {v.totalChats} chats</span>
                                
                                {(() => {
                                  const previousCount = visitors.filter(p => p.cookieId === v.cookieId && p.id !== v.id).length;
                                  if (previousCount > 0) {
                                    return (
                                      <span className="flex items-center gap-0.5 text-[8px] bg-amber-50 text-amber-600 font-bold px-1.5 py-0.5 rounded border border-amber-100 ml-auto">
                                        {"\u{1F4C2}"} {previousCount} anterior{previousCount > 1 ? 'es' : ''}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                               {/* Pós Venda badge */}

                               {(v as any).posVendaNome && (

                                 <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-100">

                                   <span className="text-[8px]">🎫</span>

                                   <span className="text-[8px] text-purple-700 font-semibold truncate">{(v as any).posVendaNome}</span>

                                 </div>

                               )}

                            </div>
                          );
                        })
                      )}
                    </div>}
                  </div>
                );
              })}
            </div>

            {/* Painel de Detalhes do Visitante (modal expandido) */}
            {selectedVisitor && (
              <div className="flex-shrink-0 mt-3 bg-white rounded-2xl border border-zinc-200/60 shadow-lg overflow-hidden animate-pop-in">
                <div className="flex" style={{ maxHeight: "280px" }}>

                  {/* Col 1: Identidade + Métricas */}
                  <div className="w-[260px] flex-shrink-0 p-4 flex flex-col gap-3 border-r border-zinc-100">
                    {/* Avatar + Nome */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                        {(selectedVisitor.name || selectedVisitor.city || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-zinc-800 leading-tight truncate">{selectedVisitor.name || selectedVisitor.city || "Desconhecido"}</h3>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${categoryLabel(selectedVisitor.category).bg}`}>
                            {categoryLabel(selectedVisitor.category).emoji} {categoryLabel(selectedVisitor.category).label}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            selectedVisitor.isOnline === "true"
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                              : "bg-zinc-50 text-zinc-500 border border-zinc-200"
                          }`}>
                            {selectedVisitor.isOnline === "true" ? "\u{1F7E2} Online" : "\u26AB Offline"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Info linha */}
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      {[selectedVisitor.country, selectedVisitor.browser, `${sourceLabel(selectedVisitor.source).icon} ${sourceLabel(selectedVisitor.source).label}`].filter(Boolean).join(" • ")}
                    </p>

                    {/* Métricas 4 colunas */}
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: "Visitas", value: selectedVisitor.totalVisits },
                        { label: "Páginas", value: selectedVisitor.totalPages },
                        { label: "Chats", value: selectedVisitor.totalChats },
                        { label: "Score", value: selectedVisitor.engagementScore },
                      ].map((m) => (
                        <div key={m.label} className="text-center bg-zinc-50 rounded-lg py-1.5">
                          <p className="text-sm font-bold text-zinc-800">{m.value}</p>
                          <p className="text-[8px] text-zinc-400">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra de Score */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-zinc-400">
                        <span>Engajamento</span>
                        <span className="font-bold">{selectedVisitor.engagementScore}/100</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${scoreColor(selectedVisitor.engagementScore)} transition-all duration-700`}
                          style={{ width: `${Math.min(selectedVisitor.engagementScore, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Datas */}
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Primeiro acesso</span>
                        <span className="text-zinc-600 font-medium">{new Date(selectedVisitor.firstSeenAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Última atividade</span>
                        <span className="text-zinc-600 font-medium">{timeAgo(selectedVisitor.lastSeenAt)}</span>
                      </div>
                    </div>

                    {/* Página atual — clicável para abrir modal */}
                    {selectedVisitor.currentPage && (
                      <button
                        type="button"
                        onClick={() => openHistoryModal(selectedVisitor)}
                        title="Abrir modal do visitante"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-100 w-full text-left hover:bg-red-50/40 hover:border-red-200/60 cursor-pointer transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 text-red-400 flex-shrink-0" />
                        <span className="text-[10px] text-zinc-600 truncate">{selectedVisitor.currentPageTitle || selectedVisitor.currentPage}</span>
                      </button>
                    )}

                                        <button
                      onClick={() => { openHistoryModal(selectedVisitor); setActiveTab("visitors"); }}
                      className="mt-auto text-[10px] font-semibold text-red-600 hover:text-red-700 border border-red-100 hover:border-red-200 hover:bg-red-50 transition-colors py-1.5 w-full text-center rounded-lg"
                    >
                      🗺️ Histórico de Navegação
                    </button>
<button
                      onClick={() => setSelectedVisitor(null)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors py-1 w-full text-center"
                    >
                      {"\u2715"} Fechar
                    </button>
                  </div>

                  {/* Col 2: Chat Atual (Conversas Ativas) */}
                  <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 p-4 flex flex-col overflow-hidden bg-white">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                      {"\u{1F4AC}"} Conversas da Sessão
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                      {visitorChats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-300 py-4">
                          <MessageCircle className="w-6 h-6 mb-1 opacity-40" />
                          <p className="text-[10px] text-center">Nenhum chat</p>
                        </div>
                      ) : (
                        visitorChats.map(c => (
                          <div
                            key={c.id}
                            onClick={() => openVisitorChat(c.id)}
                            className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-red-50/50 border border-red-100 cursor-pointer hover:bg-red-50 hover:border-red-300 transition-all group shadow-sm"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.status === "closed" ? "bg-zinc-300" : "bg-emerald-500 animate-pulse"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-bold text-red-700 leading-tight">
                                {c.visitorName || selectedVisitor.name || "Visitante"}
                              </p>
                              <span className="text-[9px] text-red-500/70 font-medium">{timeAgo(c.startedAt)}</span>
                            </div>
                            <span className="text-[10px] text-red-600 font-bold ml-1 flex-shrink-0">→</span >
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Col 3: Histórico de Negociações (Outros Cards) */}
                  <div className="w-[200px] flex-shrink-0 border-r border-zinc-100 p-4 flex flex-col overflow-hidden bg-zinc-50/30">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                      {"\u{1F4C2}"} Negociações Anteriores
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                      {pastNegotiations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-300 py-4">
                          <Layers className="w-6 h-6 mb-1 opacity-40" />
                          <p className="text-[10px] text-center">Nenhum histórico extra</p>
                        </div>
                      ) : (
                        pastNegotiations.map((pn: any) => (
                          <div
                            key={pn.id}
                            onClick={() => setSelectedVisitor(pn)}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-zinc-200 cursor-pointer hover:border-zinc-300 hover:shadow-sm transition-all group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-[10px] font-medium text-zinc-600 group-hover:text-zinc-900 transition-colors">
                                {new Date(pn.lastSeenAt).toLocaleDateString("pt-BR", { day: '2-digit', month: 'short' })} • {pn.pipelineStage ? pn.pipelineStage.replace(/_/g," ") : ""}
                              </p>
                            </div>
                            <span className="text-[8px] bg-zinc-100 text-zinc-400 px-1 py-0.5 rounded flex-shrink-0">Card</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Col: Sobre o Cliente + dados por fluxo (scroll único) */}
                  <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 p-4 flex flex-col overflow-hidden" style={{ background: "rgba(217,119,6,0.03)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-3 flex-shrink-0 flex items-center gap-1.5" style={{ color: "#d97706" }}>
                      👤 Sobre o cliente
                    </p>
                    {/* scroll único para todos os campos */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                      {/* Campos base universais */}
                      {[
                        { label: "Nome do comprador", value: selectedVisitor.posVendaNome, icon: "👤" },
                        { label: "Telefone (WhatsApp)", value: selectedVisitor.posVendaTelefone, icon: "📱" },
                        { label: "E-mail de suporte", value: selectedVisitor.posVendaEmail, icon: "✉️" },
                        { label: "CPF / CNPJ", value: selectedVisitor.posVendaCnpjCpf, icon: "🪪" },
                      ].map(f => (
                        <div key={f.label} className={`p-2 rounded-lg border shadow-sm ${f.value ? 'bg-white border-amber-100/60' : 'bg-zinc-50 border-zinc-100/60 opacity-70'}`}>
                          <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#d97706' }}>{f.icon} {f.label}</p>
                          <p className={`text-[11px] font-semibold break-all leading-snug ${f.value ? 'text-zinc-700' : 'text-zinc-400 italic'}`}>
                            {f.value || "Aguardando"}
                          </p>
                        </div>
                      ))}

                      {/* Pós Venda — campos específicos */}
                      {/* Exibe quando está no stage pos_venda OU quando já tem dados preenchidos (para preservar ao voltar) */}
                      {(selectedVisitor.pipelineStage === 'pos_venda' || selectedVisitor.posVendaProblema || selectedVisitor.posVendaNotaPedido) && (
                        <>
                          <div className="pt-1 pb-0.5">
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8b5cf6' }}>
                              Pós Venda
                            </p>
                          </div>
                          {[
                            { label: 'Problema relatado', value: selectedVisitor.posVendaProblema, icon: '⚙️' },
                            { label: 'Nota do pedido', value: selectedVisitor.posVendaNotaPedido, icon: '📄' },
                          ].map(f => (
                            <div key={f.label} className={`p-2 rounded-lg border shadow-sm ${f.value ? 'bg-white border-purple-100/60' : 'bg-zinc-50 border-zinc-100/60 opacity-70'}`}>
                              <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#8b5cf6' }}>{f.icon} {f.label}</p>
                              <p className={`text-[11px] font-semibold break-all leading-snug ${f.value ? 'text-zinc-700' : 'text-zinc-400 italic'}`}>
                                {f.value || 'Aguardando'}
                              </p>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Pecas - campos especificos */}
                      {/* Exibe quando está no stage pecas OU quando já tem dados preenchidos (para preservar ao voltar) */}
                      {(selectedVisitor.pipelineStage === 'pecas' || selectedVisitor.pecaDesejada || selectedVisitor.pecasECliente) && (
                        <>
                          <div className="pt-1 pb-0.5">
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#b45309' }}>
                              🔧 Peças
                            </p>
                          </div>
                          {[
                            { label: 'Peca desejada', value: selectedVisitor.pecaDesejada, icon: '🔧' },
                            { label: 'É cliente Tecfag?', value: selectedVisitor.pecasECliente, icon: '✅' },
                          ].map(f => (
                            <div key={f.label} className={`p-2 rounded-lg border shadow-sm ${f.value ? 'bg-white border-amber-200/60' : 'bg-zinc-50 border-zinc-100/60 opacity-70'}`}>
                              <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#b45309' }}>{f.icon} {f.label}</p>
                              <p className={`text-[11px] font-semibold break-all leading-snug ${f.value ? 'text-zinc-700' : 'text-zinc-400 italic'}`}>
                                {f.value || 'Aguardando'}
                              </p>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Maquinas - campos especificos */}
                      {/* Exibe quando está no stage maquinas OU quando já tem dados preenchidos (para preservar ao voltar) */}
                      {(selectedVisitor.pipelineStage === 'maquinas' || selectedVisitor.maquinaProdutoFabricado || selectedVisitor.maquinaVolumeProducao || selectedVisitor.maquinaQualificacaoSDR || selectedVisitor.maquinaClienteNovo) && (
                        <>
                          <div className="pt-1 pb-0.5">
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#ea580c' }}>⚩️ Máquinas</p>
                          </div>
                          {[
                            { label: 'Produto fabricado', value: selectedVisitor.maquinaProdutoFabricado, icon: '🏭' },
                            { label: 'Volume de produção', value: selectedVisitor.maquinaVolumeProducao, icon: '📊' },
                            { label: 'Qualificação SDR', value: selectedVisitor.maquinaQualificacaoSDR, icon: '⭐' },
                            { label: 'Cliente novo?', value: selectedVisitor.maquinaClienteNovo, icon: '🆕' },
                          ].map(f => (
                            <div key={f.label} className={`p-2 rounded-lg border shadow-sm ${f.value ? 'bg-white border-orange-100/60' : 'bg-zinc-50 border-zinc-100/60 opacity-70'}`}>
                              <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#ea580c' }}>{f.icon} {f.label}</p>
                              <p className={`text-[11px] font-semibold break-all leading-snug ${f.value ? 'text-zinc-700' : 'text-zinc-400 italic'}`}>{f.value || 'Aguardando'}</p>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Col: Notas da IA */}
                  <div className="flex-1 p-4 flex flex-col overflow-hidden bg-zinc-50/30">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                      {"\u{1F4DD}"} Notas da IA
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {selectedVisitor.notes && selectedVisitor.notes.length > 0 ? (
                        [...selectedVisitor.notes].reverse().map((n, i) => {
                          // Extrai qualquer URL do RD Station da nota (card de deal, crm, sales ou deals)
                          const rdLinkMatch = n.content.match(/https:\/\/(?:app\.rdstation\.com\.br\/(?:crm|sales|deals)|crm\.rdstation\.com\/app)\/[\w\-\/]+/);
                          // Remove a URL bruta do texto do card — vai virar botão dedicado
                          const cleanContent = n.content
                            .replace(/Link:\s*https:\/\/[^\s]+/g, "")
                            .replace(/https:\/\/(?:app\.rdstation\.com\.br|crm\.rdstation\.com)\/[^\s]+/g, "")
                            .trim();
                          return (
                            <div key={i} className="p-2.5 bg-white border border-zinc-200/70 rounded-xl shadow-sm">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-red-600">{n.stage}</span>
                                <span className="text-[9px] text-zinc-300">
                                  {new Date(n.date).toLocaleDateString("pt-BR")} {new Date(n.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-600 leading-snug whitespace-pre-line">{cleanContent}</p>
                              {rdLinkMatch && (
                                <a
                                  href={rdLinkMatch[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition-all hover:opacity-90 w-full justify-center"
                                  style={{ background: "linear-gradient(135deg, #0078cc, #0056b3)" }}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  ABRIR NO RD STATION
                                </a>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-300 py-4">
                          <Bot className="w-8 h-8 mb-2 opacity-30" />
                          <p className="text-[10px] text-center max-w-[160px]">O Fagner gerará notas automaticamente ao encerrar uma conversa.</p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: Estatísticas (Melhoria 4) */}
        {activeTab === "stats" && <StatsTab dateFilterActive={dateFilterActive} customFrom={dateFrom} customTo={dateTo} />}
      </div>

      {/* ══════════════ FILTER MODAL ══════════════ */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setFilterOpen(false); }}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl w-full max-w-md mx-4 overflow-hidden relative"
            style={{
              animation: "popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              border: "1px solid rgba(0,0,0,0.04)",
              boxShadow: "0 40px 80px -20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.02)"
            }}
          >
            {/* Header Redesigned */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 bg-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center border border-red-100">
                  <Filter className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-800 tracking-tight">Filtro por Período</h2>
                  <p className="text-[11px] text-zinc-500 font-medium">Análise de tráfego e B.I.</p>
                </div>
              </div>
              <button onClick={() => setFilterOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 text-zinc-400 hover:text-zinc-600 transition-all z-10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 bg-white relative z-10">
              <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                Selecione um período para filtrar <strong>todas as abas</strong> do Live Chat, incluindo as métricas do B.I. e histórico do CRM.
              </p>

              <style>{`
                .glass-date-input::-webkit-calendar-picker-indicator {
                  background: transparent;
                  bottom: 0;
                  color: transparent;
                  cursor: pointer;
                  height: auto;
                  left: 0;
                  position: absolute;
                  right: 0;
                  top: 0;
                  width: auto;
                }
              `}</style>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                    Data Inicial
                  </label>
                  <div className="relative group flex items-center bg-zinc-50 border border-zinc-200 rounded-xl hover:border-red-300 hover:shadow-sm transition-all focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 overflow-hidden">
                    <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none group-focus-within:text-red-500 transition-colors" />
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      max={dateTo || new Date().toISOString().split("T")[0]}
                      className="glass-date-input w-full pl-10 pr-3 py-2.5 text-sm font-semibold focus:outline-none bg-transparent text-zinc-700 cursor-pointer"
                      style={{ colorScheme: "light" }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                    Data Final
                  </label>
                  <div className="relative group flex items-center bg-zinc-50 border border-zinc-200 rounded-xl hover:border-red-300 hover:shadow-sm transition-all focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 overflow-hidden">
                    <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none group-focus-within:text-red-500 transition-colors" />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      min={dateFrom || undefined}
                      max={new Date().toISOString().split("T")[0]}
                      className="glass-date-input w-full pl-10 pr-3 py-2.5 text-sm font-semibold focus:outline-none bg-transparent text-zinc-700 cursor-pointer"
                      style={{ colorScheme: "light" }}
                    />
                  </div>
                </div>
              </div>

              {dateFilterActive && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50/50 border border-red-100/50 animate-pop-in">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-red-100 shrink-0">
                    <Calendar className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">Filtro Ativo</p>
                    <p className="text-xs font-bold text-red-700 truncate">
                      {dateFrom ? new Date(dateFrom + "T00:00:00").toLocaleDateString("pt-BR") : 'Início'}
                      <span className="text-red-400 mx-1.5 font-normal">→</span>
                      {dateTo ? new Date(dateTo + "T00:00:00").toLocaleDateString("pt-BR") : 'Hoje'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {dateFilterActive && (
                  <button
                    onClick={() => { setDateFilterActive(false); setDateFrom(""); setDateTo(""); setFilterOpen(false); }}
                    className="flex-1 py-3 rounded-xl text-xs font-bold border-2 border-zinc-100 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Limpar
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!dateFrom && !dateTo) { toast({ description: "Selecione pelo menos uma data.", variant: "destructive" }); return; }
                    setDateFilterActive(true);
                    setFilterOpen(false);
                    const fromStr = dateFrom ? new Date(dateFrom + "T00:00:00").toLocaleDateString("pt-BR") : 'início';
                    const toStr = dateTo ? new Date(dateTo + "T00:00:00").toLocaleDateString("pt-BR") : 'hoje';
                    toast({ title: "📅 Filtro aplicado", description: `Período: ${fromStr} → ${toStr}` });
                  }}
                  className="flex-1 py-3 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
                >
                  <Filter className="w-4 h-4" /> Aplicar Filtro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ SETTINGS MODAL ══════════════ */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}
        >
          <div
            className="rounded-2xl shadow-2xl w-full mx-4 overflow-hidden flex flex-col"
            style={{
              maxWidth: 860,
              maxHeight: "92vh",
              animation: "popIn 0.25s cubic-bezier(.22,1,.36,1)",
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-7 py-5 flex-shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #dc2626, #7f1d1d)", boxShadow: "0 4px 14px rgba(220,38,38,0.4)" }}
                >
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Configurações do Live Chat</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Gerencie operadores e regras de distribuição por funil</p>
                </div>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar: Funnels */}
              <div
                className="w-56 flex-shrink-0 flex flex-col gap-1 p-4"
                style={{ borderRight: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
              >
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-3 mb-3">Funis</p>
                {([
                  { key: "pos_venda" as const, label: "Pós Venda", icon: "🎫", accent: "#8b5cf6" },
                  { key: "maquinas" as const, label: "Máquinas", icon: "🏭", accent: "#ea580c" },
                  { key: "pecas" as const, label: "Peças", icon: "⚙️", accent: "#f59e0b" },
                ]).map((f) => {
                  const isActive = activeFunnel === f.key;
                  const opCount = liveSettings.funnels[f.key].operators.length;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setActiveFunnel(f.key)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all w-full"
                      style={isActive ? {
                        background: `linear-gradient(135deg, ${f.accent}22, ${f.accent}11)`,
                        border: `1px solid ${f.accent}44`,
                      } : {
                        background: "transparent",
                        border: "1px solid transparent",
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: isActive ? f.accent : "rgba(255,255,255,0.05)" }}
                      >
                        {f.icon}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold leading-tight ${isActive ? "text-white" : "text-slate-400"}`}>
                          {f.label}
                        </p>
                        <p className="text-[9px] text-slate-600 mt-0.5">
                          {opCount} operador{opCount !== 1 ? "es" : ""}
                        </p>
                      </div>
                      {isActive && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: f.accent }} />
                      )}
                    </button>
                  );
                })}

                <div className="flex-1" />

                {/* Status note — só aparece se Peças realmente não tiver operadores configurados */}
                {liveSettings.funnels.pecas.operators.length === 0 ? (
                  <div
                    className="p-3 rounded-xl text-[9px] leading-relaxed"
                    style={{ background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.15)", color: "#fb923c" }}
                  >
                    <strong>Peças</strong> aguarda habilitação.<br />
                    <span style={{ color: "#6ee7b7" }}><strong>Pós Venda</strong> e <strong>Máquinas</strong></span> estão operacionais.
                  </div>
                ) : (
                  <div
                    className="p-3 rounded-xl text-[9px] leading-relaxed"
                    style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", color: "#4ade80" }}
                  >
                    <strong>Pós Venda</strong>, <strong>Máquinas</strong> e <strong>Peças</strong> estão operacionais.
                  </div>
                )}
              </div>

              {/* Main Config Area */}
              <div className="flex-1 overflow-y-auto p-7">
                {([
                  { key: "pos_venda" as const, label: "Pós Venda", icon: "🎫", color: "#8b5cf6", active: liveSettings.funnels.pos_venda.operators.length > 0 },
                  { key: "maquinas" as const, label: "Máquinas", icon: "🏭", color: "#ea580c", active: liveSettings.funnels.maquinas.operators.length > 0 },
                  { key: "pecas" as const, label: "Peças", icon: "⚙️", color: "#f59e0b", active: liveSettings.funnels.pecas.operators.length > 0 },
                ]).filter(f => f.key === activeFunnel).map((f) => {
                  const cfg = liveSettings.funnels[f.key];

                  const updateFunnel = (patch: Partial<FunnelConfig>) => {
                    const next: LiveChatSettings = {
                      ...liveSettings,
                      funnels: {
                        ...liveSettings.funnels,
                        [f.key]: { ...cfg, ...patch },
                      },
                    };
                    setLiveSettings(next);
                    saveSettings(next);
                  };

                  const addOperator = () => {
                    const name = newOperatorName.trim();
                    if (!name) return;
                    if (cfg.operators.some(o => o.name === name)) return;
                    const rdUser = rdUsers.find(u => u.name === name);
                    const newOp: FunnelOperator = { id: rdUser?.id ?? `op-${Date.now()}`, name };
                    updateFunnel({ operators: [...cfg.operators, newOp] });
                    setNewOperatorName("");
                  };

                  const removeOperator = (id: string) => {
                    updateFunnel({ operators: cfg.operators.filter(o => o.id !== id) });
                  };

                  return (
                    <div key={f.key} className="space-y-6">
                      {/* Funnel header */}
                      <div className="flex items-center gap-4 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${f.color}, ${f.color}99)`, boxShadow: `0 6px 20px ${f.color}44` }}
                        >
                          {f.icon}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">{f.label}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[9px] font-bold"
                              style={f.active
                                ? { background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }
                                : { background: "rgba(255,255,255,0.05)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }
                              }
                            >
                              {f.active ? "● Ativo" : "○ Aguardando"}
                            </span>
                            <span className="text-[9px] text-slate-500">
                              {cfg.operators.length} operador{cfg.operators.length !== 1 ? "es" : ""} cadastrado{cfg.operators.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Modo de atendimento */}
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Modo de Atendimento</label>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Operador Único */}
                          <button
                            onClick={() => updateFunnel({ mode: "single" })}
                            className="flex flex-col items-center gap-2 py-4 px-3 rounded-xl transition-all text-left"
                            style={cfg.mode === "single" ? {
                              background: "rgba(139,92,246,0.12)",
                              border: "2px solid rgba(139,92,246,0.5)",
                            } : {
                              background: "rgba(255,255,255,0.03)",
                              border: "2px solid rgba(255,255,255,0.07)",
                            }}
                          >
                            <UserCheck className={`w-6 h-6 ${cfg.mode === "single" ? "text-violet-400" : "text-slate-600"}`} />
                            <div className="text-center">
                              <p className={`text-xs font-bold ${cfg.mode === "single" ? "text-violet-300" : "text-slate-500"}`}>Operador Único</p>
                              <p className="text-[9px] text-slate-600 mt-0.5 leading-tight">Sempre o mesmo atendente recebe os chats</p>
                            </div>
                          </button>
                          {/* Rodízio */}
                          <button
                            onClick={() => updateFunnel({ mode: "rotation" })}
                            className="flex flex-col items-center gap-2 py-4 px-3 rounded-xl transition-all text-left"
                            style={cfg.mode === "rotation" ? {
                              background: "rgba(234,88,12,0.12)",
                              border: "2px solid rgba(234,88,12,0.5)",
                            } : {
                              background: "rgba(255,255,255,0.03)",
                              border: "2px solid rgba(255,255,255,0.07)",
                            }}
                          >
                            <RotateCcw className={`w-6 h-6 ${cfg.mode === "rotation" ? "text-orange-400" : "text-slate-600"}`} />
                            <div className="text-center">
                              <p className={`text-xs font-bold ${cfg.mode === "rotation" ? "text-orange-300" : "text-slate-500"}`}>Rodízio</p>
                              <p className="text-[9px] text-slate-600 mt-0.5 leading-tight">Distribui chats em rotação entre os atendentes</p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Operadores */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-500" />
                            Operadores
                          </label>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
                          >
                            {cfg.operators.length} cadastrado{cfg.operators.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {cfg.operators.length === 0 ? (
                          <div
                            className="flex flex-col items-center justify-center py-8 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
                          >
                            <UserCheck className="w-10 h-10 text-slate-700 mb-2" />
                            <p className="text-xs text-slate-600 text-center">Nenhum operador cadastrado.<br />Adicione um abaixo.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {cfg.operators.map((op, idx) => (
                              <div
                                key={op.id}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                              >
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ background: `linear-gradient(135deg, hsl(${(idx * 67) % 360},65%,45%), hsl(${(idx * 67 + 30) % 360},65%,35%))` }}
                                >
                                  {op.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="flex-1 text-sm font-semibold text-slate-200">{op.name}</span>
                                {cfg.mode === "rotation" && (
                                  <span
                                    className="text-[9px] px-2.5 py-1 rounded-full font-bold"
                                    style={cfg.currentIndex % cfg.operators.length === idx
                                      ? { background: "rgba(234,88,12,0.2)", color: "#fb923c", border: "1px solid rgba(234,88,12,0.3)" }
                                      : { background: "rgba(255,255,255,0.05)", color: "#64748b" }
                                    }
                                  >
                                    {cfg.currentIndex % cfg.operators.length === idx ? "Próximo" : `${idx + 1}º`}
                                  </span>
                                )}
                                <button
                                  onClick={() => removeOperator(op.id)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                                  style={{ background: "transparent" }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Adicionar operador */}
                        <div className="mt-3">
                          {rdUsersLoading ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                              <div className="w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />
                              Buscando usuários do RD CRM...
                            </div>
                          ) : rdUsers.length > 0 ? (
                            <div className="flex gap-2">
                              <select
                                value={newOperatorName}
                                onChange={(e) => setNewOperatorName(e.target.value)}
                                className="flex-1 px-3 py-2.5 text-sm rounded-xl transition-all"
                                style={{
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  color: "#cbd5e1",
                                  outline: "none",
                                }}
                              >
                                <option value="" style={{ background: "#1e293b" }}>Selecionar operador RD CRM...</option>
                                {rdUsers
                                  .filter(u => !cfg.operators.some(op => op.id === u.id || op.name === u.name))
                                  .map(u => (
                                    <option key={u.id} value={u.name} style={{ background: "#1e293b" }}>
                                      {u.name}{u.email ? ` — ${u.email}` : ''}
                                    </option>
                                  ))}
                              </select>
                              <button
                                onClick={addOperator}
                                disabled={!newOperatorName.trim()}
                                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 flex items-center gap-1.5 flex-shrink-0"
                                style={{ background: "linear-gradient(135deg, #dc2626, #7f1d1d)" }}
                              >
                                <Plus className="w-3.5 h-3.5" /> Adicionar
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[10px] text-slate-600">
                                RD CRM não configurado. Adicione manualmente:
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newOperatorName}
                                  onChange={(e) => setNewOperatorName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") addOperator(); }}
                                  placeholder="Nome do operador..."
                                  className="flex-1 px-3 py-2.5 text-sm rounded-xl transition-all"
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    color: "#cbd5e1",
                                    outline: "none",
                                  }}
                                />
                                <button
                                  onClick={addOperator}
                                  disabled={!newOperatorName.trim()}
                                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 flex items-center gap-1.5"
                                  style={{ background: "linear-gradient(135deg, #dc2626, #7f1d1d)" }}
                                >
                                  <Plus className="w-3.5 h-3.5" /> Adicionar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status cards */}
                      {cfg.mode === "rotation" && cfg.operators.length > 0 && (
                        <div
                          className="flex items-start gap-3 p-4 rounded-xl"
                          style={{ background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.2)" }}
                        >
                          <RotateCcw className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-orange-300 mb-0.5">Rodízio ativo</p>
                            <p className="text-[10px] text-orange-400/70 leading-relaxed">
                              Distribuição sequencial entre {cfg.operators.length} operador{cfg.operators.length !== 1 ? "es" : ""}.
                              Próximo: <strong className="text-orange-300">{cfg.operators[cfg.currentIndex % cfg.operators.length]?.name}</strong>
                            </p>
                          </div>
                        </div>
                      )}

                      {cfg.mode === "single" && cfg.operators.length > 1 && (
                        <div
                          className="flex items-start gap-3 p-4 rounded-xl"
                          style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
                        >
                          <UserCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-blue-400/80 leading-relaxed">
                            <strong className="text-blue-300">Dica:</strong> No modo Operador Único, apenas o primeiro da lista recebe chats. Ative o Rodízio para distribuir automaticamente.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div
              className="px-7 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <p className="text-[10px] text-slate-600">Sincronizado automaticamente com o servidor.</p>
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #dc2626, #7f1d1d)" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Resultado do Sync Manual com CRM ──────────────────────── */}
      {crmSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (crmSyncState !== 'loading') { setCrmSyncModalOpen(false); setCrmSyncState('idle'); } }}>
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4"
            style={{ animation: 'slideInUp .22s cubic-bezier(.4,0,.2,1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                crmSyncState === 'loading' ? 'bg-purple-50' :
                crmSyncState === 'success' ? 'bg-green-50' : 'bg-red-50'
              }`}>
                {crmSyncState === 'loading' ? (
                  <span className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin block" />
                ) : crmSyncState === 'success' ? '✅' : '❌'}
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-800">
                  {crmSyncState === 'loading' ? 'Criando card no CRM...' :
                   crmSyncState === 'success' ? 'Card criado com sucesso!' :
                   'Erro ao criar card'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {crmSyncState === 'loading' ? 'Aguarde, gerando relatório e sincronizando...' :
                   crmSyncResult?.funil ? `Funil: ${crmSyncResult.funil}` : ''}
                </p>
              </div>
            </div>

            {/* Deal ID */}
            {crmSyncResult?.dealId && (
              <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                <span className="text-green-600 text-lg">🎯</span>
                <div>
                  <p className="text-xs font-semibold text-green-700">Deal ID no RD CRM</p>
                  <p className="text-sm font-mono text-green-800">{crmSyncResult.dealId}</p>
                </div>
              </div>
            )}

            {/* Steps */}
            {crmSyncResult?.steps && crmSyncResult.steps.length > 0 && (
              <div className="space-y-2 mb-4">
                {crmSyncResult.steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 text-base leading-none">
                      {s.status === 'ok' ? '✅' : s.status === 'skip' ? '⏭️' : '❌'}
                    </span>
                    <div>
                      <span className="font-medium text-zinc-700">{s.step}</span>
                      {s.detail && <span className="text-xs text-zinc-400 ml-1.5">— {s.detail}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error message */}
            {crmSyncState === 'error' && crmSyncResult?.message && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-700">{crmSyncResult.message}</p>
              </div>
            )}

            {/* Loading steps placeholder */}
            {crmSyncState === 'loading' && (
              <div className="space-y-2 mb-4">
                {['Carregando visitante', 'Carregando histórico', 'Detectando funil', 'Gerando relatório com IA', 'Criando card no CRM'].map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-zinc-400">
                    <span className="w-4 h-4 rounded-full border-2 border-zinc-200 border-t-purple-400 animate-spin shrink-0" style={{ animationDelay: `${i * 150}ms` }} />
                    {s}
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            {crmSyncState !== 'loading' && (
              <div className="flex flex-col gap-2 mt-2">
                {/* Botão Abrir no RD Station — aparece somente no sucesso */}
                {crmSyncState === 'success' && crmSyncResult?.dealId && (
                  <a
                    href={`https://crm.rdstation.com/app/deals/${crmSyncResult.dealId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #0078cc, #0056b3)', color: 'white' }}
                  >
                    🔗 Abrir no RD Station
                  </a>
                )}
                <button
                  onClick={() => { setCrmSyncModalOpen(false); setCrmSyncState('idle'); }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: crmSyncState === 'success' ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #6d28d9, #7c3aed)',
                    color: 'white',
                  }}
                >
                  {crmSyncState === 'success' ? 'Fechar' : 'Fechar'}
                </button>
              </div>
            )}
          </div>
          <style>{`@keyframes slideInUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </div>
      )}
    </div>
  );
}


// ─── VSComparisonPanel — Jivos vs Fagner IA ───────────────────────────────────
function VSComparisonPanel() {
  // Busca dados reais do sistema
  const { data: containData } = useStatsData<{
    aiResolved: number; humanEscalated: number; totalChats: number; containmentRate: number;
  }>("/api/livechat/stats/containment?dateFrom=2000-01-01&dateTo=2099-01-01");

  const { data: activData } = useStatsData<{
    activationRate: number; totalActivated: number; totalSessions: number;
  }>("/api/livechat/stats/activation?dateFrom=2000-01-01&dateTo=2099-01-01");

  const containRate  = containData?.containmentRate  ?? 0;
  const totalChats   = containData?.totalChats        ?? 0;
  const aiResolved   = containData?.aiResolved        ?? 0;
  const humanEsc     = containData?.humanEscalated    ?? 0;
  const totalSess    = activData?.totalSessions       ?? 0;
  const totalActiv   = activData?.totalActivated      ?? 0;

  // Itens de comparação enriquecidos
  const metrics = [
    {
      icon: "🗑️",
      label: "Triagem & Ruído",
      context: "No Jivos, 79,8% das mensagens eram saudações rasas, capturas de contato sem contexto e respostas sem valor. Nenhum dado era aproveitado para o time de vendas.",
      jivosVal: "79,8%", jivosLabel: "das mensagens eram lixo",
      fagnerVal: "0%",   fagnerLabel: "de triagem manual",
      highlight: "#16a34a",
    },
    {
      icon: "⚡",
      label: "Tempo de Primeira Resposta",
      context: "O Jivos dependia de triagem humana. O cliente esperava entre 15 e 40 minutos. O Fagner IA responde em streaming em menos de 3 segundos, 24h/dia.",
      jivosVal: "~25min", jivosLabel: "tempo médio de espera",
      fagnerVal: "< 3s",  fagnerLabel: "resposta em streaming",
      highlight: "#d97706",
    },
    {
      icon: "🤖",
      label: "Autonomia da IA (Containment Rate)",
      context: `Com ${totalChats.toLocaleString("pt-BR")} chats analisados, o Fagner IA resolveu ${aiResolved.toLocaleString("pt-BR")} de forma autônoma. Apenas ${humanEsc} precisaram de intervenção humana. No Jivos, 99% dos chats demandavam um operador.`,
      jivosVal: "1%",           jivosLabel: "resolvido sem humano",
      fagnerVal: `${containRate}%`, fagnerLabel: "containment rate real",
      highlight: "#2563eb",
    },
    {
      icon: "📋",
      label: "Leads Capturados Automaticamente",
      context: `O Fagner IA coleta nome, telefone, CNPJ e produto de interesse de cada visitante sem depender de formulário. Dos ${totalSess.toLocaleString("pt-BR")} visitantes únicos, ${totalActiv.toLocaleString("pt-BR")} foram ativados para conversas qualificadas. No Jivos: 0 coletas automáticas.`,
      jivosVal: "0",        jivosLabel: "leads automáticos",
      fagnerVal: totalActiv > 0 ? totalActiv.toLocaleString("pt-BR") : "Auto", fagnerLabel: "leads com briefing completo",
      highlight: "#7c3aed",
    },
    {
      icon: "💼",
      label: "Cards de CRM Criados (RD Station)",
      context: "Cada lead qualificado pelo Fagner IA abre automaticamente uma oportunidade no RD Station CRM com nome, telefone, produto de interesse e funil correto. No Jivos: processo 100% manual, propenso a erros e esquecimentos.",
      jivosVal: "Manual", jivosLabel: "processo 100% humano",
      fagnerVal: "Auto",  fagnerLabel: "criados em tempo real",
      highlight: "#dc2626",
    },
    {
      icon: "🧠",
      label: "Dados Armazenados por Lead",
      context: "O Fagner IA registra scoring de compra (0–100), produto de interesse, sentimento, volume desejado, histórico de páginas visitadas e briefing gerado por IA. No Jivos: nenhum dado estruturado era salvo por visitante.",
      jivosVal: "Nenhum",  jivosLabel: "dado estruturado salvo",
      fagnerVal: "7 campos", fagnerLabel: "por visitante identificado",
      highlight: "#0891b2",
    },
  ];

  const kpis = [
    { icon: "🗑️", value: "−79,8%",         label: "Ruído Eliminado",      sub: `${(14405 * 0.798).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} mensagens inúteis eliminadas`,  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
    { icon: "⚡",  value: "< 3s",            label: "Resposta Instantânea", sub: "vs. 15–40 min no Jivos. Disponível 24h/dia, 7 dias/semana",                                           color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    { icon: "🤖", value: `${containRate}%`, label: "Autonomia Real (IA)",  sub: `${aiResolved.toLocaleString("pt-BR")} chats resolvidos sem nenhuma intervenção humana`,                color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  ];

  return (
    <div className="space-y-8 pb-10 px-1">

      {/* ── Banner Hero ── */}
      <div
        className="rounded-2xl overflow-hidden border border-red-100 shadow-sm"
        style={{ background: "linear-gradient(135deg,#fff5f5 0%,#fff 55%,#fef9f0 100%)", animationFillMode: "both" }}
      >
        <div className="px-7 py-6 flex items-center justify-between flex-wrap gap-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-black text-zinc-200 line-through decoration-red-400 decoration-2">JIVOS</span>
              <span className="bg-red-600 text-white text-sm font-black px-3 py-1 rounded-xl tracking-widest shadow-sm">VS</span>
              <span className="text-2xl font-black text-zinc-900">FAGNER IA</span>
            </div>
            <p className="text-sm text-zinc-500 max-w-lg leading-relaxed">
              Comparativo baseado em <strong className="text-zinc-700">14.405 mensagens reais</strong> analisadas do sistema Jivos + dados ao vivo do Fagner IA em produção.
            </p>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-xl font-black text-zinc-300 line-through">Jivos</div>
              <div className="text-[11px] text-zinc-400 mt-1 font-medium uppercase tracking-wide">Sistema anterior</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-px bg-zinc-300" />
              <div className="text-red-500 font-bold text-lg leading-none">→</div>
              <div className="text-[10px] text-zinc-400 font-medium">evolução</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-red-600">Fagner IA</div>
              <div className="text-[11px] text-zinc-400 mt-1 font-medium uppercase tracking-wide">Plataforma atual</div>
            </div>
          </div>
        </div>
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg,transparent,#dc2626 30%,#f97316 70%,transparent)" }} />
      </div>

      {/* ── 3 KPIs destaque ── */}
      <div className="grid grid-cols-3 gap-4">
        {kpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className="rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
            style={{ background: kpi.bg, borderColor: kpi.border, animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
          >
            <span className="text-2xl block mb-3">{kpi.icon}</span>
            <div className="text-3xl font-black mb-1 tabular-nums" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="text-sm font-bold text-zinc-700 mb-1">{kpi.label}</div>
            <div className="text-xs text-zinc-500 leading-relaxed">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Barras de progresso comparativo ── */}
      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1 w-5 rounded-full bg-red-500" />
          <h3 className="text-sm font-bold text-zinc-600 uppercase tracking-wide">Distribuição do Esforço de Atendimento</h3>
        </div>
        <div className="space-y-6">
          {[
            {
              label:    "Triagem & Ruído (tempo desperdiçado)",
              jivosW:   79.8, jivosLabel: "79,8% das msgs eram ruído",
              fagnerW:  0,    fagnerLabel: "Zerado — IA filtra tudo",
              fagnerColor: "#16a34a",
            },
            {
              label:    "Atendimento com Dado Real de Compra",
              jivosW:   15.5, jivosLabel: "15,5% tinham intenção real",
              fagnerW:  100,  fagnerLabel: "100% rastreado com scoring",
              fagnerColor: "#dc2626",
            },
            {
              label:    `Chats Resolvidos pela IA (${containRate}% containment)`,
              jivosW:   1,    jivosLabel: "1% — quase tudo era humano",
              fagnerW:  containRate, fagnerLabel: `${containRate}% autônomo`,
              fagnerColor: "#2563eb",
            },
          ].map((row, i) => (
            <div key={row.label} style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}>
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-semibold text-zinc-700">{row.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-zinc-400 mb-1.5 font-medium">Jivos (antes)</div>
                  <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-zinc-300 transition-all duration-700" style={{ width: `${row.jivosW}%` }} />
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">{row.jivosLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium mb-1.5" style={{ color: row.fagnerColor }}>Fagner IA (agora)</div>
                  <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${row.fagnerW}%`, background: row.fagnerColor, boxShadow: `0 0 6px ${row.fagnerColor}50` }} />
                  </div>
                  <div className="text-[11px] mt-1 font-semibold" style={{ color: row.fagnerColor }}>{row.fagnerLabel}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Métricas detalhadas com contexto ── */}
      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-50 flex items-center gap-2">
          <div className="h-1 w-5 rounded-full bg-red-500" />
          <h3 className="text-sm font-bold text-zinc-600 uppercase tracking-wide">Análise Detalhada — Indicador por Indicador</h3>
        </div>
        <div className="divide-y divide-zinc-50">
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className="px-6 py-5 hover:bg-zinc-50/60 transition-all duration-200 group"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            >
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-start">
                {/* Ícone */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow-sm border border-zinc-100 bg-white group-hover:scale-110 transition-transform duration-200">
                  {m.icon}
                </div>
                {/* Label + contexto */}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-zinc-800 mb-1">{m.label}</div>
                  <div className="text-xs text-zinc-500 leading-relaxed">{m.context}</div>
                </div>
                {/* Jivos */}
                <div className="text-right min-w-[100px]">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Jivos</div>
                  <div className="text-base font-black text-zinc-300 line-through decoration-red-300 tabular-nums">{m.jivosVal}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">{m.jivosLabel}</div>
                </div>
                {/* Fagner */}
                <div className="text-right min-w-[120px]">
                  <div className="flex items-center justify-end gap-1 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${m.highlight}15`, color: m.highlight, border: `1px solid ${m.highlight}30` }}>✓ Melhor</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: m.highlight }}>Fagner IA</span>
                  </div>
                  <div className="text-base font-black tabular-nums" style={{ color: m.highlight }}>{m.fagnerVal}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: `${m.highlight}99` }}>{m.fagnerLabel}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Rodapé com estatísticas ao vivo ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-100 bg-gradient-to-br from-zinc-50 to-white p-5 shadow-sm">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3">📊 Volume Analisado — Jivos (Histórico)</div>
          <div className="space-y-2">
            {[
              { label: "Total de mensagens",      val: "14.405",  pct: "", color: "#a855f7" },
              { label: "Triagem & Ruído",         val: "11.508",  pct: "79,8%", color: "#a855f7" },
              { label: "Interesse Real de Compra",val: "2.237",   pct: "15,5%", color: "#f59e0b" },
              { label: "Comercial / Venda",       val: "668",     pct: "4,6%",  color: "#3b82f6" },
              { label: "Suporte Pós-Venda",       val: "454",     pct: "3,1%",  color: "#ef4444" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                  <span className="text-zinc-600">{r.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.pct && <span className="text-zinc-400">{r.pct}</span>}
                  <span className="font-bold text-zinc-700 tabular-nums">{r.val}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50/50 to-white p-5 shadow-sm">
          <div className="text-xs font-bold text-red-400 uppercase tracking-wide mb-3">🤖 Dados Reais — Fagner IA (Produção)</div>
          <div className="space-y-2">
            {[
              { label: "Visitantes únicos rastreados", val: totalSess > 0 ? totalSess.toLocaleString("pt-BR") : "—",    color: "#2563eb" },
              { label: "Chats qualificados ativados",  val: totalActiv > 0 ? totalActiv.toLocaleString("pt-BR") : "—",  color: "#dc2626" },
              { label: "Resolvidos pela IA (autônomo)",val: aiResolved > 0 ? aiResolved.toLocaleString("pt-BR") : "—",  color: "#16a34a" },
              { label: "Escalados para humano",        val: humanEsc > 0 ? humanEsc.toLocaleString("pt-BR") : "—",      color: "#d97706" },
              { label: "Containment rate",             val: `${containRate}%`,                                           color: "#2563eb" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                  <span className="text-zinc-600">{r.label}</span>
                </div>
                <span className="font-bold tabular-nums" style={{ color: r.color }}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Nota fonte ── */}
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-5 py-4 flex items-start gap-3">
        <span className="text-base flex-shrink-0 mt-0.5">📌</span>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Dados do Jivos extraídos da <strong className="text-zinc-600">Análise de Inteligência Operacional V4</strong> — 14.405 mensagens B2B consolidadas.
          Dados do Fagner IA coletados em <strong className="text-zinc-600">tempo real da produção</strong> via API do sistema.
          Containment rate e sessões atualizados automaticamente conforme novos atendimentos são realizados.
        </p>
      </div>
    </div>
  );
}

const PERIODS = [
  { label: "7 dias",  value: "7d"  },
  { label: "14 dias", value: "14d" },
  { label: "30 dias", value: "30d" },
  { label: "Todos",   value: "all" },
];

function StatsTab({ dateFilterActive, customFrom, customTo }: { dateFilterActive?: boolean; customFrom?: string; customTo?: string }) {
  const [period, setPeriod] = useState("14d");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [vsMode, setVsMode] = useState(false);

  const effectivePeriod = dateFilterActive 
    ? (customFrom && customTo ? `custom|${customFrom}|${customTo}` : "all")
    : period;

  return (
    <div className="h-full overflow-y-auto animate-tab-enter">
      <div className="flex items-center justify-between mb-8 px-1">
        <div>
          <h2 className="text-lg font-bold text-zinc-800">Estatísticas do Site</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Fagner Site — Monitoramento em Tempo Real</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white text-zinc-700 border border-zinc-200 shadow-sm transition-all hover:bg-zinc-50 active:scale-95"
          >
            <FileText className="w-4 h-4 text-zinc-500" />
            Exportar Relatórios
          </button>
          <div className="w-px h-6 bg-zinc-200" />
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  period === p.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-zinc-200" />
          <button
            onClick={() => setVsMode(!vsMode)}
            title="Comparativo: Jivos vs Fagner IA"
            className={`px-3 py-2 rounded-lg text-xs font-black tracking-widest transition-all duration-300 border ${
              vsMode
                ? "bg-red-600 text-white border-red-500 shadow-lg scale-105"
                : "bg-white text-zinc-400 border-zinc-200 hover:border-red-300 hover:text-red-500"
            }`}
          >
            VS
          </button>
        </div>
      </div>

      <ReportExportModal open={reportModalOpen} onClose={() => setReportModalOpen(false)} />

      {vsMode ? (
        <VSComparisonPanel />
      ) : (
        <div className="space-y-10 pb-8 px-1">
          <section>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-1 w-6 rounded-full bg-primary" />
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Saúde da Plataforma</h3>
            </div>
            <div className="space-y-6">
              <ActivationRateCard  period={effectivePeriod} delay={0}   />
              <ContainmentRateCard period={effectivePeriod} delay={100} />
              <LatencyCard         period={effectivePeriod} delay={200} />
            </div>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-1 w-6 rounded-full" style={{ background: "hsl(var(--chart-purple))" }} />
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Conversão &amp; Leads</h3>
            </div>
            <div className="space-y-6">
              <FunnelCard      period={effectivePeriod} delay={0}   />
              <LeadScoringCard period={effectivePeriod} delay={100} />
              <PreChatPagesCard               delay={200} />
            </div>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-1 w-6 rounded-full" style={{ background: "hsl(var(--chart-green))" }} />
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Comportamento &amp; Retenção</h3>
            </div>
            <div className="space-y-6">
              <UnhandledIntentsCard delay={0}   />
              <RetentionCohortCard  delay={100} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default LiveChat;
