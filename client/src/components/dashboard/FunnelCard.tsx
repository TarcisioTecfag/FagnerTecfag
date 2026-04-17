import { useState } from "react";
import { createPortal } from "react-dom";
import DashboardCard from "./DashboardCard";
import { useStatsData, periodToDates } from "./useStatsData";

// Paleta HSL explícita para garantir renderização correta quando tokens CSS não resolvem
const COLORS = [
  "hsl(262, 83%, 58%)",  // purple
  "hsl(217, 91%, 60%)",  // blue
  "hsl(35, 95%, 55%)",   // orange
  "hsl(142, 71%, 45%)",  // green (success)
  "hsl(48, 96%, 53%)",   // yellow (warning)
];

// Mapa: índice da etapa → chave para o endpoint drill-down
const STEP_KEYS = ["sessao", "mensagem", "dados", "crm"];

// Labels descritivos para cada etapa
const STEP_DESCS: Record<string, string> = {
  sessao:   "Todos os visitantes que iniciaram uma sessão no site.",
  mensagem: "Visitantes que enviaram pelo menos 1 mensagem no chat.",
  dados:    "Visitantes que informaram nome e dados de contato.",
  crm:      "Visitantes que geraram um card no RD Station CRM.",
};

const FunnelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(262, 83%, 58%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

function categoryLabel(cat: string): { emoji: string; label: string } {
  switch (cat) {
    case "lead_hot":  return { emoji: "🔴", label: "Lead Quente" };
    case "lead_warm": return { emoji: "🟡", label: "Lead Morno" };
    case "customer":  return { emoji: "⭐", label: "Cliente" };
    default:          return { emoji: "🟢", label: "Visitante" };
  }
}

// ── Slide Panel de Drill-down ───────────────────────────────────────────────
interface DrillDownPanelProps {
  step: string;
  stepLabel: string;
  stepColor: string;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
  onNavigate?: (visitorId: string) => void;
}

function DrillDownPanel({ step, stepLabel, stepColor, dateFrom, dateTo, onClose }: DrillDownPanelProps) {
  const qs = new URLSearchParams({ step, dateFrom, dateTo });
  const { data, loading } = useStatsData<any[]>(`/api/livechat/stats/funnel-visitors?${qs}`);
  const visitors = Array.isArray(data) ? data : [];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 w-[420px] bg-white shadow-2xl flex flex-col border-l border-border"
        style={{ animation: "slideInRight 0.22s cubic-bezier(.4,0,.2,1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0" style={{ borderTop: `3px solid ${stepColor}` }}>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Etapa do Funil</p>
            <h3 className="text-base font-bold text-card-foreground">{stepLabel}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{STEP_DESCS[step]}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : visitors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">Nenhum visitante encontrado</p>
              <p className="text-xs mt-1">Tente ampliar o período de análise</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3 font-medium">{visitors.length} visitante{visitors.length !== 1 ? 's' : ''} encontrado{visitors.length !== 1 ? 's' : ''} (máx. 100)</p>
              {visitors.map((v: any, i: number) => {
                const cat = categoryLabel(v.category ?? "visitor");
                const name = v.posVendaNome || v.name || "Não identificado";
                const isCrmStep = step === 'crm';

                const handleOpenInCRM = () => {
                  window.dispatchEvent(new CustomEvent('fagner:open-visitor', { detail: { visitorId: v.id } }));
                };

                return (
                  <div
                    key={v.id ?? i}
                    className="p-3 rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all bg-card group"
                  >
                    {/* Nome + localização */}
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-card-foreground truncate">
                          {cat.emoji} {name}
                        </p>
                        {v.posVendaTelefone && (
                          <p className="text-xs text-muted-foreground mt-0.5">📞 {v.posVendaTelefone}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                      <span>{v.city ? `${v.city}${v.country ? `, ${v.country}` : ''}` : ''}</span>
                      <span>{timeAgo(v.lastSeenAt)}</span>
                    </div>

                    {/* Barra de engajamento */}
                    <div className="mb-2.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(Number(v.engagementScore) || 0, 100)}%`,
                          backgroundColor: (Number(v.engagementScore) || 0) >= 70 ? 'hsl(0,85%,60%)' : (Number(v.engagementScore) || 0) >= 40 ? 'hsl(40,95%,55%)' : 'hsl(142,71%,45%)',
                        }}
                      />
                    </div>

                    {/* ── Botões de ação ──────────────────────────────── */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* ABRIR NO RD — somente na etapa "Lead no CRM" e se tiver dealId */}
                      {isCrmStep && v.rdCrmDealId && (
                        <a
                          href={`https://crm.rdstation.com/app/deals/${v.rdCrmDealId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all hover:shadow-sm"
                          style={{
                            background: 'linear-gradient(135deg, hsl(217,91%,97%), hsl(217,91%,93%))',
                            borderColor: 'hsl(217,91%,75%)',
                            color: 'hsl(217,91%,40%)',
                          }}
                          title={`Abrir deal ${v.rdCrmDealId} no RD Station CRM`}
                        >
                          🔗 ABRIR NO RD
                        </a>
                      )}

                      {/* ABRIR NO CRM — para todos os cards com ou sem dealId */}
                      <button
                        onClick={handleOpenInCRM}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all hover:shadow-sm"
                        style={{
                          background: 'linear-gradient(135deg, hsl(262,83%,97%), hsl(262,83%,93%))',
                          borderColor: 'hsl(262,83%,75%)',
                          color: 'hsl(262,83%,40%)',
                        }}
                        title="Abrir visitante no sistema interno"
                      >
                        👤 ABRIR NO CRM
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>,
    document.body
  );
}

// ── FunnelCard principal ────────────────────────────────────────────────────
const FunnelCard = ({ period = "14d", delay = 0 }: { period?: string; delay?: number }) => {
  const { dateFrom, dateTo } = periodToDates(period);
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const { data, loading } = useStatsData<{
    steps: { label: string; count: number; pct: number }[];
  }>(`/api/livechat/stats/funnel?${qs}`);

  const steps = data?.steps ?? [];
  const top = steps[0]?.count ?? 0;
  const bottom = steps[steps.length - 1];

  const overallRate = top > 0 && bottom?.count > 0
    ? ((bottom.count / top) * 100).toFixed(1)
    : null;

  // Estado do tooltip hover (por step)
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  // Estado do drill-down panel
  const [drillStep, setDrillStep] = useState<{ idx: number; label: string } | null>(null);

  return (
    <>
      <DashboardCard
        title="Funil de Conversão do Chat"
        subtitle="Clique em uma etapa para ver os visitantes"
        icon={<FunnelIcon />}
        iconBg="bg-chart-purple/10"
        delay={delay}
      >
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : steps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Sem dados para o período.</p>
        ) : (
          <>
            {/* Resumo */}
            <div className="flex items-center gap-6 mb-6 pb-5 border-b border-border">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Volume Total</p>
                <p className="text-2xl font-bold text-card-foreground">{top.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground">sessões no período</p>
              </div>
              {overallRate && (
                <>
                  <div className="text-muted-foreground/30 text-xl">→</div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Conversão Final</p>
                    <p className="text-2xl font-bold" style={{ color: "hsl(142, 71%, 45%)" }}>{overallRate}%</p>
                    <p className="text-xs text-muted-foreground">sessão → lead no CRM</p>
                  </div>
                </>
              )}
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {steps.map((step, i) => {
                const prev = steps[i - 1];
                const isEmpty = step.count === 0;
                const logWidth = top > 0 && step.count > 0
                  ? Math.max(4, (Math.log(step.count + 1) / Math.log(top + 1)) * 100)
                  : 0;
                const conversionFromPrev = prev && prev.count > 0 && step.count > 0 && step.count <= prev.count
                  ? Math.round((step.count / prev.count) * 100)
                  : null;
                const drop = prev && prev.count > 0 && step.count > 0 && step.count <= prev.count
                  ? -Math.round(((prev.count - step.count) / prev.count) * 100)
                  : null;
                const color = COLORS[i] ?? "hsl(220, 10%, 55%)";
                const stepKey = STEP_KEYS[i] ?? "sessao";
                const isHovered = hoveredStep === i;

                return (
                  <div
                    key={step.label}
                    className={`relative ${isEmpty ? "opacity-40" : ""}`}
                    onMouseEnter={() => setHoveredStep(i)}
                    onMouseLeave={() => setHoveredStep(null)}
                  >
                    {/* Label row */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold"
                          style={{ backgroundColor: isEmpty ? "hsl(220,10%,88%)" : color + "22", color: isEmpty ? "hsl(220,10%,60%)" : color }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-card-foreground">{step.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {i > 0 && drop !== null && drop < 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                            {drop}% do anterior
                          </span>
                        )}
                        {i > 0 && conversionFromPrev !== null && (
                          <span className="text-[11px] text-muted-foreground">
                            ({conversionFromPrev}% converteram)
                          </span>
                        )}
                        <span className={`text-base font-bold min-w-[52px] text-right ${isEmpty ? "text-muted-foreground" : "text-card-foreground"}`}>
                          {isEmpty ? "—" : step.count.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>

                    {/* Barra clicável */}
                    <div
                      className={`relative h-7 w-full rounded-lg bg-muted overflow-hidden cursor-pointer transition-all duration-200 ${isHovered ? 'ring-2 ring-offset-1' : ''}`}
                      style={isHovered ? { ringColor: color } : {}}
                      onClick={() => !isEmpty && setDrillStep({ idx: i, label: step.label })}
                      title={`Clique para ver os ${step.count.toLocaleString('pt-BR')} visitantes desta etapa`}
                    >
                      {isEmpty ? (
                        <div className="h-full w-full flex items-center px-3">
                          <span className="text-xs text-muted-foreground/40 italic">sem dados</span>
                        </div>
                      ) : (
                        <>
                          <div
                            className="h-full rounded-lg transition-all duration-1000 ease-out"
                            style={{ width: `${logWidth}%`, backgroundColor: color, opacity: isHovered ? 1 : 0.85 }}
                          />
                          {/* Label "ver" ao hover */}
                          {isHovered && (
                            <div className="absolute inset-0 flex items-center justify-end pr-3">
                              <span className="text-[11px] font-semibold text-white bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                👁 ver lista
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Tooltip hover */}
                    {isHovered && !isEmpty && (
                      <div
                        className="absolute left-0 bottom-full mb-2 z-30 w-60 bg-zinc-900 text-white rounded-xl shadow-xl p-3 pointer-events-none"
                        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
                      >
                        <div className="absolute -bottom-1.5 left-8 w-3 h-3 bg-zinc-900 rotate-45 rounded-sm" />
                        <p className="text-[12px] font-bold mb-2" style={{ color }}>{step.label}</p>
                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-[11px] text-zinc-400">Visitantes nesta etapa</span>
                            <span className="text-[11px] font-bold text-white">{step.count.toLocaleString("pt-BR")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[11px] text-zinc-400">% do total</span>
                            <span className="text-[11px] font-bold text-white">{step.pct}%</span>
                          </div>
                          {i > 0 && drop !== null && (
                            <div className="flex justify-between">
                              <span className="text-[11px] text-zinc-400">Queda vs etapa anterior</span>
                              <span className="text-[11px] font-bold text-red-400">{drop}%</span>
                            </div>
                          )}
                          {i > 0 && conversionFromPrev !== null && (
                            <div className="flex justify-between">
                              <span className="text-[11px] text-zinc-400">Aproveitamento</span>
                              <span className="text-[11px] font-bold text-emerald-400">{conversionFromPrev}%</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2 italic">Clique para ver visitantes</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DashboardCard>

      {/* Drill-down slide panel */}
      {drillStep !== null && (
        <DrillDownPanel
          step={STEP_KEYS[drillStep.idx]}
          stepLabel={drillStep.label}
          stepColor={COLORS[drillStep.idx] ?? "hsl(262,83%,58%)"}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setDrillStep(null)}
        />
      )}
    </>
  );
};

export default FunnelCard;
