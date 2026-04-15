import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid } from "recharts";
import DashboardCard from "./DashboardCard";
import { useStatsData, periodToDates } from "./useStatsData";

const getColor = (rate: number) =>
  rate >= 15 ? "hsl(var(--chart-green))" : rate >= 8 ? "hsl(var(--chart-orange))" : "hsl(var(--chart-red))";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    const sessions  = d.total     ?? 0;
    const activated = d.activated ?? 0;
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg min-w-[160px]">
        <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Taxa</span>
            <span className="text-sm font-bold text-card-foreground">{d.rate}%</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Sessões</span>
            <span className="text-sm font-bold text-card-foreground">{sessions.toLocaleString("pt-BR")}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Ativados</span>
            <span className="text-sm font-bold" style={{ color: "hsl(142,71%,45%)" }}>{activated.toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const ActivationIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-orange))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const ActivationRateCard = ({ period = "14d", delay = 0 }: { period?: string; delay?: number }) => {
  const { dateFrom, dateTo } = periodToDates(period);
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const { data, loading } = useStatsData<{
    totalSessions: number; chatActivated: number; activationRate: number;
    trend: { date: string; rate: number; total: number; activated: number }[];
  }>(`/api/livechat/stats/activation-rate?${qs}`);

  const trend = (data?.trend ?? []).map((t) => ({
    ...t,
    day: t.date?.slice(5) ?? "",
    status: t.rate >= 15 ? "excellent" : t.rate >= 8 ? "acceptable" : "critical",
  }));

  const statusLabel = !data ? "—"
    : data.activationRate >= 15 ? "✓ Excelente"
    : data.activationRate >= 8  ? "⚠ Aceitável"
    : "✕ Crítico";
  const statusCls = !data ? ""
    : data.activationRate >= 15 ? "bg-success/10 text-success"
    : data.activationRate >= 8  ? "bg-warning/10 text-warning"
    : "bg-destructive/10 text-destructive";

  return (
    <DashboardCard
      title="Taxa de Ativação do Chat"
      subtitle="Visitantes que interagem com o Fagner"
      icon={<ActivationIcon />}
      iconBg="bg-chart-orange/10"
      delay={delay}
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-start gap-8">
          {/* Left */}
          <div className="lg:w-64 shrink-0">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-5xl font-bold text-card-foreground">{data?.activationRate ?? 0}%</span>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusCls}`}>{statusLabel}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              {(data?.chatActivated ?? 0).toLocaleString("pt-BR")} ativados de{" "}
              {(data?.totalSessions ?? 0).toLocaleString("pt-BR")} sessões
            </p>
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg bg-destructive/10 py-2.5 text-center">
                <span className="text-xs font-semibold text-destructive">&lt; 8%</span>
                <p className="text-[10px] text-destructive/80">Crítico</p>
              </div>
              <div className="flex-1 rounded-lg bg-warning/10 py-2.5 text-center">
                <span className="text-xs font-semibold text-warning">8–15%</span>
                <p className="text-[10px] text-warning/80">Aceitável</p>
              </div>
              <div className="flex-1 rounded-lg bg-success/10 py-2.5 text-center">
                <span className="text-xs font-semibold text-success">&gt; 15%</span>
                <p className="text-[10px] text-success/80">Excelente</p>
              </div>
            </div>
          </div>
          {/* Right: Chart */}
          <div className="flex-1 min-h-[220px]">
            <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Últimos {parseInt(period)} Dias
            </div>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trend} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} unit="%" />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Bar dataKey="rate" radius={[6, 6, 0, 0]} animationDuration={800} animationBegin={200}>
                    {trend.map((entry, i) => (
                      <Cell key={i} fill={getColor(entry.rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">Sem dados para o período.</p>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
};

export default ActivationRateCard;
