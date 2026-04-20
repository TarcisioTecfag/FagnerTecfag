import DashboardCard from "./DashboardCard";
import { useStatsData } from "./useStatsData";
import { UserCircle, MessageSquare } from "lucide-react";
import { useCallback } from "react";

const AlertIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--chart-red))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

const UnhandledIntentsCard = ({ delay = 0 }: { delay?: number }) => {
  const { data, loading } = useStatsData<{ id: string; visitorId: string; chatId: string; question: string; date: string }[]>(
    "/api/livechat/stats/unhandled-intents?limit=10"
  );

  const items = Array.isArray(data) ? data : [];

  const handleAction = useCallback((type: 'OPEN_CHAT' | 'OPEN_VISITOR', payload: { chatId?: string; visitorId?: string }) => {
    window.dispatchEvent(new CustomEvent("livechat-action", {
      detail: { type, ...payload }
    }));
  }, []);

  return (
    <DashboardCard
      title="Mapa de Intents Não Atendidos"
      subtitle="Perguntas individuais onde o Fagner não soube responder — últimos 30 dias"
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
          <p className="text-base font-medium text-muted-foreground">Nenhuma falha registrada ainda.</p>
          <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm">Os fallbacks do Fagner individuais serão capturados aqui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="p-4 rounded-xl border border-muted/50 bg-muted/10 hover:bg-muted/30 transition-colors flex flex-col gap-3 group">
              <span className="text-sm font-medium text-card-foreground leading-relaxed flex gap-2 items-start">
                <span className="text-destructive mt-0.5" style={{ fontSize: '6px' }}>🔴</span>
                {item.question}
              </span>
              <div className="flex flex-wrap items-center gap-2 pl-3">
                <button
                  onClick={() => handleAction('OPEN_VISITOR', { visitorId: item.visitorId })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-sm"
                >
                  <UserCircle className="w-3.5 h-3.5" />
                  Abrir Cliente
                </button>
                <button
                  onClick={() => handleAction('OPEN_CHAT', { chatId: item.chatId })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:text-blue-700 transition-colors shadow-sm"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ver Histórico
                </button>
                <div className="ml-auto text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">
                  {new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(' de ', '/')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
};

export default UnhandledIntentsCard;
