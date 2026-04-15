import DashboardCard from "./DashboardCard";
import { useStatsData } from "./useStatsData";

const getCellStyle = (val: number | null) => {
  if (val === null) return "text-muted-foreground/40 bg-transparent";
  if (val >= 50) return "bg-success/15 text-success font-bold";
  if (val >= 25) return "bg-warning/15 text-warning font-bold";
  if (val >= 10) return "bg-chart-pink/15 text-chart-pink font-bold";
  return "text-muted-foreground";
};

const CohortIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-green))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const RetentionCohortCard = ({ delay = 0 }: { delay?: number }) => {
  const { data, loading } = useStatsData<{
    cohortWeek: string;
    data: { weekOffset: number; retentionPct: number; count: number }[];
  }[]>("/api/livechat/stats/cohort?weeks=8");

  const cohorts = Array.isArray(data) ? data.slice(-6) : [];
  const maxOffset = Math.max(...cohorts.flatMap((c) => c.data.map((d) => d.weekOffset)), 4);
  const weeks = Array.from({ length: Math.min(maxOffset + 1, 6) }, (_, i) => `S${i}`);

  return (
    <DashboardCard
      title="Coorte de Retenção Semanal"
      subtitle="Visitantes que retornam por semana de aquisição"
      icon={<CohortIcon />}
      iconBg="bg-chart-green/10"
      delay={delay}
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : cohorts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-base font-medium text-muted-foreground">Dados insuficientes.</p>
          <p className="text-sm text-muted-foreground/60 mt-2">Requer múltiplas semanas de histórico de sessões.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs text-muted-foreground font-medium pb-4 pr-6">Coorte</th>
                  {weeks.map((w) => (
                    <th key={w} className="text-center text-xs text-muted-foreground font-medium pb-4 px-4">{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => {
                  return (
                    <tr key={c.cohortWeek} className="hover:bg-muted/50 transition-colors">
                      <td className="text-sm font-medium text-card-foreground py-3 pr-6">{c.cohortWeek?.slice(5) ?? "—"}</td>
                      {weeks.map((_, wi) => {
                        const cell = c.data.find((d) => d.weekOffset === wi);
                        const val = cell?.retentionPct ?? (wi === 0 ? 100 : null);
                        return (
                          <td key={wi} className="text-center py-3 px-4">
                            <span className={`inline-block rounded-lg px-4 py-1.5 text-sm ${getCellStyle(val)}`}>
                              {val !== null ? `${val}%` : "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-center gap-8 mt-6 pt-5 border-t border-border">
            {[
              { color: "bg-success/40",      label: "≥50% Ótimo" },
              { color: "bg-warning/40",      label: "≥25% Bom" },
              { color: "bg-chart-pink/40",   label: "≥10% Regular" },
            ].map((l) => (
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

export default RetentionCohortCard;
