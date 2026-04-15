import { useState } from "react";
import DashboardCard from "./DashboardCard";
import { useStatsData } from "./useStatsData";

const BAR_COLORS = [
  "hsl(var(--chart-purple))", "hsl(var(--chart-blue))",   "hsl(var(--chart-orange))",
  "hsl(var(--chart-green))",  "hsl(var(--chart-pink))",   "hsl(var(--info))",
  "hsl(var(--warning))",
];

const PageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-purple))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

const PreChatPagesCard = ({ delay = 0 }: { delay?: number }) => {
  const [enabled, setEnabled] = useState(false);
  const { data, loading } = useStatsData<{
    topPages: { url: string; pageTitle: string | null; count: number }[];
  }>(enabled ? "/api/livechat/stats/pre-chat-pages?limit=8" : "");

  const pages = data?.topPages ?? [];
  const maxVisits = pages[0]?.count ?? 1;

  return (
    <DashboardCard
      title="Páginas Pré-Chat"
      subtitle="URLs mais visitadas antes do 1º chat"
      icon={<PageIcon />}
      iconBg="bg-chart-purple/10"
      delay={delay}
    >
      {!enabled ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <PageIcon />
          <p className="text-sm font-medium text-muted-foreground mt-4 mb-4">Query pesada — carregue sob demanda</p>
          <button
            onClick={() => setEnabled(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 active:scale-95 transition-all"
          >
            Carregar dados
          </button>
        </div>
      ) : loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sem dados suficientes ainda.</p>
      ) : (
        <div className="space-y-4">
          {pages.slice(0, 7).map((page, i) => {
            const pct = Math.round((page.count / maxVisits) * 100);
            const label = page.pageTitle || page.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60) || page.url;
            return (
              <div key={i} className="group hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">#{i + 1}</span>
                    <span className="text-sm text-card-foreground truncate">{label}</span>
                  </div>
                  <span className="text-sm font-bold text-card-foreground ml-4 shrink-0">{page.count}×</span>
                </div>
                <div className="ml-8 h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
};

export default PreChatPagesCard;
