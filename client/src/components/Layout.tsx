import { ReactNode, useState, useEffect } from "react";
import { WS_URL } from "@/lib/api";
import { Link, useLocation } from "wouter";
import {
  Bot,
  PenTool,
  Database,
  BookOpen,
  Clock,
  Settings,
  LayoutDashboard,
  LogOut,
  Activity,
  Users,
  DollarSign,
  ShoppingBag,
  MessageSquare,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SettingsModal from "./SettingsModal";
import { useAuth } from "@/hooks/use-auth";
import NotificationToast, { type NotificationData } from "@/components/monitoring/NotificationToast";
import { useNotificationSound } from "@/hooks/use-notification-sound";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [globalNotification, setGlobalNotification] = useState<NotificationData | null>(null);
  const { user, logoutMutation } = useAuth();
  const queryClient = useQueryClient();
  const { play: playSound } = useNotificationSound();
  const { data: botStatus } = useQuery<{ status: string }>({
    queryKey: ["/api/bot/status"],
    refetchInterval: 5000,
  });

  // ── WebSocket global — dispara notificação em qualquer página ──────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const endpoint = WS_URL
      ? `${WS_URL}/ws/chat`
      : `${protocol}//${window.location.host}/ws/chat`;
    const socket = new WebSocket(endpoint);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "NEW_MESSAGE" && data.sender === "user" && data.content !== "!REFRESH_SESSION") {
          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
          const now = new Date();
          const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
          setGlobalNotification({
            id: data.sessionId || String(Date.now()),
            senderName: data.clientName || "Cliente",
            message: data.content,
            time,
          });
          playSound();
        }
      } catch { /* ignore parse errors */ }
    };

    return () => socket.close();
  }, [queryClient, playSound]);

  const isBotActive = botStatus?.status === 'RUNNING';
  const isStarting = botStatus?.status === 'STARTING';
  const isStopping = botStatus?.status === 'STOPPING';

  const navItems = [
    { section: "Controle Operacional" },
    { name: "Painel de Controle", href: "/", icon: LayoutDashboard },
    { name: "Monitor em Tempo Real", href: "/monitor", icon: Activity },
    { name: "Live Chat", href: "/livechat", icon: MessageCircle },
    { section: "Inteligência & CRM" },
    { name: "Editor de Prompt", href: "/prompt", icon: PenTool },
    { name: "Configuração de CRM", href: "/crm", icon: Database },
    { name: "Configuração VTEX", href: "/vtex", icon: ShoppingBag },
    { name: "Configurações de Conversas", href: "/conversas", icon: MessageSquare },
    { section: "Conhecimento & Filtros" },
    { name: "Base de Conhecimento", href: "/knowledge", icon: BookOpen },
    { name: "Regras de Agendamento", href: "/schedule", icon: Clock },
    { section: "Administração" },
    { name: "Usuários & Acessos", href: "/users", icon: Users },
    { name: "Custos de API", href: "/costs", icon: DollarSign },
  ];

  return (
    <div className="h-screen overflow-hidden bg-zinc-50/50 flex">
      {/* Sidebar wrapper */}
      <div className={`${collapsed ? "w-[68px]" : "w-[280px]"} relative flex-shrink-0 transition-[width] duration-350 ease-[cubic-bezier(0.32,0.72,0,1)]`}>

        {/* Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expandir barra lateral" : "Minimizar barra lateral"}
          className="absolute -right-3.5 top-6 z-30 w-7 h-7 rounded-full bg-white border border-red-100 shadow-md flex items-center justify-center text-red-400 hover:text-red-700 hover:border-red-300 hover:shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.35s cubic-bezier(0.32,0.72,0,1)" }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <aside
          className="w-full flex flex-col h-screen sticky top-0 overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #1a0000 0%, #2d0000 40%, #450a0a 80%, #1a0000 100%)",
            borderRight: "1px solid rgba(153,27,27,0.4)"
          }}
        >
          {/* Logo */}
          <div className={`p-4 ${collapsed ? "flex justify-center" : "px-6 py-5"}`}>
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 transition-transform duration-200 hover:scale-105 shadow-lg"
                style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
              >
                <Bot size={24} />
              </div>
              {!collapsed && (
                <div className="animate-slide-in-left">
                  <h1
                    className="font-bold tracking-tight text-base"
                    style={{
                      background: "linear-gradient(135deg, #ffffff, #fca5a5, #ef4444)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent"
                    }}
                  >
                    Fagner
                  </h1>
                  <p className="text-xs font-medium" style={{ color: "rgba(254,202,202,0.7)" }}>
                    Tecfag I.A
                  </p>
                </div>
              )}
            </div>
          </div>

          <nav className="flex-1 px-2 pb-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navItems.map((item, index) => {
              if (item.section) {
                if (collapsed) {
                  return (
                    <div key={index} className="pt-4 pb-1 flex justify-center">
                      <div className="w-6 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
                    </div>
                  );
                }
                return (
                  <div key={index} className="pt-6 pb-2 px-3">
                    <p
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "rgba(252,165,165,0.55)" }}
                    >
                      {item.section}
                    </p>
                  </div>
                );
              }

              const Icon = item.icon!;
              const isActive = location === item.href;

              return (
                <div key={item.href} className="relative group/item">
                  <Link
                    href={item.href!}
                    className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200
                      ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
                    `}
                    style={isActive
                      ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626, #ef4444)", color: "#ffffff", boxShadow: "0 2px 8px rgba(220,38,38,0.35)" }
                      : { color: "rgba(254,202,202,0.75)" }
                    }
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                        (e.currentTarget as HTMLElement).style.color = "#ffffff";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "";
                        (e.currentTarget as HTMLElement).style.color = "rgba(254,202,202,0.75)";
                      }
                    }}
                  >
                    <Icon
                      size={18}
                      className="transition-transform duration-200 group-hover/item:scale-110 shrink-0"
                      style={{ color: isActive ? "#ffffff" : "rgba(252,165,165,0.70)" }}
                    />
                    {!collapsed && (
                      <span className="transition-opacity duration-200">
                        {item.name}
                      </span>
                    )}
                    {isActive && !collapsed && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
                    )}
                  </Link>

                  {/* Tooltip for collapsed mode */}
                  {collapsed && (
                    <div
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 text-white text-xs font-medium rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-0 -translate-x-1 pointer-events-none transition-all duration-200 z-50"
                      style={{ background: "#1a0000", border: "1px solid rgba(255,255,255,0.10)" }}
                    >
                      {item.name}
                      <div
                        className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
                        style={{ borderRightColor: "#1a0000" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User Footer */}
          <div
            className={`p-3 ${collapsed ? "flex justify-center" : ""}`}
            style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}
          >
            {collapsed ? (
              <div className="relative group/user">
                <Avatar
                  className="h-9 w-9 cursor-pointer transition-transform duration-200 hover:scale-105"
                  style={{ border: "1px solid rgba(252,165,165,0.30)" }}
                >
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'Admin'}`} />
                  <AvatarFallback style={{ background: "linear-gradient(135deg,#7f1d1d,#dc2626)", color: "#fff" }}>
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {/* Tooltip */}
                <div
                  className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 text-white text-xs font-medium rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover/user:opacity-100 group-hover/user:translate-x-0 -translate-x-1 pointer-events-none transition-all duration-200 z-50"
                  style={{ background: "#1a0000", border: "1px solid rgba(255,255,255,0.10)" }}
                >
                  {user?.name || 'Usuário'}
                  <div
                    className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
                    style={{ borderRightColor: "#1a0000" }}
                  />
                </div>
              </div>
            ) : (
              <div
                className="flex justify-between items-center gap-2 p-2 rounded-lg cursor-pointer transition-all group animate-slide-in-left"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar
                    className="h-9 w-9 flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
                    style={{ border: "1px solid rgba(252,165,165,0.30)" }}
                  >
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'Admin'}`} />
                    <AvatarFallback style={{ background: "linear-gradient(135deg,#7f1d1d,#dc2626)", color: "#fff" }}>
                      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden" onClick={() => setShowSettings(true)}>
                    <p className="text-sm font-medium text-white truncate">{user?.name || 'Usuário'}</p>
                    <p className="text-xs truncate" style={{ color: "rgba(252,165,165,0.55)" }}>
                      {user?.email || 'Nenhum email'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 transition-all duration-200 hover:scale-110 hover:bg-white/10"
                    style={{ color: "rgba(252,165,165,0.60)" }}
                    onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
                    title="Configurações"
                  >
                    <Settings size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 transition-all duration-200 hover:scale-110 hover:bg-red-900/40 hover:text-red-300"
                    style={{ color: "rgba(252,165,165,0.60)" }}
                    onClick={(e) => { e.stopPropagation(); logoutMutation.mutate(); }}
                    title="Sair"
                  >
                    <LogOut size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div
          key={location}
          className={`flex-1 animate-page-enter ${
            location === "/" || location === "/monitor" || location === "/crm" || location === "/knowledge" || location === "/users" || location === "/costs" || location === "/vtex" || location === "/conversas" || location === "/livechat"
              ? "overflow-hidden flex flex-col"
              : "overflow-y-auto p-8"
          }`}
        >
          <div className={
            location === "/" || location === "/monitor" || location === "/crm" || location === "/knowledge" || location === "/users" || location === "/costs" || location === "/vtex" || location === "/conversas" || location === "/livechat"
              ? "flex-1 h-full overflow-hidden flex flex-col"
              : "max-w-6xl mx-auto"
          }>
            {children}
          </div>
        </div>
      </main>

      {/* Floating Bot Status Icon */}
      <div className="fixed bottom-6 right-6 z-50 group/botstatus">
        <div
          title={isBotActive ? 'Robô Online' : isStarting ? 'Iniciando...' : isStopping ? 'Encerrando...' : 'Robô Offline'}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg cursor-default transition-all duration-300
            ${isBotActive ? 'animate-ripple' : isStarting ? 'animate-bounce-gentle' : isStopping ? 'animate-pulse' : ''}
          `}
          style={{
            background: isBotActive
              ? "linear-gradient(135deg, #7f1d1d, #dc2626)"
              : isStarting ? "#b45309"
              : isStopping ? "#c2410c"
              : "#71717a",
            boxShadow: isBotActive ? "0 0 16px rgba(220,38,38,0.45)" : isStarting ? "0 0 12px rgba(180,83,9,0.35)" : "none"
          }}
        >
          <Bot size={22} className="text-white drop-shadow relative z-10" />
        </div>

        {/* Tooltip */}
        <div
          className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover/botstatus:opacity-100 -translate-y-1 group-hover/botstatus:translate-y-0 pointer-events-none transition-all duration-200"
          style={{ background: "#1a0000", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          {isBotActive ? 'Robô Online' : isStarting ? 'Iniciando...' : isStopping ? 'Encerrando...' : 'Robô Offline'}
          <div className="absolute top-full right-4 border-4 border-transparent" style={{ borderTopColor: "#1a0000" }} />
        </div>
      </div>

      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />

      {/* ── Toast de notificação global (qualquer página) ── */}
      <NotificationToast
        notification={globalNotification}
        onDismiss={() => setGlobalNotification(null)}
        onClickNotification={() => {
          setGlobalNotification(null);
          window.location.href = "/monitor";
        }}
      />
    </div>
  );
}