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

const FunnelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(262, 83%, 58%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const FunnelCard = ({ period = "14d", delay = 0 }: { period?: string; delay?: number }) => {
  const { dateFrom, dateTo } = periodToDates(period);
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const { data, loading } = useStatsData<{
    steps: { label: string; count: number; pct: number }[];
  }>(`/api/livechat/stats/funnel?${qs}`);

  const steps = data?.steps ?? [];
  const top = steps[0]?.count ?? 0;        // volume total (escala)
  const bottom = steps[steps.length - 1];  // último step

  // Taxa de conversão total: primeiro → último
  const overallRate = top > 0 && bottom?.count > 0
    ? ((bottom.count / top) * 100).toFixed(1)
    : null;

  return (
    <DashboardCard
      title="Funil de Conversão do Chat"
      subtitle="Onde o visitante abandona antes de virar lead"
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
          {/* Resumo no topo: o que realmente importa */}
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

          {/* Steps: foco nas QUEDAS entre etapas, não no % da etapa 1 */}
          <div className="space-y-4">
            {steps.map((step, i) => {
              const prev = steps[i - 1];
              const isEmpty = step.count === 0;

              // Largura da barra: proporcional ao volume do step 1 (referência de escala)
              const width = top > 0 && step.count > 0
                ? Math.max(2, (step.count / top) * 100)
                : 0;

              // Taxa de conversão do STEP ANTERIOR para este (o que realmente importa)
              const conversionFromPrev = prev && prev.count > 0 && step.count > 0
                ? Math.round((step.count / prev.count) * 100)
                : null;

              // Queda (negativo = perda)
              const drop = prev && prev.count > 0 && step.count > 0
                ? -Math.round(((prev.count - step.count) / prev.count) * 100)
                : null;

              const color = COLORS[i] ?? "hsl(220, 10%, 55%)";

              return (
                <div key={step.label} className={isEmpty ? "opacity-40" : ""}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold"
                        style={{ backgroundColor: isEmpty ? "hsl(220,10%,88%)" : color + "22", color: isEmpty ? "hsl(220,10%,60%)" : color }}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-card-foreground">{step.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Queda relativa ao passo anterior — a métrica útil */}
                      {i > 0 && drop !== null && drop < 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                          {drop}% do anterior
                        </span>
                      )}
                      {/* Taxa de aproveitamento desse passo */}
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

                  <div className="relative h-7 w-full rounded-lg bg-muted overflow-hidden">
                    {isEmpty ? (
                      <div className="h-full w-full flex items-center px-3">
                        <span className="text-xs text-muted-foreground/40 italic">sem dados</span>
                      </div>
                    ) : (
                      <div
                        className="h-full rounded-lg transition-all duration-1000 ease-out"
                        style={{ width: `${width}%`, backgroundColor: color }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DashboardCard>
  );
};

export default FunnelCard;
