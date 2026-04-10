import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Bot, User, Archive, Trash2, ExternalLink, Wifi, WifiOff, Volume2, VolumeX, PauseCircle, Code } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Message {
  id: string;
  sender: "user" | "bot";
  content: string;
  timestamp: string;
  isNew?: boolean;
}

interface Session {
  id: string;
  clientName: string | null;
  clientPhone: string | null;
  status: string;
}

interface ChatAreaProps {
  sessionId: string | null;
  activeSession: Session | null;
  messages: Message[];
  isAIPaused: boolean;
  soundEnabled: boolean;
  manualMessage: string;
  onToggleSound: () => void;
  onManualMessageChange: (msg: string) => void;
  onSendManual: () => void;
  onArchive: () => void;
  onDeleteAll: () => void;
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

function formatTime(ts: string): string {
  try {
    return format(new Date(ts), "HH:mm", { locale: ptBR });
  } catch {
    return ts;
  }
}

export default function ChatArea({
  sessionId,
  activeSession,
  messages,
  isAIPaused,
  soundEnabled,
  manualMessage,
  onToggleSound,
  onManualMessageChange,
  onSendManual,
  onArchive,
  onDeleteAll,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isCompleted = activeSession?.status === "COMPLETED";
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 text-zinc-400">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <Bot size={28} className="opacity-30" />
        </div>
        <p className="text-sm font-medium">Selecione uma sessão</p>
        <p className="text-xs mt-1 opacity-60">Escolha uma conversa à esquerda para monitorar</p>
      </div>
    );
  }

  const [bg, fg] = getAvatarColors(activeSession?.clientName ?? null);

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: bg, color: fg }}
          >
            {getInitials(activeSession?.clientName ?? null)}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              {activeSession?.clientName || "Cliente"}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              {!isCompleted ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <Wifi size={10} /> Em atendimento
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
                  <WifiOff size={10} /> Arquivada
                </span>
              )}
              <span className="text-zinc-300 text-xs">•</span>
              <span className="text-[11px] text-zinc-400">
                {activeSession?.clientPhone || "WhatsApp"}
              </span>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5">
          {isAIPaused && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
              <PauseCircle size={10} /> IA Pausada
            </span>
          )}
          <button
            onClick={onToggleSound}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
              soundEnabled
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            Som
          </button>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
          >
            <ExternalLink size={12} />
            CRM
          </button>
          {!isCompleted && (
            <button
              onClick={onArchive}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
            >
              <Archive size={12} /> Arquivar
            </button>
          )}
          <button
            onClick={onDeleteAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg text-white transition-colors"
            style={{ background: "rgba(220,38,38,0.12)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.20)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.20)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.12)"; }}
          >
            <Trash2 size={12} /> Apagar Todos
          </button>
        </div>
      </div>

      {/* Área de Mensagens */}
      <div
        className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4"
        style={{ background: "#F6F6F7" }}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center">
              <Bot size={24} strokeWidth={1.5} />
            </div>
            <p className="text-xs font-medium">Aguardando mensagens...</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === "user";
            const isLog = !isUser && /^\[[A-Z_]+(?:[:\]])/s.test(msg.content.trim());
            const isExpanded = expandedLogs[msg.id] || false;

            return (
              <motion.div
                key={msg.id}
                initial={msg.isNew ? { opacity: 0, y: 10, scale: 0.97 } : { opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={msg.isNew ? { type: "spring", stiffness: 320, damping: 22 } : { duration: 0 }}
                className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Ícone */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5 ${
                    isUser ? "bg-zinc-200" : ""
                  }`}
                  style={!isUser ? { background: "rgba(220,38,38,0.12)" } : undefined}
                >
                  {isUser
                    ? <User size={13} className="text-zinc-500" />
                    : <Bot size={13} style={{ color: "#dc2626" }} />}
                </div>

                {/* Bolha */}
                <div className={`relative flex flex-col max-w-[72%] ${isUser ? "items-end" : "items-start"}`}>
                  {/* Glow em mensagem nova do user */}
                  {msg.isNew && isUser && (
                    <motion.div
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 1.8 }}
                      className="absolute inset-0 rounded-2xl blur-lg"
                      style={{ background: "rgba(220,38,38,0.25)" }}
                    />
                  )}
                  <div
                    className="px-4 py-2.5 text-[13px] leading-relaxed relative"
                    style={
                      isUser
                        ? {
                            background: "linear-gradient(135deg, #991b1b, #dc2626)",
                            color: "#ffffff",
                            borderRadius: "1.15rem 1.15rem 0.2rem 1.15rem",
                            boxShadow: "0 2px 10px rgba(220,38,38,0.25)",
                            wordBreak: "break-word",
                          }
                        : {
                            background: "#ffffff",
                            color: "#27272a",
                            borderRadius: "1.15rem 1.15rem 1.15rem 0.2rem",
                            border: "1px solid #e4e4e7",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                            wordBreak: "break-word",
                          }
                    }
                  >
                    {isLog ? (
                      <div className="flex flex-col gap-1.5 min-w-[180px]">
                        <button 
                          onClick={() => setExpandedLogs(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                          className="flex items-center gap-1.5 text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
                          style={{ color: "#dc2626" }}
                        >
                          <Code size={14} /> 
                          {isExpanded ? "Ocultar Log" : "Log Oculto (Sistema)"}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 p-2 bg-zinc-50 border border-zinc-200 rounded text-[11px] font-mono text-zinc-600 max-h-64 overflow-y-auto block whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                  <span
                    className="text-[9px] mt-1 px-1 font-medium"
                    style={{ color: "rgba(113,113,122,0.7)" }}
                  >
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-zinc-100 shrink-0">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background: "#f4f4f5", border: "1px solid #e4e4e7" }}
        >
          {/* Status IA */}
          <div
            className="flex items-center gap-1.5 flex-shrink-0"
            style={{ color: isAIPaused ? "#f59e0b" : "#16a34a" }}
          >
            <Bot size={14} />
            <span className="text-[10px] font-semibold whitespace-nowrap">
              {isAIPaused ? "IA pausada" : "IA ativa"}
            </span>
          </div>
          <div className="w-px h-4 bg-zinc-300 flex-shrink-0" />
          <input
            type="text"
            value={manualMessage}
            onChange={(e) => onManualMessageChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSendManual()}
            placeholder={
              isCompleted
                ? "Conversa arquivada (somente leitura)"
                : !isAIPaused
                ? "Pause a IA para enviar mensagem manual..."
                : "Digite uma mensagem manual..."
            }
            disabled={isCompleted || !isAIPaused}
            className="flex-1 bg-transparent text-xs text-zinc-800 placeholder:text-zinc-400 outline-none py-1.5 px-1 disabled:opacity-50"
          />
          <button
            disabled={isCompleted || !isAIPaused || !manualMessage.trim()}
            onClick={onSendManual}
            className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center transition-all ${
              !isAIPaused || isCompleted ? "opacity-40 cursor-not-allowed" : "hover:opacity-90 shadow-sm"
            }`}
            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
