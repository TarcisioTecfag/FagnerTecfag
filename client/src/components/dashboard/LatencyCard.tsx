import DashboardCard from "./DashboardCard";
import { useStatsData, periodToDates } from "./useStatsData";

const legend = [
  { label: "≤1.5s Rápido", color: "bg-success" },
  { label: "1.5–3s Médio", color: "bg-warning" },
  { label: ">3s Lento",    color: "bg-destructive" },
];

const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const latColor = (ms: number) =>
  ms === 0 ? "text-muted-foreground" : ms <= 1500 ? "text-success" : ms <= 3000 ? "text-warning" : "text-destructive";

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-green))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const LatencyCard = ({ period = "14d", delay = 0 }: { period?: string; delay?: number }) => {
  const { dateFrom, dateTo } = periodToDates(period);
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const { data, loading } = useStatsData<{
    p50: number; p90: number; p95: number; avgMs: number;
    byDay: { day: number; label: string; avgMs: number }[];
  }>(`/api/livechat/stats/ai-latency?${qs}`);

  const metrics = [
    { label: "P50 (Mediana)", value: data?.p50 ?? 0, desc: "Metade das respostas abaixo desse tempo" },
    { label: "P90",           value: data?.p90 ?? 0, desc: "90% das respostas abaixo desse tempo" },
    { label: "P95 (Pior 5%)", value: data?.p95 ?? 0, desc: "Apenas 5% acima desse tempo" },
  ];

  const byDay = data?.byDay ?? [];
  const dayMax = Math.max(...byDay.map((d) => d.avgMs), 1);

  return (
    <DashboardCard
      title="Latência P95 do Fagner"
      subtitle="Tempo de resposta da IA — calculado via sentAt"
      icon={<ClockIcon />}
      iconBg="bg-chart-green/10"
      delay={delay}
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-border p-5 text-center hover:border-primary/30 transition-colors group">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <p className={`text-3xl font-bold mt-2 ${latColor(m.value)}`}>{fmtMs(m.value)}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">{m.desc}</p>
              </div>
            ))}
          </div>

          {byDay.some((d) => d.avgMs > 0) && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Média por Dia da Semana</p>
              <div className="flex items-end gap-1.5 h-16 bg-muted/40 rounded-xl px-3 pt-2 pb-1">
                {byDay.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end" title={`${d.label}: ${fmtMs(d.avgMs)}`}>
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: d.avgMs > 0 ? `${Math.max((d.avgMs / dayMax) * 40, 4)}px` : 0,
                        background: d.avgMs <= 1500 ? "hsl(var(--chart-green))" : d.avgMs <= 3000 ? "hsl(var(--warning))" : "hsl(var(--destructive))",
                        opacity: 0.85,
                      }}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-8">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${l.color}`} />
                <span className="text-sm text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </DashboardCard>
  );
};

export default LatencyCard;
