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
} from "lucide-react";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Visitor {
  id: string;
  cookieId: string;
  ip?: string;
  city?: string;
  country?: string;
  browser?: string;
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
  isOnline: string;
  pipelineStage: string;
  firstSeenAt: string;
  lastSeenAt: string;
  name?: string;
  notes?: { date: string; stage: string; content: string }[];
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
}

interface Stats {
  onlineVisitors: number;
  activeChats: number;
  needsHuman: number;
  totalChatsToday: number;
  totalVisitorsToday: number;
}

interface Pageview {
  id: string;
  visitorId: string;
  url: string;
  pageTitle?: string;
  visitedAt: string;
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

function renderMessageContent(text: string) {
  if (!text) return null;
  const anexoRegex = /\[Anexo_Cliente:\s*(.+?)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = anexoRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={lastIndex}>{formatTextWithLinks(text.substring(lastIndex, match.index))}</span>);
    }
    const url = match[1];
    const isImage = /\.(jpeg|jpg|gif|png|webp|svg|heic)$/i.test(url) || url.startsWith('data:image/');
    
    if (isImage) {
      parts.push(
        <div key={`anexo-${match.index}`} className="mt-2 mb-2 max-w-[280px] rounded-lg overflow-hidden border border-zinc-200 shadow-sm bg-white">
          <a href={url} target="_blank" rel="noopener noreferrer" className="block p-1">
             <img src={url} alt="Anexo do Cliente" className="w-full h-auto max-h-[220px] object-scale-down rounded hover:opacity-90 transition-opacity" />
          </a>
        </div>
      );
    } else {
      parts.push(
        <div key={`anexo-${match.index}`} className="block">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 mb-2 px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg text-xs font-semibold hover:bg-zinc-200 border border-zinc-200 shadow-sm transition-all hover:-translate-y-0.5">
            📎 Abrir Anexo (PDF/Outros)
          </a>
        </div>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(<span key={lastIndex}>{formatTextWithLinks(text.substring(lastIndex))}</span>);
  }
  return parts;
}

function scoreColor(score: number): string {
  if (score >= 70) return "from-red-500 to-orange-500";
  if (score >= 40) return "from-yellow-500 to-amber-500";
  return "from-emerald-500 to-teal-500";
}

// ——— Main Component —————————————————————————————————————————————————

function LiveChat() {
  const [activeTab, setActiveTab] = useState<"chats" | "visitors" | "crm" | "arquivados" | "atencao" | "stats">("chats");
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [allVisitors, setAllVisitors] = useState<Visitor[]>([]);
  const [pipelineData, setPipelineData] = useState<Record<string, Visitor[]>>({});
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionReason, setAttentionReason] = useState("Falta de informação");
  const [attentionObs, setAttentionObs] = useState("");
  const [visitorChats, setVisitorChats] = useState<Chat[]>([]);
  const [pastNegotiations, setPastNegotiations] = useState<any[]>([]);
  const [historyModal, setHistoryModal] = useState<{ visitor: Visitor; pageviews: Pageview[] } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const openHistoryModal = async (v: Visitor) => {
    try {
      const res = await fetch(`/api/livechat/visitors/${v.id}/pageviews`, { credentials: "include" });
      const pageviews: Pageview[] = res.ok ? await res.json() : [];
      setHistoryModal({ visitor: v, pageviews: pageviews.reverse() });
    } catch {
      setHistoryModal({ visitor: v, pageviews: [] });
    }
  };

  // ——— Fetch initial data —————————————————————————————————————————————————
  const fetchData = useCallback(async () => {
    try {
      const [chatsRes, statsRes, allVisitorsRes, pipelineRes] = await Promise.all([
        fetch("/api/livechat/chats", { credentials: "include" }),
        fetch("/api/livechat/stats", { credentials: "include" }),
        fetch("/api/livechat/visitors/all?limit=200", { credentials: "include" }),
        fetch("/api/livechat/pipeline", { credentials: "include" }),
      ]);
      if (chatsRes.ok) setChats(await chatsRes.json());
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

    ws.onmessage = (event) => {
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
                const newPv = {
                   id: `live-${Date.now()}`,
                   visitorId: data.visitorId,
                   url: data.url,
                   pageTitle: data.pageTitle || data.url,
                   visitedAt: new Date().toISOString()
                };
                return { ...prev, pageviews: [newPv, ...prev.pageviews] };
              }
              return prev;
            });
            setVisitors((prev) => prev.map((v) =>
              v.id === data.visitorId ? { ...v, currentPage: data.url, currentPageTitle: data.pageTitle } : v
            ));
            break;
          case "NEW_CHAT":
            setChats((prev) => [data.chat, ...prev]);
            if (data.proactive) {
              toast({ title: "Abordagem Proativa", description: "Fagner abordou um visitante automaticamente!" });
            }
            break;
          case "CHAT_MESSAGE":
            if (selectedChat?.id === data.chatId) {
              setChatMessages((prev) => [...prev, {
                id: Date.now().toString(),
                chatId: data.chatId,
                sender: data.sender,
                content: data.content,
                read: "false",
                sentAt: data.timestamp,
              }]);
            }
            break;
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
    try {
      const res = await fetch(`/api/livechat/chats/${chat.id}/messages`, { credentials: "include" });
      if (res.ok) setChatMessages(await res.json());
    } catch {}
  };

  // ——— Agent send message (human takeover) —————————————————————————————————
  const handleAgentSend = () => {
    if (!agentInput.trim() || !selectedChat || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "AGENT_MESSAGE",
      chatId: selectedChat.id,
      userId: "admin",
      content: agentInput.trim(),
    }));
    setChatMessages((prev) => [...prev, {
      id: Date.now().toString(),
      chatId: selectedChat.id,
      sender: "agent",
      content: agentInput.trim(),
      read: "true",
      sentAt: new Date().toISOString(),
    }]);
    setAgentInput("");
  };

  // ——— Take over chat —————————————————————————————————————————————————
  const handleTakeOver = async (chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "TAKE_OVER", chatId, userId: "admin" }));
    }
    try {
      await fetch(`/api/livechat/chats/${chatId}/take-over`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "admin" }),
      });
    } catch {}
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, status: "human_active" } : c));
    toast({ title: "Chat assumido", description: "Você agora está respondendo este chat." });
  };
  // ——— Return chat to AI (Fagner) —————————————————————————————————————
  const handleReturnToAI = (chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "RETURN_TO_AI", chatId }));
    }
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, status: "ai_active", agentId: undefined } : c));
    toast({ title: "Fagner reativado", description: "O Fagner voltará a responder quando o cliente mandar mensagem." });
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
  const activeChats = chats.filter((c) => c.status !== "closed");
  const archivedChats = chats.filter((c) => c.status === "closed");
  // Atenção: apenas chats explicitamente marcados pelo admin (needsHuman === "attention")
  const attentionChats = chats.filter((c) => c.needsHuman === "attention");
  const needsHumanChats = chats.filter((c) => c.needsHuman === "true" && c.status !== "closed");

  // ——— TABS —————————————————————————————————————————————————
  const mainTabs = [
    { id: "chats" as const, label: "Chats", icon: MessageCircle, count: activeChats.length },
    { id: "visitors" as const, label: "Visitantes", icon: Eye, count: visitors.length },
    { id: "crm" as const, label: "CRM", icon: Users, count: undefined as number | undefined },
  ];
  const secondaryTabs = [
    { id: "arquivados" as const, label: "Arquivados", icon: Layers, count: archivedChats.length },
    { id: "atencao" as const, label: "Atenção", icon: AlertTriangle, count: attentionChats.length },
    { id: "stats" as const, label: "Estatísticas", icon: BarChart3, count: undefined as number | undefined },
  ];
  const tabs = [...mainTabs, ...secondaryTabs];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(0 0% 97%) 0%, hsl(0 5% 95%) 100%)" }}>

      {/* ——— COMPACT HEADER ——— */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        {/* Row 1: Title + Stats + Refresh */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <MessageCircle className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 leading-tight">Live Chat</h1>
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
                { icon: Users, value: stats.totalVisitorsToday, label: "Visit.", color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
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

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="h-8 gap-1.5 text-xs border-zinc-200 hover:border-red-300 hover:bg-red-50/50 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </Button>
        </div>

        {/* Row 2: Tabs */}
        <div className="flex gap-1 bg-white/60 p-1 rounded-xl border border-zinc-200/60 shadow-sm backdrop-blur-sm">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
                  isActive ? "text-white shadow-md" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/60"
                }`}
                style={isActive ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" } : {}}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${
                    isActive ? "bg-white/25 text-white" : "bg-zinc-200/80 text-zinc-600"
                  }`}>{tab.count}</span>
                )}
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="w-px bg-zinc-200/60 mx-1 self-stretch rounded-full" />
          {secondaryTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
                  isActive ? "text-white shadow-md" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/60"
                }`}
                style={isActive ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" } : {}}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${
                    isActive ? "bg-white/25 text-white" : "bg-zinc-200/80 text-zinc-600"
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
          
          return (
          <div className="h-full flex gap-4 animate-tab-enter">
            {/* Chat list panel */}
            <div className="w-[320px] flex-shrink-0 flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-red-500" />
                  {currentTitle}
                </h3>
                <span className="text-[10px] text-zinc-400 font-medium">{currentList.length} itens</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {currentList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                    <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-xs">Nenhum chat listado</p>
                  </div>
                ) : (
                  currentList.map((chat) => {
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
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              isUrgent ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600"
                            }`}>
                              {(chat.visitorName || "V")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-800 leading-tight">
                                {chat.visitorName || "Visitante"}
                              </p>
                              <p className="text-[10px] text-zinc-400">
                                {chat.source === "proactive" ? "Proativo" : "Widget"} &bull; {timeAgo(chat.startedAt)}
                              </p>
                            </div>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${sb.bg} ${sb.color}`}>
                            {sb.icon} {sb.label}
                          </span>
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
                  })
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
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-600">
                        {(selectedChat.visitorName || "V")[0].toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-800">
                          {selectedChat.visitorName || "Visitante"}
                        </h3>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                          <span className={`${statusBadge(selectedChat.status).color}`}>
                            {statusBadge(selectedChat.status).icon} {statusBadge(selectedChat.status).label}
                          </span>
                          <span>&bull;</span>
                          <span>Iniciado {timeAgo(selectedChat.startedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 relative">
                      {/* Botões de ação: ocultos na aba Atenção e Arquivados */}
                      {activeTab !== "atencao" && activeTab !== "arquivados" && (
                        <>
                          {selectedChat.status === "ai_active" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTakeOver(selectedChat.id)}
                              className="h-8 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                            >
                              <User className="w-3 h-3" />
                              Assumir
                            </Button>
                          ) : selectedChat.status === "human_active" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturnToAI(selectedChat.id)}
                              className="h-8 text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                            >
                              <Bot className="w-3 h-3" />
                              Ativar Fagner
                            </Button>
                          ) : null}

                          {/* Botão Ver no CRM */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const v = allVisitors.find(x => x.id === selectedChat?.visitorId);
                              if (v) setSelectedVisitor(v);
                              setActiveTab("crm");
                            }}
                            className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
                          >
                            <Users className="w-3 h-3" />
                            Ver no CRM
                          </Button>

                          {/* Botão de Atenção */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAttentionOpen(!attentionOpen)}
                            className="h-8 text-xs gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 relative"
                          >
                            🚨 Atenção
                          </Button>

                          {/* Dropdown de Atenção manual */}
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
                                <Button size="sm" onClick={handleFlagAttention} className="bg-orange-500 hover:bg-orange-600">Salvar Flag</Button>
                              </div>
                            </div>
                          )}

                          <Button
                            size="sm"
                            onClick={() => handleCloseChat(selectedChat.id)}
                            className="h-8 text-xs"
                            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                          >
                            Encerrar
                          </Button>
                        </>
                      )}

                      {/* Badge somente leitura — aba Atenção */}
                      {activeTab === "atencao" && (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                          👁 Visualização — somente leitura
                        </span>
                      )}

                      {/* Badge somente leitura — aba Arquivados */}
                      {activeTab === "arquivados" && (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-50 text-zinc-500 border border-zinc-200">
                          🗄️ Conversa arquivada
                        </span>
                      )}
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
                    {chatMessages.map((msg) => {
                      const isVisitor = msg.sender === "visitor";
                      const isAI = msg.sender === "ai";

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
                              <span>&bull; {timeAgo(msg.sentAt)}</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-sm">{renderMessageContent(msg.content)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

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
                      <div className="flex gap-2">
                        <Textarea
                          value={agentInput}
                          onChange={(e) => setAgentInput(e.target.value)}
                          placeholder="Escreva sua mensagem..."
                          className="resize-none min-h-[44px] max-h-[100px] text-sm rounded-xl border-zinc-200 focus:border-red-300 focus:ring-red-200"
                          rows={1}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAgentSend(); }
                          }}
                        />
                        <Button
                          onClick={handleAgentSend}
                          className="self-end h-[44px] w-[44px] rounded-xl p-0"
                          style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
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
            {/* Header */}
            <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Visitantes Online
                <span className="text-zinc-400 font-normal">({visitors.filter(v => v.isOnline === "true").length})</span>
              </h3>
            </div>

            {/* Visitor cards list */}
            <div className="flex-1 overflow-y-auto p-4">
              {visitors.filter(v => v.isOnline === "true").length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                  <Eye className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">Nenhum visitante online</p>
                  <p className="text-[11px]">Os visitantes aparecerão aqui em tempo real</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visitors.filter(v => v.isOnline === "true").map((v, idx) => {
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

                        {/* Current page */}
                        {(v.currentPageTitle || v.currentPage) && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 mb-2 group-hover:bg-red-50/30 group-hover:border-red-100/50 transition-colors">
                            <ExternalLink className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                            <p className="text-[11px] text-zinc-600 truncate font-medium">
                              {v.currentPage && v.currentPage !== '/' && v.currentPage !== v.currentPageTitle 
                                ? v.currentPage 
                                : v.currentPageTitle || v.currentPage || "Página inativa"}
                            </p>
                          </div>
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
            </div>

            {/* Offline Visitors Section */}
            <div className="px-5 py-3 border-t border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50 shadow-inner">
              <h3 className="text-sm font-bold text-zinc-500 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-300" />
                Visitantes Offline
                <span className="text-zinc-400 font-normal">({visitors.filter(v => v.isOnline !== "true").length} recentes)</span>
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-zinc-50/30">
              {visitors.filter(v => v.isOnline !== "true").length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                  <User className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs font-medium">Nenhum visitante offline recente</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 opacity-80 hover:opacity-100 transition-opacity">
                  {visitors.filter(v => v.isOnline !== "true").map((v, idx) => {
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

                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 mb-2">
                          <ExternalLink className="w-3 h-3 text-zinc-300 flex-shrink-0" />
                          <p className="text-[11px] text-zinc-500 truncate font-medium" title={v.currentPage || ""}>
                            {displayUrl}
                          </p>
                        </div>

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
            </div>
          </div>
        )}

        {/* ——— MODAL: Histórico de Navegação do Visitante ——— */}
        {historyModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setHistoryModal(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-zinc-100 flex items-start justify-between"
                style={{ background: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)" }}>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {historyModal.visitor.name || "NÃO IDENTIFICADO"}
                  </h2>
                  <div className="flex items-center gap-3 text-[11px] text-white/70 mt-1">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {historyModal.visitor.city || "—"}{historyModal.visitor.country ? `, ${historyModal.visitor.country}` : ""}</span>
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {historyModal.visitor.browser}</span>
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {historyModal.visitor.totalVisits} visitas</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const crmV = allVisitors.find(x => x.id === historyModal.visitor.id);
                      if (crmV) setSelectedVisitor(crmV);
                      setHistoryModal(null);
                      setActiveTab("crm");
                    }}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    Ver no CRM →
                  </button>
                  <button onClick={() => setHistoryModal(null)}
                    className="w-7 h-7 rounded-lg bg-white/20 text-white hover:bg-white/30 flex items-center justify-center text-sm font-bold transition-colors">
                    ✕
                  </button>
                </div>
              </div>

              {/* Info row */}
              <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 flex gap-4 text-[11px]">
                <span className="text-zinc-500">Source: <strong className="text-zinc-700">{sourceLabel(historyModal.visitor.source).label}</strong></span>
                <span className="text-zinc-500">Páginas: <strong className="text-zinc-700">{historyModal.visitor.totalPages}</strong></span>
                <span className="text-zinc-500">Chats: <strong className="text-zinc-700">{historyModal.visitor.totalChats}</strong></span>
                <span className="text-zinc-500">Score: <strong className="text-zinc-700">{historyModal.visitor.engagementScore}</strong></span>
                <span className="text-zinc-500">Primeiro acesso: <strong className="text-zinc-700">{timeAgo(historyModal.visitor.firstSeenAt)}</strong></span>
              </div>

              {/* Pageview list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5" /> Histórico de Navegação
                </h3>
                {historyModal.pageviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <Globe className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">Nenhuma página registrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyModal.pageviews.map((pv, i) => (
                      <div key={pv.id} className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 hover:border-zinc-200 transition-colors bg-white">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-[10px] font-bold text-red-500">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-zinc-800 truncate">
                            {pv.pageTitle || pv.url}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate mt-0.5">{pv.url}</p>
                        </div>
                        <span className="text-[10px] text-zinc-300 flex-shrink-0 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {timeAgo(pv.visitedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ——— Tab: CRM Kanban ————————————————————————————————————————————————— */}
        {activeTab === "crm" && (
          <div className="h-full flex flex-col animate-tab-enter">
            {/* Kanban columns */}
            <div className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden pb-2">
              {[
                { stage: "novo_atendimento", label: "Novo Atendimento", color: "#22c55e", bgLight: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.3)" },
                { stage: "em_atendimento", label: "Em Atendimento", color: "#3b82f6", bgLight: "rgba(59,130,246,0.06)", borderColor: "rgba(59,130,246,0.3)" },
                { stage: "finalizado_com_venda", label: "Finalizou Com Venda", color: "#f59e0b", bgLight: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)" },
                { stage: "finalizado_sem_venda", label: "Finalizou Sem Venda", color: "#ef4444", bgLight: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.3)" },
                { stage: "sem_resposta", label: "Não Respondeu Mais", color: "#71717a", bgLight: "rgba(113,113,122,0.06)", borderColor: "rgba(113,113,122,0.3)" },
              ].map((col) => {
                const items = pipelineData[col.stage] || [];
                return (
                  <div
                    key={col.stage}
                    className="flex-1 min-w-[220px] max-w-[280px] flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden"
                  >
                    {/* Column header with color bar */}
                    <div className="flex-shrink-0">
                      <div className="h-1 w-full" style={{ background: col.color }} />
                      <div className="px-3 py-2.5 border-b border-zinc-100" style={{ background: col.bgLight }}>
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-bold text-zinc-700 leading-tight">{col.label}</h4>
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                            style={{ background: col.color }}
                          >
                            {items.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Scrollable card list */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
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
                              onClick={() => setSelectedVisitor(isSelected ? null : v)}
                              className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md group ${
                                isSelected
                                  ? "shadow-md"
                                  : "hover:border-zinc-200"
                              }`}
                              style={{
                                borderColor: isSelected ? col.borderColor : "rgba(228,228,231,0.6)",
                                background: isSelected ? col.bgLight : "white",
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
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
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

                    {/* Página atual */}
                    {selectedVisitor.currentPage && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-100">
                        <ExternalLink className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                        <span className="text-[10px] text-zinc-600 truncate">{selectedVisitor.currentPageTitle || selectedVisitor.currentPage}</span>
                      </div>
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

                  {/* Col 3: Notas da IA */}
                  <div className="flex-1 p-4 flex flex-col overflow-hidden bg-zinc-50/30">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                      {"\u{1F4DD}"} Notas da IA
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {selectedVisitor.notes && selectedVisitor.notes.length > 0 ? (
                        [...selectedVisitor.notes].reverse().map((n, i) => (
                          <div key={i} className="p-2.5 bg-white border border-zinc-200/70 rounded-xl shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-red-600">{n.stage}</span>
                              <span className="text-[9px] text-zinc-300">
                                {new Date(n.date).toLocaleDateString("pt-BR")} {new Date(n.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-600 leading-snug">{n.content}</p>
                          </div>
                        ))
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
        {activeTab === "stats" && <StatsTab />}
      </div>
    </div>
  );
}

// ─── StatsTab Component ─────────────────────────────────────────────────────────
function StatsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/livechat/enhanced-stats", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white rounded-2xl border border-zinc-200/60">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-400">Carregando estatísticas...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center bg-white rounded-2xl border border-zinc-200/60">
        <p className="text-sm text-zinc-400">Nenhum dado disponível ainda.</p>
      </div>
    );
  }

  const totalLeads = (data.hotLeads ?? 0) + (data.warmLeads ?? 0) + (data.coldLeads ?? 0);
  const leadTemp = totalLeads > 0 ? [
    { label: '🔥 Quentes', value: data.hotLeads, color: 'from-red-500 to-orange-500', pct: Math.round((data.hotLeads / totalLeads) * 100) },
    { label: '🌡️ Mornos',  value: data.warmLeads, color: 'from-yellow-400 to-amber-500', pct: Math.round((data.warmLeads / totalLeads) * 100) },
    { label: '🧊 Frios',   value: data.coldLeads, color: 'from-teal-400 to-emerald-500', pct: Math.round((data.coldLeads / totalLeads) * 100) },
  ] : [];

  const conversionRate = data.totalChats > 0 ? Math.round((data.closedWithSale / data.totalChats) * 100) : 0;
  const vtexRate = data.totalChats > 0 ? Math.round((data.vtexHits / data.totalChats) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto p-1 animate-tab-enter">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Card 1: Temperatura dos Leads */}
        <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-800">Temperatura dos Leads</h3>
              <p className="text-[10px] text-zinc-400">Baseado no [SCORE:xx] do Gemini</p>
            </div>
          </div>
          <div className="text-center mb-4">
            <p className="text-4xl font-black text-zinc-800">{data.avgEngagementScore}<span className="text-lg text-zinc-400">/100</span></p>
            <p className="text-[11px] text-zinc-400 mt-1">Engajamento médio geral</p>
          </div>
          {leadTemp.map(item => (
            <div key={item.label} className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-zinc-600 font-medium">{item.label}</span>
                <span className="text-zinc-400">{item.value} chats ({item.pct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${item.color} transition-all duration-700`} style={{ width: `${item.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Card 2: VTEX e Intenção Comercial */}
        <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1d4ed8,#60a5fa)' }}>
              <Search className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-800">Intenção Comercial</h3>
              <p className="text-[10px] text-zinc-400">Buscas de produto no catálogo VTEX</p>
            </div>
          </div>
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-center p-3 rounded-xl bg-blue-50 border border-blue-100">
              <span className="text-sm font-semibold text-blue-800">🛒 Chats com produto VTEX</span>
              <span className="text-xl font-black text-blue-700">{data.vtexHits}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-sm text-zinc-600">Taxa de intenção</span>
              <span className="text-sm font-bold text-zinc-800">{vtexRate}%</span>
            </div>
          </div>
          {data.topVtexProducts?.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Top produtos buscados</p>
              <div className="space-y-1.5">
                {data.topVtexProducts.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-600 truncate flex-1 mr-2">{p.name}</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{p.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Conversão e Ruído */}
        <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#059669,#34d399)' }}>
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-800">Conversão e Eficiência</h3>
              <p className="text-[10px] text-zinc-400">Resultados e filtro de ruído</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-sm font-semibold text-emerald-800">✅ Fecharam venda</span>
              <span className="text-xl font-black text-emerald-700">{data.closedWithSale}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-sm text-zinc-600">Taxa de conversão</span>
              <span className="text-sm font-bold text-zinc-800">{conversionRate}%</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-sm text-zinc-600">❌ Sem venda</span>
              <span className="text-sm font-bold text-zinc-800">{data.closedWithoutSale}</span>
            </div>
            <div className="h-px bg-zinc-100 my-2" />
            <div className="flex justify-between items-center p-3 rounded-xl bg-yellow-50 border border-yellow-100">
              <div>
                <span className="text-sm font-semibold text-yellow-800">🛡️ Ruídos filtrados</span>
                <p className="text-[9px] text-yellow-600">Respondidos sem consumir tokens Gemini</p>
              </div>
              <span className="text-xl font-black text-yellow-700">{data.noiseTotal}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-sm text-zinc-600">Total de chats</span>
              <span className="text-sm font-bold text-zinc-800">{data.totalChats}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default LiveChat;

