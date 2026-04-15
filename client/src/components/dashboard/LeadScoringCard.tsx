import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import DashboardCard from "./DashboardCard";
import { useStatsData, periodToDates } from "./useStatsData";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        <p className="text-sm font-semibold text-card-foreground">{d.emoji} {d.name}</p>
        <p className="text-sm text-muted-foreground">{d.value.toLocaleString("pt-BR")} — {d.pct}%</p>
      </div>
    );
  }
  return null;
};

const ScoringIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-red))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
  </svg>
);

const LeadScoringCard = ({ period = "14d", delay = 0 }: { period?: string; delay?: number }) => {
  const { dateFrom, dateTo } = periodToDates(period);
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const { data, loading } = useStatsData<{
    hot: number; warm: number; cold: number; total: number;
    hotTrend: { date: string; count: number }[];
  }>(`/api/livechat/stats/lead-scoring?${qs}`);

  const total = data?.total ?? 1;
  const chartData = [
    { name: "Leads Quentes", value: data?.hot  ?? 0, pct: total > 0 ? Math.round(((data?.hot  ?? 0) / total) * 100) : 0, color: "hsl(var(--chart-red))",    emoji: "🔥" },
    { name: "Leads Mornos",  value: data?.warm ?? 0, pct: total > 0 ? Math.round(((data?.warm ?? 0) / total) * 100) : 0, color: "hsl(var(--chart-yellow))", emoji: "🌤" },
    { name: "Visitantes",    value: data?.cold ?? 0, pct: total > 0 ? Math.round(((data?.cold ?? 0) / total) * 100) : 0, color: "hsl(var(--chart-blue))",   emoji: "👁" },
  ];

  const trend = data?.hotTrend ?? [];
  const tMax = Math.max(...trend.map((t) => t.count), 1);

  return (
    <DashboardCard
      title="Distribuição de Lead Scoring"
      subtitle="Qualidade dos leads gerados pelo Fagner"
      icon={<ScoringIcon />}
      iconBg="bg-chart-red/10"
      delay={delay}
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-10">
          {/* Donut */}
          <div className="w-56 h-56 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.some(d => d.value > 0) ? chartData : [{ name: "Sem dados", value: 1, pct: 0, color: "hsl(var(--muted))", emoji: "" }]}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" strokeWidth={3} stroke="hsl(var(--card))"
                  animationDuration={1000}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Stats */}
          <div className="flex-1 w-full">
            <div className="space-y-5 mb-6">
              {chartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium text-card-foreground">{item.emoji} {item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-card-foreground">{item.value.toLocaleString("pt-BR")}</span>
                    <span className="text-sm text-muted-foreground ml-2">({item.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-5 border-t border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Leads Quentes — 30 Dias</h4>
              {trend.length > 0 ? (
                <div className="flex items-end gap-0.5 h-10 bg-muted/40 rounded-lg px-2 pt-1.5 pb-1">
                  {trend.map((t, i) => (
                    <div key={i} className="flex-1 h-full flex items-end" title={`${t.date}: ${t.count}`}>
                      <div
                        className="w-full rounded-t bg-chart-red"
                        style={{ height: `${Math.max((t.count / tMax) * 28, 2)}px`, opacity: 0.85 }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-7 rounded-lg bg-muted/50" />
              )}
              <div className="flex justify-between mt-3">
                <span className="text-sm text-muted-foreground">Total de visitantes no período</span>
                <span className="text-lg font-bold text-card-foreground">{total.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
};

export default LeadScoringCard;
