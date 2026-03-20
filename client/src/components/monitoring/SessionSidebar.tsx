import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageSquare, Pause, Play, Archive, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Session {
  id: string;
  startTime: string;
  status: string;
  clientName: string | null;
  clientPhone: string | null;
  capturedData: string | null;
  annotation?: string | null;
  // campos extras para preview na sidebar
  lastMessage?: string | null;
  unread?: number;
}

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  showArchived: boolean;
  searchQuery: string;
  isAIPaused: boolean;
  isAITogglePending: boolean;
  onSelectSession: (id: string) => void;
  onToggleArchived: (archived: boolean) => void;
  onSearchChange: (query: string) => void;
  onToggleAI: () => void;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  ["#fee2e2", "#dc2626"], ["#fef9c3", "#ca8a04"], ["#d1fae5", "#059669"],
  ["#dbeafe", "#2563eb"], ["#ede9fe", "#7c3aed"], ["#fce7f3", "#db2777"],
];

function getAvatarColors(name: string | null) {
  const idx = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function formatTime(iso: string): string {
  try {
    return format(new Date(iso), "HH:mm", { locale: ptBR });
  } catch {
    return "--:--";
  }
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  showArchived,
  searchQuery,
  isAIPaused,
  isAITogglePending,
  onSelectSession,
  onToggleArchived,
  onSearchChange,
  onToggleAI,
}: SessionSidebarProps) {
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "linear-gradient(160deg, #1a0000 0%, #2d0000 40%, #450a0a 80%, #1a0000 100%)" }}
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <h2
          className="text-[10px] font-bold tracking-widest uppercase mb-3"
          style={{ color: "rgba(254,202,202,0.5)" }}
        >
          Sessões
        </h2>

        {/* Abas */}
        <div
          className="flex gap-1 p-0.5 rounded-lg mb-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {[
            { key: false, label: "Ativas", icon: Clock },
            { key: true, label: "Arquivadas", icon: Archive },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={String(key)}
              onClick={() => onToggleArchived(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                showArchived === key
                  ? "shadow-sm"
                  : ""
              }`}
              style={
                showArchived === key
                  ? { background: "rgba(255,255,255,0.12)", color: "#fca5a5" }
                  : { color: "rgba(254,202,202,0.4)" }
              }
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "rgba(254,202,202,0.35)" }}
          />
          <input
            type="text"
            placeholder="Buscar nome ou número..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-7 py-2 text-[11px] rounded-lg outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(254,226,226,0.85)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: "rgba(254,202,202,0.7)" }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Lista de Sessões */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 space-y-0.5 pb-2">
        <AnimatePresence initial={false}>
          {sessions.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12"
              style={{ color: "rgba(254,202,202,0.3)" }}
            >
              <MessageSquare size={22} className="mb-2" />
              <span className="text-xs">
                {searchQuery ? "Nenhum resultado" : "Nenhuma sessão encontrada"}
              </span>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = activeSessionId === session.id;
              const [bg, fg] = getAvatarColors(session.clientName);
              return (
                <motion.button
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => onSelectSession(session.id)}
                  className="w-full text-left p-2.5 rounded-xl transition-all"
                  style={
                    isActive
                      ? { background: "rgba(255,255,255,0.10)", outline: "1px solid rgba(220,38,38,0.35)" }
                      : {}
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold"
                        style={{ background: bg, color: fg }}
                      >
                        {getInitials(session.clientName)}
                      </div>
                      {/* Status dot */}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                        style={{
                          background: session.status === "COMPLETED" ? "#71717a" : "#22c55e",
                          borderColor: "#2d0000",
                          ...(session.status !== "COMPLETED" ? { animation: "pulse-dot 1.8s ease-in-out infinite" } : {}),
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className="text-[12px] font-semibold truncate"
                          style={{ color: isActive ? "#fca5a5" : "rgba(254,226,226,0.95)" }}
                        >
                          {session.clientName || "Cliente Desconhecido"}
                        </span>
                        <span
                          className="text-[9px] whitespace-nowrap flex-shrink-0"
                          style={{ color: "rgba(254,202,202,0.35)" }}
                        >
                          {session.startTime ? formatTime(session.startTime) : "--:--"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className="text-[10px] truncate"
                          style={{ color: "rgba(254,202,202,0.45)" }}
                        >
                          {session.lastMessage || session.clientPhone || "Sem mensagens"}
                        </p>
                        {/* Unread badge */}
                        {!!session.unread && session.unread > 0 && (
                          <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "#dc2626" }}>
                            {session.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* AI Toggle */}
      <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <button
          disabled={isAITogglePending}
          onClick={onToggleAI}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
          style={
            isAIPaused
              ? { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.20)" }
              : { background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.25)" }
          }
        >
          {isAIPaused ? <Play size={13} /> : <Pause size={13} />}
          {isAIPaused ? "Retomar I.A." : "Pausar I.A."}
        </button>
      </div>
    </div>
  );
}
