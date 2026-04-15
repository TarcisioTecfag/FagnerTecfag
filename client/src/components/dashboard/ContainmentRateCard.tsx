import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import DashboardCard from "./DashboardCard";
import { useStatsData, periodToDates } from "./useStatsData";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        <p className="text-sm font-semibold text-card-foreground">{d.icon} {d.name}</p>
        <p className="text-sm text-muted-foreground">{d.value} chats</p>
      </div>
    );
  }
  return null;
};

const ContainmentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-green))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" />
  </svg>
);

const ContainmentRateCard = ({ period = "14d", delay = 0 }: { period?: string; delay?: number }) => {
  const { dateFrom, dateTo } = periodToDates(period);
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const { data, loading } = useStatsData<{
    aiResolved: number; humanEscalated: number; abandoned: number;
    totalChats: number; containmentRate: number;
  }>(`/api/livechat/stats/containment?${qs}`);

  const ai    = data?.aiResolved       ?? 0;
  const human = data?.humanEscalated   ?? 0;

  // Taxa real: IA / (IA + Humano) — ignora abandonos que distorcem o denominador
  const activeChats = ai + human;
  const rate = activeChats > 0 ? Math.round((ai / activeChats) * 100) : 0;

  const chartData = [
    { name: "Resolvido pela IA",  value: ai,    icon: "🤖", color: "hsl(217, 91%, 60%)" },
    { name: "Escalado p/ Humano", value: human, icon: "👤", color: "hsl(48, 96%, 53%)"  },
  ];

  const benchCls   = rate >= 80 ? "bg-success/10 text-success"       : rate >= 60 ? "bg-warning/10 text-warning"       : "bg-destructive/10 text-destructive";
  const benchLabel = rate >= 80 ? "✓ Ótimo"                          : rate >= 60 ? "⚠ Atenção"                        : "✕ Crítico";

  return (
    <DashboardCard
      title="AI Containment Rate"
      subtitle="Quanto o Fagner resolve sem escalar para humano"
      icon={<ContainmentIcon />}
      iconBg="bg-chart-green/10"
      delay={delay}
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-10">
          {/* Donut — só IA vs Humano */}
          <div className="relative w-52 h-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeChats > 0 ? chartData : [{ name: "Sem dados", value: 1, icon: "", color: "hsl(var(--muted))" }]}
                  cx="50%" cy="50%" innerRadius={65} outerRadius={90}
                  dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}
                  animationDuration={1000} animationBegin={300}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-bold" style={{ color: "hsl(217, 91%, 60%)" }}>{rate}%</span>
              <span className="text-sm text-muted-foreground">IA</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 w-full">
            <div className="space-y-5 mb-6">
              {chartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium text-card-foreground">{item.icon} {item.name}</span>
                  </div>
                  <span className="text-lg font-bold text-card-foreground">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="pt-5 border-t border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chats IA + Humano</span>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-card-foreground">{activeChats.toLocaleString("pt-BR")}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${benchCls}`}>{benchLabel}</span>
                </div>
              </div>
              {/* Barra dividida IA vs Humano */}
              {activeChats > 0 && (
                <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${rate}%`, backgroundColor: "hsl(217, 91%, 60%)" }}
                  />
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${100 - rate}%`, backgroundColor: "hsl(48, 96%, 53%)" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
};

export default ContainmentRateCard;
