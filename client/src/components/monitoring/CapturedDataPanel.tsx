import { motion } from "framer-motion";
import {
  Phone, User, Building2, FileText, Star, Package, TrendingUp, StickyNote,
  CheckCircle2, Circle, ClipboardList, AlertTriangle
} from "lucide-react";

interface ChecklistField {
  key: string;
  label: string;
  icon: React.ElementType;
}

const checklistFields: ChecklistField[] = [
  { key: "telefone",                 label: "Telefone (WhatsApp)",       icon: Phone },
  { key: "nome_completo",            label: "Nome Completo",             icon: User },
  { key: "cnpj_empresa",             label: "CNPJ da Empresa",           icon: Building2 },
  { key: "razao_social",             label: "Razão Social",              icon: FileText },
  { key: "nome_fantasia",            label: "Nome Fantasia",             icon: Building2 },
  { key: "qualificacao_sdr",         label: "Qualificação SDR",          icon: Star },
  { key: "tipo_produto",             label: "Tipo de Produto",           icon: Package },
  { key: "projetos_desenvolvimento", label: "Projetos / Desenvolvimento",icon: TrendingUp },
  { key: "nivel_interesse",          label: "Nível de Interesse",        icon: AlertTriangle },
];

interface CapturedDataPanelProps {
  sessionId: string | null;
  capturedData: string | null;
  clientPhone: string | null;
  annotation?: string | null;
}

export default function CapturedDataPanel({ sessionId, capturedData, clientPhone, annotation }: CapturedDataPanelProps) {
  // Montar objeto de dados a partir do JSON
  const parsed = (() => {
    try {
      return capturedData ? JSON.parse(capturedData) : {};
    } catch {
      return {};
    }
  })();

  const dataMap: Record<string, string | null> = {
    telefone: clientPhone || parsed?.telefone || null,
    nome_completo: parsed?.nome_completo || null,
    cnpj_empresa: parsed?.cnpj_empresa || null,
    razao_social: parsed?.razao_social || null,
    nome_fantasia: parsed?.nome_fantasia || null,
    qualificacao_sdr: parsed?.qualificacao_sdr || null,
    tipo_produto: parsed?.tipo_produto || null,
    projetos_desenvolvimento: parsed?.projetos_desenvolvimento || null,
    nivel_interesse: parsed?.nivel_interesse || null,
  };

  const filledCount = checklistFields.filter(({ key }) => {
    const v = dataMap[key];
    return v !== null && v !== "" && v !== "null";
  }).length;

  const progress = Math.round((filledCount / checklistFields.length) * 100);

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white text-zinc-400 p-6">
        <StickyNote size={24} className="opacity-30 mb-2" />
        <span className="text-xs">Dados aparecerão aqui</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(220,38,38,0.10)" }}>
            <ClipboardList size={12} className="text-red-600" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">Dados Captados</h3>
        </div>
        <p className="text-[11px] text-zinc-400 mt-1">Informações coletadas durante a triagem</p>

        {/* Barra de progresso */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Completude</span>
            <span className="text-xs font-semibold text-zinc-700">{filledCount}/{checklistFields.length}</span>
          </div>
          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{
                background:
                  progress === 100
                    ? "#22c55e"
                    : progress >= 55
                    ? "#f59e0b"
                    : "#dc2626",
              }}
            />
          </div>
        </div>
      </div>

      {/* Lista de Campos */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
        {checklistFields.map((field, i) => {
          const { key, label, icon: Icon } = field;
          const value = dataMap[key];
          const isFilled = value !== null && value !== "" && value !== "null";
          const razaoPresent = !!(dataMap.razao_social && dataMap.razao_social !== "null");
          const isNaoRegistrado = key === "nome_fantasia" && !isFilled && razaoPresent;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                isFilled
                  ? "bg-white hover:bg-zinc-50"
                  : "hover:bg-zinc-50/60"
              }`}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={isFilled ? { background: "rgba(220,38,38,0.08)" } : { background: "#f4f4f5" }}
              >
                <Icon size={13} style={{ color: isFilled ? "#dc2626" : "#a1a1aa" }} />
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                  {label}
                </span>
                <span
                  className={`text-xs block truncate font-medium ${
                    isFilled ? "text-zinc-900" : isNaoRegistrado ? "text-zinc-400" : "text-zinc-400 italic"
                  }`}
                >
                  {isFilled ? value : isNaoRegistrado ? "Não cadastrada" : "Aguardando..."}
                </span>
              </div>

              <div className="flex-shrink-0">
                {isFilled ? (
                  <CheckCircle2 size={13} style={{ color: "#dc2626" }} />
                ) : isNaoRegistrado ? (
                  <CheckCircle2 size={13} className="text-zinc-300" />
                ) : (
                  <Circle size={11} className="text-zinc-200" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Anotação de IA */}
      <div
        className="px-4 py-3 border-t border-zinc-100"
        style={{ background: annotation ? "rgba(220,38,38,0.04)" : "rgba(220,38,38,0.02)" }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <ClipboardList size={11} style={{ color: annotation ? "#dc2626" : "#a1a1aa" }} />
          <span
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: annotation ? "#991b1b" : "#a1a1aa" }}
          >
            Anotação de I.A.
          </span>
          {annotation
            ? <CheckCircle2 size={11} style={{ color: "#dc2626" }} className="ml-auto" />
            : <Circle size={10} className="text-zinc-300 ml-auto" />}
        </div>
        <p className={`text-[11px] leading-relaxed ${annotation ? "text-zinc-700 whitespace-pre-wrap" : "text-zinc-400 italic"}`}>
          {annotation || "Aguardando resumo ao concluir..."}
        </p>
      </div>

      {/* Nota de rodapé */}
      <div className="px-4 py-2.5 bg-zinc-50 border-t border-zinc-100">
        <p className="text-[9px] text-zinc-400 text-center leading-relaxed">
          Dados extraídos automaticamente pela I.A.<br />A transferência ocorre ao concluir o atendimento.
        </p>
      </div>
    </div>
  );
}
