import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import DashboardCard from "./DashboardCard";
import { useStatsData, periodToDates } from "./useStatsData";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        <p className="text-sm font-semibold text-card-foreground">{d.name}</p>
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

  const COLORS = [
    "hsl(var(--chart-blue))",
    "hsl(var(--chart-yellow))",
    "hsl(var(--muted-foreground))",
  ];

  const chartData = [
    { name: "Resolvido pela IA",  value: data?.aiResolved ?? 0,        icon: "🤖", color: COLORS[0] },
    { name: "Escalado p/ Humano", value: data?.humanEscalated ?? 0,    icon: "👤", color: COLORS[1] },
    { name: "Abandono",           value: data?.abandoned ?? 0,          icon: "🚪", color: COLORS[2] },
  ];

  const rate = data?.containmentRate ?? 0;
  const total = data?.totalChats ?? 0;
  const benchCls = rate >= 80 ? "bg-success/10 text-success" : rate >= 60 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive";
  const benchLabel = rate >= 80 ? "✓ Ótimo" : rate >= 60 ? "⚠ Atenção" : "✕ Crítico";

  return (
    <DashboardCard
      title="AI Containment Rate"
      subtitle="Quanto o Fagner resolve sem escalar"
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
          {/* Donut */}
          <div className="relative w-52 h-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.some(d => d.value > 0) ? chartData : [{ name: "Vazio", value: 1, color: "hsl(var(--muted))" }]}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-chart-blue">{rate}%</span>
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
            <div className="pt-5 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total de chats analisados</span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-card-foreground">{total.toLocaleString("pt-BR")}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${benchCls}`}>{benchLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
};

export default ContainmentRateCard;
