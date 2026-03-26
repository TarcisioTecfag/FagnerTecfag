/**
 * client/src/pages/LiveChat.tsx
 *
 * Painel de monitoramento do Live Chat — REFATORADO
 * 4 abas: Chats | Visitantes | CRM | Estatísticas
 * 
 * Layout 100vh fixo, scroll apenas interno.
 * Fagner atende 100% via IA — este painel é para MONITORAMENTO.
 * Opção de assumir manualmente em emergência.
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryLabel(cat: string): { label: string; emoji: string; color: string; bg: string } {
  switch (cat) {
    case "lead_hot": return { label: "Lead Quente", emoji: "🔴", color: "text-red-400", bg: "bg-red-500/15 border-red-500/20" };
    case "lead_warm": return { label: "Lead Morno", emoji: "🟡", color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/20" };
    case "customer": return { label: "Cliente", emoji: "⭐", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/20" };
    case "returning": return { label: "Retorno", emoji: "🔄", color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/20" };
    default: return { label: "Visitante", emoji: "🟢", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/20" };
  }
}

function statusBadge(status: string): { label: string; icon: string; color: string; bg: string } {
  switch (status) {
    case "ai_active": return { label: "IA Ativa", icon: "🤖", color: "text-emerald-300", bg: "bg-emerald-500/15" };
    case "human_active": return { label: "Agente", icon: "👤", color: "text-blue-300", bg: "bg-blue-500/15" };
    case "waiting": return { label: "Aguardando", icon: "⏳", color: "text-yellow-300", bg: "bg-yellow-500/15" };
    case "closed": return { label: "Encerrado", icon: "✅", color: "text-zinc-400", bg: "bg-zinc-500/15" };
    default: return { label: status, icon: "❓", color: "text-zinc-400", bg: "bg-zinc-500/15" };
  }
}

function sourceLabel(src?: string): { label: string; icon: string } {
  switch (src) {
    case "google_organic": return { label: "Google Orgânico", icon: "🔍" };
    case "google_ads": return { label: "Google Ads", icon: "📢" };
    case "instagram": return { label: "Instagram", icon: "📸" };
    case "facebook": return { label: "Facebook", icon: "📘" };
    case "youtube": return { label: "YouTube", icon: "▶️" };
    case "direct": return { label: "Direto", icon: "🔗" };
    default: return { label: src ?? "Outro", icon: "🌐" };
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

// ─── Main Component ───────────────────────────────────────────────────────────

function LiveChat() {
  const [activeTab, setActiveTab] = useState<"chats" | "visitors" | "crm" | "stats">("chats");
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [allVisitors, setAllVisitors] = useState<Visitor[]>([]);
  const [crmFilter, setCrmFilter] = useState<string>("all");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // ── Fetch initial data ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [visitorsRes, chatsRes, statsRes, allVisitorsRes] = await Promise.all([
        fetch("/api/livechat/visitors", { credentials: "include" }),
        fetch("/api/livechat/chats", { credentials: "include" }),
        fetch("/api/livechat/stats", { credentials: "include" }),
        fetch("/api/livechat/visitors/all?limit=200", { credentials: "include" }),
      ]);
      if (visitorsRes.ok) setVisitors(await visitorsRes.json());
      if (chatsRes.ok) setChats(await chatsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (allVisitorsRes.ok) setAllVisitors(await allVisitorsRes.json());
    } catch {}
  }, []);

  // ── WebSocket connection ──────────────────────────────────────────
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
          case "CHAT_TAKEN_OVER":
            setChats((prev) => prev.map((c) =>
              c.id === data.chatId ? { ...c, status: "human_active" } : c
            ));
            break;
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

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

  // ── Load chat messages ────────────────────────────────────────────
  const loadChatMessages = async (chat: Chat) => {
    setSelectedChat(chat);
    try {
      const res = await fetch(`/api/livechat/chats/${chat.id}/messages`, { credentials: "include" });
      if (res.ok) setChatMessages(await res.json());
    } catch {}
  };

  // ── Agent send message (human takeover) ───────────────────────────
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

  // ── Take over chat ───────────────────────────────────────────────
  const handleTakeOver = (chatId: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "TAKE_OVER",
      chatId,
      userId: "admin",
    }));
    toast({ title: "Chat assumido", description: "Você agora está respondendo este chat." });
  };

  // ── Close chat ────────────────────────────────────────────────────
  const handleCloseChat = (chatId: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "CLOSE_CHAT", chatId }));
    setSelectedChat(null);
    setChatMessages([]);
  };

  // ─── Derived data ─────────────────────────────────────────────────
  const activeChats = chats.filter((c) => c.status !== "closed");
  const needsHumanChats = chats.filter((c) => c.needsHuman === "true" && c.status !== "closed");

  const filteredCrmVisitors = crmFilter === "all"
    ? allVisitors
    : allVisitors.filter((v) => v.category === crmFilter);

  // ─── TABS ─────────────────────────────────────────────────────────
  const tabs = [
    { id: "chats" as const, label: "Chats", icon: MessageCircle, count: activeChats.length },
    { id: "visitors" as const, label: "Visitantes", icon: Eye, count: visitors.length },
    { id: "crm" as const, label: "CRM", icon: Users },
    { id: "stats" as const, label: "Estatísticas", icon: BarChart3 },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(0 0% 97%) 0%, hsl(0 5% 95%) 100%)" }}>

      {/* ═══ COMPACT HEADER ═══ */}
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

      {/* ═══ TAB CONTENT (flex-1, overflow-hidden) ═══ */}
      <div className="flex-1 overflow-hidden px-6 pb-5">

        {/* ─── Tab: Chats ─────────────────────────────────────────── */}
        {activeTab === "chats" && (
          <div className="h-full flex gap-4 animate-tab-enter">
            {/* Chat list panel */}
            <div className="w-[320px] flex-shrink-0 flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-red-500" />
                  Conversas
                </h3>
                <span className="text-[10px] text-zinc-400 font-medium">{activeChats.length} ativas</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {activeChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                    <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-xs">Nenhuma conversa ativa</p>
                  </div>
                ) : (
                  activeChats.map((chat) => {
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
                                {chat.source === "proactive" ? "Proativo" : "Widget"} • {timeAgo(chat.startedAt)}
                              </p>
                            </div>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${sb.bg} ${sb.color}`}>
                            {sb.icon} {sb.label}
                          </span>
                        </div>

                        {isUrgent && (
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
                          <span>•</span>
                          <span>Iniciado {timeAgo(selectedChat.startedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
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
                      <Button
                        size="sm"
                        onClick={() => handleCloseChat(selectedChat.id)}
                        className="h-8 text-xs"
                        style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                      >
                        Encerrar
                      </Button>
                    </div>
                  </div>

                  {/* Messages area */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: "linear-gradient(180deg, hsl(0 0% 98.5%) 0%, hsl(0 0% 97%) 100%)" }}>
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
                              <span>• {timeAgo(msg.sentAt)}</span>
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
                    {selectedChat.status === "human_active" ? (
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
        )}

        {/* ─── Tab: Visitantes ────────────────────────────────────── */}
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
                                {v.city || "—"}{v.country ? `, ${v.country}` : ""}
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

        {/* ─── Tab: CRM ──────────────────────────────────────────── */}
        {activeTab === "crm" && (
          <div className="h-full flex gap-4 animate-tab-enter">
            {/* Left panel: Filter + List */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
              {/* Category filter row */}
              <div className="px-4 py-3 border-b border-zinc-100">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: "all", label: "Todos", count: allVisitors.length, emoji: "📋" },
                    { id: "lead_hot", label: "Quentes", count: allVisitors.filter(v => v.category === "lead_hot").length, emoji: "🔴" },
                    { id: "lead_warm", label: "Mornos", count: allVisitors.filter(v => v.category === "lead_warm").length, emoji: "🟡" },
                    { id: "customer", label: "Clientes", count: allVisitors.filter(v => v.category === "customer").length, emoji: "⭐" },
                    { id: "returning", label: "Retorno", count: allVisitors.filter(v => v.category === "returning").length, emoji: "🔄" },
                    { id: "visitor", label: "Visitantes", count: allVisitors.filter(v => v.category === "visitor").length, emoji: "🟢" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setCrmFilter(f.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        crmFilter === f.id
                          ? "bg-red-50 text-red-700 border border-red-200 shadow-sm"
                          : "text-zinc-500 hover:bg-zinc-50 border border-transparent"
                      }`}
                    >
                      <span>{f.emoji}</span>
                      {f.label}
                      <span className={`px-1 py-0 rounded text-[9px] font-bold ${
                        crmFilter === f.id ? "bg-red-200/50 text-red-700" : "bg-zinc-100 text-zinc-400"
                      }`}>
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Visitor list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {filteredCrmVisitors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                    <Users className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-xs">Nenhum visitante nesta categoria</p>
                  </div>
                ) : (
                  filteredCrmVisitors.map((v) => {
                    const cat = categoryLabel(v.category);
                    const isSelected = selectedVisitor?.id === v.id;

                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVisitor(isSelected ? null : v)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                          isSelected
                            ? "border-red-200 shadow-md"
                            : "border-transparent hover:border-zinc-100 hover:bg-zinc-50/50"
                        }`}
                        style={isSelected ? { background: "linear-gradient(135deg, rgba(127,29,29,0.04), rgba(220,38,38,0.02))" } : {}}
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-500">
                            {(v.city || "?")[0].toUpperCase()}
                          </div>
                          {v.isOnline === "true" && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-800 truncate">{v.city || "Desconhecido"}</p>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cat.bg}`}>
                              {cat.emoji} {cat.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                            <span>{v.browser}</span>
                            <span>•</span>
                            <span>{v.totalVisits} visitas</span>
                            <span>•</span>
                            <span>{v.totalChats} chats</span>
                          </div>
                        </div>

                        {/* Score + Time */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            <div className="w-8 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${scoreColor(v.engagementScore)}`}
                                style={{ width: `${Math.min(v.engagementScore, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-zinc-600 w-5 text-right">{v.engagementScore}</span>
                          </div>
                          <span className="text-[10px] text-zinc-300">{timeAgo(v.lastSeenAt)}</span>
                        </div>

                        {isSelected && <ChevronRight className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right panel: Detail card */}
            <div className={`w-[360px] flex-shrink-0 transition-all duration-300 ${selectedVisitor ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"}`}>
              {selectedVisitor && (
                <div className="h-full bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-y-auto animate-tab-enter">
                  {/* Detail header */}
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white" style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                        {(selectedVisitor.city || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-800">
                          {selectedVisitor.city || "Desconhecido"}
                        </h3>
                        <p className="text-[11px] text-zinc-400">
                          {selectedVisitor.country} • {selectedVisitor.browser}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${categoryLabel(selectedVisitor.category).bg}`}>
                        {categoryLabel(selectedVisitor.category).emoji} {categoryLabel(selectedVisitor.category).label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        selectedVisitor.isOnline === "true"
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : "bg-zinc-50 text-zinc-500 border border-zinc-200"
                      }`}>
                        {selectedVisitor.isOnline === "true" ? "🟢 Online" : "⚫ Offline"}
                      </span>
                    </div>
                  </div>

                  {/* Score section */}
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Engagement Score</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${scoreColor(selectedVisitor.engagementScore)} transition-all duration-700`}
                          style={{ width: `${Math.min(selectedVisitor.engagementScore, 100)}%` }}
                        />
                      </div>
                      <span className="text-lg font-bold text-zinc-800">{selectedVisitor.engagementScore}</span>
                      <span className="text-[10px] text-zinc-400">/100</span>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-3">📈 Métricas</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Visitas", value: selectedVisitor.totalVisits, icon: Activity },
                        { label: "Páginas", value: selectedVisitor.totalPages, icon: Layers },
                        { label: "Chats", value: selectedVisitor.totalChats, icon: MessageCircle },
                      ].map((m) => (
                        <div key={m.label} className="text-center p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                          <m.icon className="w-4 h-4 mx-auto text-zinc-400 mb-1" />
                          <p className="text-lg font-bold text-zinc-800">{m.value}</p>
                          <p className="text-[9px] text-zinc-400 font-medium">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Source info */}
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-3">📊 Origem</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-zinc-600">
                        <MousePointer className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{sourceLabel(selectedVisitor.source).icon} {sourceLabel(selectedVisitor.source).label}</span>
                      </div>
                      {selectedVisitor.utmCampaign && (
                        <div className="flex items-center gap-2 text-xs text-zinc-600">
                          <Zap className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Campanha: {selectedVisitor.utmCampaign}</span>
                        </div>
                      )}
                      {selectedVisitor.currentPage && (
                        <div className="flex items-center gap-2 text-xs text-zinc-600">
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="truncate">{selectedVisitor.currentPageTitle ?? selectedVisitor.currentPage}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Activity timeline */}
                  <div className="px-5 py-4">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-3">🕐 Atividade</p>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Primeiro acesso</span>
                        <span className="text-zinc-700 font-medium">
                          {new Date(selectedVisitor.firstSeenAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Última atividade</span>
                        <span className="text-zinc-700 font-medium">{timeAgo(selectedVisitor.lastSeenAt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Primeiro acesso (hora)</span>
                        <span className="text-zinc-700 font-medium">
                          {new Date(selectedVisitor.firstSeenAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
