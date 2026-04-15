import DashboardCard from "./DashboardCard";
import { useStatsData } from "./useStatsData";

const AlertIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-red))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

const UnhandledIntentsCard = ({ delay = 0 }: { delay?: number }) => {
  const { data, loading } = useStatsData<{ category: string; count: number; samples: string[] }[]>(
    "/api/livechat/stats/unhandled-intents?limit=10"
  );

  const items = Array.isArray(data) ? data : [];
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <DashboardCard
      title="Mapa de Intents Não Atendidos"
      subtitle="Tópicos onde o Fagner falhou — últimos 30 dias"
      icon={<AlertIcon />}
      iconBg="bg-chart-red/10"
      delay={delay}
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20 mb-5">
            <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
          </svg>
          <p className="text-base font-medium text-muted-foreground">Nenhum intent não atendido registrado ainda.</p>
          <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm">Os fallbacks do Fagner serão capturados automaticamente aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-card-foreground truncate flex-1 mr-3">{item.category}</span>
                <span className="text-sm font-bold text-destructive shrink-0 bg-destructive/10 px-2 py-0.5 rounded-full">{item.count}×</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-chart-red transition-all duration-700"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
              </div>
              {item.samples?.[0] && (
                <p className="text-[11px] text-muted-foreground/60 italic mt-1 truncate">
                  Ex: &ldquo;{item.samples[0].slice(0, 80)}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
};

export default UnhandledIntentsCard;
