// client/src/components/FlowMonitor.tsx
// Monitor em tempo real das sessões ativas do Fagner
// Exibe fluxo, subfluxo, dados coletados, resultados de crédito e link para CRM

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  User, Building2, Phone, Hash, CreditCard, FileText,
  Activity, Clock, Pause, CheckCircle2, Loader2, RefreshCw,
  AlertTriangle, ExternalLink, Mic, Image as ImageIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SerializedSession {
  contactId: string;
  contactPhone?: string;
  currentFlow?: number;
  currentSubFlow?: string;
  flowStep: number;
  sessionMood: string;
  isCompleted: boolean;
  isProcessing: boolean;
  isPaused: boolean;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  followUpCount: number;
  flowData: {
    clientName?: string;
    clientCnpj?: string;
    clientCpf?: string;
    companyName?: string;
    productType?: string;
    productVolume?: string;
    interestLevel?: string;
    isNewClient?: boolean;
    creditEligible?: boolean;
    hasProtests?: boolean;
    paymentMode?: string;
    problemDescription?: string;
    orderNumber?: string;
    notes?: string;
  };
  mediaMemoryCount: number;
  productNotesCount: number;
  hasCnpjData: boolean;
}

// ─── Flow label map ───────────────────────────────────────────────────────────

const FLOW_LABELS: Record<number, string> = {
  1: "Vendas",
  2: "Financeiro",
  3: "Assistência Técnica",
  4: "Pós Venda",
  5: "Outros",
};

const SUBFLOW_LABELS: Record<string, string> = {
  PECAS:         "Peças",
  MAQUINAS:      "Máquinas",
  PERSONNALITE:  "Personnalite",
  "2A_BOLETO":   "Boleto / 2ª via",
  "2B_NF":       "Nota Fiscal",
  "2C_OUTROS":   "Outros Fin.",
  "3_AT":        "Assistência Técnica",
  "4A_RASTREAR": "Rastrear Pedido",
  "4B_NF":       "NF do Pedido",
  "5A_CLIENTE":  "Cliente",
  "5B_CURRICULO":"Currículo",
};

const MOOD_EMOJI: Record<string, string> = {
  Mentor:       "🧑‍🏫",
  Consultivo:   "💼",
  Entusiasmado: "🔥",
  Analítico:    "🔬",
  Empático:     "🤝",
  Assertivo:    "⚡",
  Curioso:      "🔍",
};

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: SerializedSession }) {
  const sinceLastMsg = Math.floor(
    (Date.now() - new Date(session.lastMessageAt).getTime()) / 1000
  );
  const durationMin = Math.floor(
    (Date.now() - new Date(session.createdAt).getTime()) / 60000
  );

  const statusColor = session.isCompleted
    ? "bg-zinc-100 text-zinc-500 border-zinc-200"
    : session.isPaused
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : session.isProcessing
    ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";

  const statusLabel = session.isCompleted
    ? "Finalizado"
    : session.isPaused
    ? "Pausado"
    : session.isProcessing
    ? "Processando..."
    : "Ativo";

  const StatusIcon = session.isCompleted
    ? CheckCircle2
    : session.isPaused
    ? Pause
    : session.isProcessing
    ? Loader2
    : Activity;

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
        session.isCompleted ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: "linear-gradient(135deg, #fafafa, #fff5f5)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #ef4444, #991b1b)" }}
          >
            {session.flowData.clientName
              ? session.flowData.clientName.charAt(0).toUpperCase()
              : "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-800 truncate">
              {session.flowData.clientName ?? session.contactId.slice(0, 12) + "…"}
            </p>
            {session.contactPhone && (
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Phone size={9} /> {session.contactPhone}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-base" title={`Humor: ${session.sessionMood}`}>
            {MOOD_EMOJI[session.sessionMood] ?? "🤖"}
          </span>
          <span
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}
          >
            <StatusIcon size={9} className={session.isProcessing ? "animate-spin" : ""} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Flow info */}
      <div className="px-4 py-2 border-t border-red-50 flex items-center gap-2 flex-wrap">
        {session.currentFlow && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-100">
            Fluxo {session.currentFlow} · {FLOW_LABELS[session.currentFlow] ?? "—"}
          </span>
        )}
        {session.currentSubFlow && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
            {SUBFLOW_LABELS[session.currentSubFlow] ?? session.currentSubFlow}
          </span>
        )}
        {!session.currentFlow && (
          <span className="text-[11px] text-zinc-400 italic">Triagem em andamento...</span>
        )}
      </div>

      {/* Data collected */}
      <div className="px-4 py-3 space-y-1.5">
        {session.flowData.companyName && (
          <DataRow icon={Building2} label="Empresa" value={session.flowData.companyName} />
        )}
        {session.flowData.clientCnpj && (
          <DataRow
            icon={Hash}
            label="CNPJ"
            value={session.flowData.clientCnpj}
            badge={session.hasCnpjData ? "Verificado ✓" : "Aguardando"}
            badgeColor={session.hasCnpjData ? "emerald" : "amber"}
          />
        )}
        {session.flowData.clientCpf && (
          <DataRow icon={Hash} label="CPF" value={session.flowData.clientCpf} />
        )}
        {session.flowData.productType && (
          <DataRow icon={FileText} label="Interesse" value={session.flowData.productType} />
        )}
        {session.flowData.orderNumber && (
          <DataRow icon={Hash} label="Pedido" value={session.flowData.orderNumber} />
        )}

        {/* Crédito */}
        {session.flowData.creditEligible !== undefined && (
          <div className="flex items-center gap-2 mt-1">
            <CreditCard size={12} className="shrink-0 text-zinc-400" />
            <span className="text-[11px] text-zinc-500 font-medium">Crédito:</span>
            {session.flowData.creditEligible ? (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
                Elegível
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">
                À vista / Cartão
              </span>
            )}
            {session.flowData.hasProtests && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100 flex items-center gap-0.5">
                <AlertTriangle size={8} /> Protestos
              </span>
            )}
          </div>
        )}

        {/* Mídia */}
        {(session.mediaMemoryCount > 0 || session.productNotesCount > 0) && (
          <div className="flex items-center gap-2 pt-0.5">
            {session.mediaMemoryCount > 0 && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Mic size={9} />/<ImageIcon size={9} /> {session.mediaMemoryCount} mídia
              </span>
            )}
            {session.productNotesCount > 0 && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                • {session.productNotesCount} produto(s) identificado(s)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 flex items-center justify-between border-t border-zinc-50 text-[10px] text-zinc-400"
        style={{ background: "rgba(249,250,251,0.6)" }}
      >
        <span className="flex items-center gap-1">
          <Clock size={9} />
          {durationMin < 1 ? "Agora" : `${durationMin}min`}
          {" · "}{session.messageCount} msg
          {session.followUpCount > 0 && ` · ${session.followUpCount}× follow-up`}
        </span>
        <span className="text-[9px] font-mono opacity-50">
          última: {sinceLastMsg < 60 ? `${sinceLastMsg}s` : `${Math.floor(sinceLastMsg / 60)}min`}
        </span>
      </div>
    </div>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
  badge,
  badgeColor = "zinc",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  badge?: string;
  badgeColor?: string;
}) {
  const badgeStyles: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber:   "bg-amber-50 text-amber-700 border-amber-100",
    zinc:    "bg-zinc-100 text-zinc-600 border-zinc-200",
  };

  return (
    <div className="flex items-center gap-2">
      <Icon size={11} className="shrink-0 text-zinc-400" />
      <span className="text-[11px] text-zinc-500 font-medium shrink-0">{label}:</span>
      <span className="text-[11px] text-zinc-700 font-semibold truncate">{value}</span>
      {badge && (
        <span className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${badgeStyles[badgeColor]}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ sessions }: { sessions: SerializedSession[] }) {
  const active    = sessions.filter((s) => !s.isCompleted && !s.isPaused).length;
  const paused    = sessions.filter((s) => s.isPaused).length;
  const completed = sessions.filter((s) => s.isCompleted).length;
  const withCnpj  = sessions.filter((s) => !!s.flowData.clientCnpj).length;

  const stats = [
    { label: "Ativos",      value: active,    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
    { label: "Pausados",    value: paused,    color: "text-amber-600",   bg: "bg-amber-50 border-amber-100" },
    { label: "Finalizados", value: completed, color: "text-zinc-600",    bg: "bg-zinc-100 border-zinc-200" },
    { label: "Com CNPJ",    value: withCnpj,  color: "text-blue-600",    bg: "bg-blue-50 border-blue-100" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded-lg border px-3 py-2 flex flex-col items-center ${s.bg}`}
        >
          <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
          <span className="text-[10px] text-zinc-500 font-medium">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FlowMonitor() {
  const { data: sessions, isLoading, refetch, dataUpdatedAt } = useQuery<SerializedSession[]>({
    queryKey: ["/api/fagner/sessions"],
    refetchInterval: 5_000,
    queryFn: async () => {
      const res = await fetch("/api/fagner/sessions", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar sessões");
      return res.json();
    },
  });

  const sorted = [...(sessions ?? [])].sort((a, b) => {
    // Ativas primeiro, depois pausadas, depois finalizadas
    const order = (s: SerializedSession) =>
      s.isCompleted ? 3 : s.isPaused ? 2 : 1;
    return order(a) - order(b);
  });

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-zinc-700">Monitor de Fluxos</p>
          <p className="text-[11px] text-zinc-400">
            Sessões em memória · Atualiza a cada 5s · Última atualização: {lastUpdate}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-800 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
        >
          <RefreshCw size={11} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      {sessions && <StatsBar sessions={sessions} />}

      {/* Sessions Grid */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-thumb]:rounded-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="animate-spin text-zinc-300" size={28} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-400 text-sm">
            <Activity size={28} className="mb-2 opacity-30" />
            <p className="italic">Nenhuma sessão ativa no momento.</p>
            <p className="text-[11px] mt-1">O Fagner estará pronto para atender quando receber uma mensagem via RD Conversas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pr-1">
            {sorted.map((session) => (
              <SessionCard key={session.contactId} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
