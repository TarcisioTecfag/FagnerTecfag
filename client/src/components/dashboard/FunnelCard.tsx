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
  const top = steps[0]?.count ?? 0;

  return (
    <DashboardCard
      title="Funil de Conversão do Chat"
      subtitle="Sessão → Lead no CRM — onde ocorre a queda"
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
        <div className="space-y-5">
          {steps.map((step, i) => {
            // Largura: proporcional ao primeiro passo, mínimo 2% se count > 0
            const width = top > 0 && step.count > 0
              ? Math.max(2, (step.count / top) * 100)
              : 0;

            const prev = steps[i - 1];
            // Exibe badge de queda só quando ambos os passos têm dados reais
            const drop = prev && prev.count > 0 && step.count > 0
              ? -Math.round(((prev.count - step.count) / prev.count) * 100)
              : null;

            const color = COLORS[i] ?? "hsl(220, 10%, 55%)";
            const isEmpty = step.count === 0;

            return (
              <div key={step.label} className={isEmpty ? "opacity-50" : ""}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-card-foreground">{step.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Badge de queda: só aparece quando há dados válidos nos dois passos */}
                    {drop !== null && drop < 0 && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                        {drop}%
                      </span>
                    )}
                    <span className={`text-base font-bold min-w-[60px] text-right ${isEmpty ? "text-muted-foreground" : "text-card-foreground"}`}>
                      {isEmpty ? "—" : step.count.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
                {/* Barra de progresso com cor explícita via inline style */}
                <div className="relative h-9 w-full rounded-lg bg-muted overflow-hidden">
                  {isEmpty ? (
                    // Barra vazia com padrão tracejado para indicar dado ausente
                    <div className="h-full w-full flex items-center px-3">
                      <span className="text-xs text-muted-foreground/50 italic">sem dados</span>
                    </div>
                  ) : (
                    <div
                      className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center justify-end pr-3"
                      style={{ width: `${width}%`, backgroundColor: color }}
                    >
                      {width > 12 && (
                        <span className="text-xs font-bold text-white">{step.pct}%</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
};

export default FunnelCard;
