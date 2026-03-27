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
}

interface Chat {
  id: string;
  visitorId: string;
  agentId?: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  visitorName?: string;
  source: string;
  aiHandled: string;
  needsHuman: string;
  mood?: string;
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
    case "google_organic": return { label: "Google OrgÃ¢nico", icon: "ðŸ”" };
    case "google_ads": return { label: "Google Ads", icon: "ðŸ“¢" };
    case "instagram": return { label: "Instagram", icon: "ðŸ“¸" };
    case "facebook": return { label: "Facebook", icon: "ðŸ“˜" };
    case "youtube": return { label: "YouTube", icon: "â–¶ï¸" };
    case "direct": return { label: "Direto", icon: "ðŸ”—" };
    default: return { label: src ?? "Outro", icon: "ðŸŒ" };
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

function scoreColor(score: number): string {
  if (score >= 70) return "from-red-500 to-orange-500";
  if (score >= 40) return "from-yellow-500 to-amber-500";
  return "from-emerald-500 to-teal-500";
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // â”€â”€ Fetch initial data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ WebSocket connection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    fetchData();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/livechat`;
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
            setVisitors((prev) => prev.filter((v) => v.id !== data.visitorId));
            break;
          case "VISITOR_PAGE_UPDATE":
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
              title: "âš ï¸ Fagner precisa de ajuda!",
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
          const protocol2 = window.location.protocol === "https:" ? "wss:" : "ws:";
          const wsUrl2 = `${protocol2}//${window.location.host}/ws/livechat`;
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

  // â”€â”€ Load chat messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadChatMessages = async (chat: Chat) => {
    setSelectedChat(chat);
    try {
      const res = await fetch(`/api/livechat/chats/${chat.id}/messages`, { credentials: "include" });
      if (res.ok) setChatMessages(await res.json());
    } catch {}
  };

  // â”€â”€ Agent send message (human takeover) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Take over chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // ── Close chat ───────────────────────────────────────────────────────────
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

  // ── Attention Flag ───────────────────────────────────────────────────────
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

  // ─── Derived data ──────────────────────────────────────────────────────────
  const activeChats = chats.filter((c) => c.status !== "closed");
  const archivedChats = chats.filter((c) => c.status === "closed");
  // Atenção: apenas chats explicitamente marcados pelo admin (needsHuman === "attention")
  const attentionChats = chats.filter((c) => c.needsHuman === "attention");
  const needsHumanChats = chats.filter((c) => c.needsHuman === "true" && c.status !== "closed");

  // ─── TABS ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "chats" as const, label: "Chats", icon: MessageCircle, count: activeChats.length },
    { id: "visitors" as const, label: "Visitantes", icon: Eye, count: visitors.length },
    { id: "crm" as const, label: "CRM", icon: Users },
    { id: "arquivados" as const, label: "Arquivados", icon: Layers, count: archivedChats.length },
    { id: "atencao" as const, label: "Atenção 🚨", icon: AlertTriangle, count: attentionChats.length },
    { id: "stats" as const, label: "Estatísticas", icon: BarChart3 },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(0 0% 97%) 0%, hsl(0 5% 95%) 100%)" }}>

      {/* â•â•â• COMPACT HEADER â•â•â• */}
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
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? "text-white shadow-md"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/60"
                }`}
                style={isActive ? {
                  background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
                  boxShadow: "0 2px 8px rgba(220,38,38,0.3)",
                } : {}}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${
                    isActive ? "bg-white/25 text-white" : "bg-zinc-200/80 text-zinc-600"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* â•â•â• TAB CONTENT (flex-1, overflow-hidden) â•â•â• */}
      <div className="flex-1 overflow-hidden px-6 pb-5">

        {/* ─── Tabs: Chats, Arquivados, Atenção ──────────────────────────────── */}
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
                          {selectedChat.status === "ai_active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTakeOver(selectedChat.id)}
                              className="h-8 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                            >
                              <User className="w-3 h-3" />
                              Assumir
                            </Button>
                          )}

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
                            <p className="whitespace-pre-wrap">{msg.content}</p>
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
                          Conversa encerrada — histórico somente para leitura.
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

        {/* ─── Tab: Visitantes ──────────────────────────────────────────── */}
        {activeTab === "visitors" && (
          <div className="h-full flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden animate-tab-enter">
            {/* Header */}
            <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Visitantes Online
                <span className="text-zinc-400 font-normal">({visitors.length})</span>
              </h3>
            </div>

            {/* Visitor cards list */}
            <div className="flex-1 overflow-y-auto p-4">
              {visitors.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                  <Eye className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">Nenhum visitante online</p>
                  <p className="text-[11px]">Os visitantes aparecerão aqui em tempo real</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visitors.map((v, idx) => {
                    const cat = categoryLabel(v.category);
                    const src = sourceLabel(v.source);

                    return (
                      <div
                        key={v.id}
                        className="p-4 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:shadow-md transition-all duration-200 bg-white group animate-pop-in"
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        {/* Top line */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-zinc-400" />
                              </div>
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-zinc-400" />
                                {v.city || "â€”"}{v.country ? `, ${v.country}` : ""}
                              </p>
                              <p className="text-[10px] text-zinc-400">{v.browser}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cat.bg}`}>
                            {cat.emoji} {cat.label}
                          </span>
                        </div>

                        {/* Current page */}
                        {(v.currentPageTitle || v.currentPage) && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 mb-3 group-hover:bg-blue-50/30 group-hover:border-blue-100/50 transition-colors">
                            <ExternalLink className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                            <p className="text-[11px] text-zinc-600 truncate font-medium">
                              {v.currentPageTitle || v.currentPage}
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
                            <span className="flex items-center gap-0.5">
                              <Hash className="w-3 h-3" /> {v.totalVisits} vis
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

                        {/* Timestamp */}
                        <div className="flex items-center justify-end mt-2">
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
          </div>
        )}

        {/* â”€â”€â”€ Tab: CRM Kanban â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                                      {(v.city || "?")[0].toUpperCase()}
                                    </div>
                                    {v.isOnline === "true" && (
                                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-semibold text-zinc-800 leading-tight truncate max-w-[120px]">
                                      {v.city || "Visitante"}
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
                                <span>â€¢ {v.totalChats} chats</span>
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

            {/* Detail panel (compact overlay at bottom) */}
            {selectedVisitor && (
              <div className="flex-shrink-0 mt-3 bg-white rounded-2xl border border-zinc-200/60 shadow-lg overflow-hidden animate-pop-in" style={{ maxHeight: "220px" }}>
                <div className="flex h-full">
                  {/* Left: visitor info */}
                  <div className="flex-1 p-4 flex items-start gap-4 overflow-y-auto">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                      {(selectedVisitor.city || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-zinc-800">{selectedVisitor.city || "Desconhecido"}</h3>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${categoryLabel(selectedVisitor.category).bg}`}>
                          {categoryLabel(selectedVisitor.category).emoji} {categoryLabel(selectedVisitor.category).label}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          selectedVisitor.isOnline === "true"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            : "bg-zinc-50 text-zinc-500 border border-zinc-200"
                        }`}>
                          {selectedVisitor.isOnline === "true" ? "ðŸŸ¢ Online" : "âš« Offline"}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mb-2">{selectedVisitor.country} â€¢ {selectedVisitor.browser} â€¢ {sourceLabel(selectedVisitor.source).icon} {sourceLabel(selectedVisitor.source).label}</p>

                      <div className="flex items-center gap-4">
                        {[
                          { label: "Visitas", value: selectedVisitor.totalVisits },
                          { label: "PÃ¡ginas", value: selectedVisitor.totalPages },
                          { label: "Chats", value: selectedVisitor.totalChats },
                          { label: "Score", value: `${selectedVisitor.engagementScore}/100` },
                        ].map((m) => (
                          <div key={m.label} className="text-center">
                            <p className="text-base font-bold text-zinc-800">{m.value}</p>
                            <p className="text-[9px] text-zinc-400">{m.label}</p>
                          </div>
                        ))}
                        <div className="flex-1 max-w-[120px]">
                          <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${scoreColor(selectedVisitor.engagementScore)}`}
                              style={{ width: `${Math.min(selectedVisitor.engagementScore, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: activity timeline */}
                  <div className="w-[280px] flex-shrink-0 border-l border-zinc-100 p-4 overflow-y-auto">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">ðŸ• Atividade</p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Primeiro acesso</span>
                        <span className="text-zinc-700 font-medium">{new Date(selectedVisitor.firstSeenAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Ãšltima atividade</span>
                        <span className="text-zinc-700 font-medium">{timeAgo(selectedVisitor.lastSeenAt)}</span>
                      </div>
                      {selectedVisitor.currentPage && (
                        <div className="flex items-center gap-1 mt-1.5 px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-100">
                          <ExternalLink className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                          <span className="text-[10px] text-zinc-600 truncate">{selectedVisitor.currentPageTitle || selectedVisitor.currentPage}</span>
                        </div>
                      )}
                      {selectedVisitor.utmCampaign && (
                        <div className="flex items-center gap-1 mt-1">
                          <Zap className="w-3 h-3 text-zinc-400" />
                          <span className="text-[10px] text-zinc-600">Campanha: {selectedVisitor.utmCampaign}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedVisitor(null)}
                      className="mt-3 w-full text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors py-1"
                    >
                      âœ• Fechar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: Estatísticas ─────────────────────────────────── */}
        {activeTab === "stats" && (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/60 shadow-sm animate-tab-enter">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-10 h-10 text-zinc-300" />
              </div>
              <h3 className="text-lg font-bold text-zinc-700 mb-2">Estatísticas e BI</h3>
              <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
                A coleta de dados está ativa desde o primeiro momento. O dashboard completo
                com gráficos de conversão, origens de tráfego, e análises detalhadas será
                implementado na próxima fase.
              </p>
              <div className="flex items-center justify-center gap-2 mt-6">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-emerald-600 font-medium">Coletando dados...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveChat;
