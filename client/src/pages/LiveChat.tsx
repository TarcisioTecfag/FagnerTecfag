/**
 * client/src/pages/LiveChat.tsx
 *
 * Painel de monitoramento do Live Chat
 * 4 abas: Chats | Visitantes | CRM | Estatísticas
 * 
 * Fagner atende 100% via IA — este painel é para MONITORAMENTO.
 * Opção de assumir manualmente em emergência.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function categoryLabel(cat: string): { label: string; color: string } {
  switch (cat) {
    case "lead_hot": return { label: "🔴 Lead Quente", color: "bg-red-500/20 text-red-400" };
    case "lead_warm": return { label: "🟡 Lead Morno", color: "bg-yellow-500/20 text-yellow-400" };
    case "customer": return { label: "⭐ Cliente", color: "bg-blue-500/20 text-blue-400" };
    case "returning": return { label: "🔄 Retorno", color: "bg-purple-500/20 text-purple-400" };
    default: return { label: "🟢 Visitante", color: "bg-green-500/20 text-green-400" };
  }
}

function statusBadge(status: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "ai_active": return { label: "🤖 IA Ativa", variant: "default" };
    case "human_active": return { label: "👤 Agente", variant: "secondary" };
    case "waiting": return { label: "⏳ Aguardando", variant: "outline" };
    case "closed": return { label: "✅ Encerrado", variant: "outline" };
    default: return { label: status, variant: "outline" };
  }
}

function sourceLabel(src?: string): string {
  switch (src) {
    case "google_organic": return "🔍 Google Orgânico";
    case "google_ads": return "📢 Google Ads";
    case "instagram": return "📸 Instagram";
    case "facebook": return "📘 Facebook";
    case "youtube": return "▶️ YouTube";
    case "direct": return "🔗 Direto";
    default: return src ?? "🌐 Outro";
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

  // ─── TABS ─────────────────────────────────────────────────────────

  const tabs = [
    { id: "chats" as const, label: "Chats", icon: MessageCircle, count: chats.filter((c) => c.status !== "closed").length },
    { id: "visitors" as const, label: "Visitantes", icon: Eye, count: visitors.length },
    { id: "crm" as const, label: "CRM", icon: Users },
    { id: "stats" as const, label: "Estatísticas", icon: BarChart3 },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            Live Chat
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento de atendimentos do Fagner no site
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <Eye className="w-5 h-5 mx-auto text-green-400 mb-1" />
              <p className="text-2xl font-bold">{stats.onlineVisitors}</p>
              <p className="text-xs text-muted-foreground">Online agora</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <MessageCircle className="w-5 h-5 mx-auto text-blue-400 mb-1" />
              <p className="text-2xl font-bold">{stats.activeChats}</p>
              <p className="text-xs text-muted-foreground">Chats ativos</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-5 h-5 mx-auto text-red-400 mb-1" />
              <p className="text-2xl font-bold">{stats.needsHuman}</p>
              <p className="text-xs text-muted-foreground">Pedem ajuda</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 mx-auto text-purple-400 mb-1" />
              <p className="text-2xl font-bold">{stats.totalChatsToday}</p>
              <p className="text-xs text-muted-foreground">Chats hoje</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <Users className="w-5 h-5 mx-auto text-yellow-400 mb-1" />
              <p className="text-2xl font-bold">{stats.totalVisitorsToday}</p>
              <p className="text-xs text-muted-foreground">Visitantes hoje</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-card/50 p-1 rounded-lg border border-border/50">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                {tab.count}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* ─── Tab: Chats ─────────────────────────────────────────────── */}
      {activeTab === "chats" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 500 }}>
          {/* Chat list */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Conversas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {chats.filter((c) => c.status !== "closed").length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma conversa ativa
                </p>
              )}
              {chats.filter((c) => c.status !== "closed").map((chat) => {
                const sb = statusBadge(chat.status);
                return (
                  <div
                    key={chat.id}
                    onClick={() => loadChatMessages(chat)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50 ${
                      selectedChat?.id === chat.id ? "border-primary bg-primary/5" : "border-border/50"
                    } ${chat.needsHuman === "true" ? "border-red-500/50 bg-red-500/5" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {chat.visitorName || `Visitante`}
                      </span>
                      <Badge variant={sb.variant} className="text-xs">{sb.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{chat.source === "proactive" ? "Proativo" : "Widget"}</span>
                      <span>{timeAgo(chat.startedAt)}</span>
                    </div>
                    {chat.needsHuman === "true" && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        Fagner precisa de ajuda!
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Chat messages */}
          <Card className="lg:col-span-2">
            {selectedChat ? (
              <>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      {selectedChat.visitorName || "Visitante"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {statusBadge(selectedChat.status).label} • Iniciado {timeAgo(selectedChat.startedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedChat.status === "ai_active" && (
                      <Button size="sm" variant="outline" onClick={() => handleTakeOver(selectedChat.id)}>
                        Assumir Chat
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleCloseChat(selectedChat.id)}>
                      Encerrar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px] overflow-y-auto space-y-3 mb-4 pr-2">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === "visitor" ? "justify-start" : "justify-end"}`}
                      >
                        <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                          msg.sender === "visitor"
                            ? "bg-muted text-foreground"
                            : msg.sender === "ai"
                            ? "bg-primary/20 text-foreground"
                            : "bg-blue-600/20 text-foreground"
                        }`}>
                          <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                            {msg.sender === "visitor" && <User className="w-3 h-3" />}
                            {msg.sender === "ai" && <Bot className="w-3 h-3" />}
                            {msg.sender === "agent" && <User className="w-3 h-3" />}
                            <span>{msg.sender === "visitor" ? "Visitante" : msg.sender === "ai" ? "Fagner (IA)" : "Agente"}</span>
                            <span>• {timeAgo(msg.sentAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Agent input — only when human is active */}
                  {selectedChat.status === "human_active" && (
                    <div className="flex gap-2">
                      <Textarea
                        value={agentInput}
                        onChange={(e) => setAgentInput(e.target.value)}
                        placeholder="Escreva sua mensagem..."
                        className="resize-none"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAgentSend(); }
                        }}
                      />
                      <Button onClick={handleAgentSend} className="self-end">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {selectedChat.status === "ai_active" && (
                    <p className="text-xs text-muted-foreground text-center">
                      🤖 Fagner está conduzindo este atendimento. Clique em "Assumir Chat" para intervir.
                    </p>
                  )}
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-[500px] text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Selecione uma conversa para visualizar</p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ─── Tab: Visitantes ────────────────────────────────────────── */}
      {activeTab === "visitors" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-green-400" />
              Visitantes Online ({visitors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visitors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum visitante online no momento
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-left py-2 px-2">Visitante</th>
                      <th className="text-left py-2 px-2">Página Atual</th>
                      <th className="text-left py-2 px-2">Origem</th>
                      <th className="text-center py-2 px-2">Páginas</th>
                      <th className="text-center py-2 px-2">Visitas</th>
                      <th className="text-center py-2 px-2">Score</th>
                      <th className="text-left py-2 px-2">Categoria</th>
                      <th className="text-right py-2 px-2">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitors.map((v) => {
                      const cat = categoryLabel(v.category);
                      return (
                        <tr key={v.id} className="border-b border-border/20 hover:bg-muted/30">
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                              <div>
                                <p className="text-xs font-medium">{v.city || "—"}, {v.country || ""}</p>
                                <p className="text-xs text-muted-foreground">{v.browser}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 max-w-[200px]">
                            <p className="text-xs truncate" title={v.currentPage ?? ""}>
                              {v.currentPageTitle || v.currentPage || "—"}
                            </p>
                          </td>
                          <td className="py-2 px-2 text-xs">{sourceLabel(v.source)}</td>
                          <td className="py-2 px-2 text-center text-xs">{v.totalPages}</td>
                          <td className="py-2 px-2 text-center text-xs">{v.totalVisits}</td>
                          <td className="py-2 px-2 text-center">
                            <Badge variant="outline" className="text-xs">
                              {v.engagementScore}
                            </Badge>
                          </td>
                          <td className="py-2 px-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${cat.color}`}>
                              {cat.label}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                            {timeAgo(v.lastSeenAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Tab: CRM ──────────────────────────────────────────────── */}
      {activeTab === "crm" && (
        <div className="space-y-4">
          {/* Category summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { cat: "lead_hot", label: "🔴 Leads Quentes" },
              { cat: "lead_warm", label: "🟡 Leads Mornos" },
              { cat: "customer", label: "⭐ Clientes" },
              { cat: "returning", label: "🔄 Retorno" },
              { cat: "visitor", label: "🟢 Visitantes" },
            ].map(({ cat, label }) => (
              <Card key={cat} className="bg-card/50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold">{allVisitors.filter((v) => v.category === cat).length}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* All visitors CRM table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                Todos os Visitantes ({allVisitors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-left py-2 px-2">Visitante</th>
                      <th className="text-left py-2 px-2">Categoria</th>
                      <th className="text-center py-2 px-2">Score</th>
                      <th className="text-center py-2 px-2">Visitas</th>
                      <th className="text-center py-2 px-2">Páginas</th>
                      <th className="text-center py-2 px-2">Chats</th>
                      <th className="text-left py-2 px-2">Origem</th>
                      <th className="text-left py-2 px-2">Primeiro</th>
                      <th className="text-left py-2 px-2">Último</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allVisitors.map((v) => {
                      const cat = categoryLabel(v.category);
                      return (
                        <tr
                          key={v.id}
                          className="border-b border-border/20 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setSelectedVisitor(selectedVisitor?.id === v.id ? null : v)}
                        >
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              {v.isOnline === "true" && <div className="w-2 h-2 rounded-full bg-green-400" />}
                              <div>
                                <p className="text-xs font-medium">{v.city || "Desconhecido"}</p>
                                <p className="text-xs text-muted-foreground">{v.browser}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Badge variant="outline">{v.engagementScore}</Badge>
                          </td>
                          <td className="py-2 px-2 text-center text-xs">{v.totalVisits}</td>
                          <td className="py-2 px-2 text-center text-xs">{v.totalPages}</td>
                          <td className="py-2 px-2 text-center text-xs">{v.totalChats}</td>
                          <td className="py-2 px-2 text-xs">{sourceLabel(v.source)}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {new Date(v.firstSeenAt).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{timeAgo(v.lastSeenAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Visitor detail card */}
          {selectedVisitor && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  📇 Ficha do Visitante
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">📊 Dados</p>
                  <p><MapPin className="w-3 h-3 inline mr-1" />{selectedVisitor.city}, {selectedVisitor.country}</p>
                  <p><Globe className="w-3 h-3 inline mr-1" />{selectedVisitor.browser}</p>
                  <p><MousePointer className="w-3 h-3 inline mr-1" />{sourceLabel(selectedVisitor.source)}</p>
                  {selectedVisitor.utmCampaign && <p>📢 Campanha: {selectedVisitor.utmCampaign}</p>}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">📈 Métricas</p>
                  <p>Visitas: {selectedVisitor.totalVisits}</p>
                  <p>Páginas: {selectedVisitor.totalPages}</p>
                  <p>Chats: {selectedVisitor.totalChats}</p>
                  <p>Score: <Badge variant="outline">{selectedVisitor.engagementScore}/100</Badge></p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">🕐 Atividade</p>
                  <p>Primeiro acesso: {new Date(selectedVisitor.firstSeenAt).toLocaleString("pt-BR")}</p>
                  <p>Última atividade: {timeAgo(selectedVisitor.lastSeenAt)}</p>
                  <p>Status: {selectedVisitor.isOnline === "true" ? "🟢 Online" : "⚫ Offline"}</p>
                  {selectedVisitor.currentPage && (
                    <p className="truncate" title={selectedVisitor.currentPage}>
                      Página: {selectedVisitor.currentPageTitle ?? selectedVisitor.currentPage}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Tab: Estatísticas ─────────────────────────────────────── */}
      {activeTab === "stats" && (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium mb-2">Estatísticas e BI</h3>
              <p className="text-sm max-w-md">
                A coleta de dados está ativa desde o primeiro momento. O dashboard completo com gráficos de conversão, origens de tráfego, e análises detalhadas será implementado na próxima fase.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default LiveChat;
