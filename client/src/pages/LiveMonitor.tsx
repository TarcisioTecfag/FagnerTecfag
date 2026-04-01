import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { AlertTriangle } from "lucide-react";

import SessionSidebar, { type Session } from "@/components/monitoring/SessionSidebar";
import ChatArea, { type Message } from "@/components/monitoring/ChatArea";
import CapturedDataPanel from "@/components/monitoring/CapturedDataPanel";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NotificationData {
  id: string;
  senderName: string;
  message: string;
  time: string;
}

// ─── Demo Data ─────────────────────────────────────────────────────────────────
const DEMO_MESSAGES_INITIAL: { id: string; sender: "user" | "bot"; content: string; timestamp: string }[] = [
  { id: "d1", sender: "bot",  content: "Olá! Sou o assistente virtual da Tecfag. Como posso ajudar você hoje?", timestamp: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: "d2", sender: "user", content: "Oi! Gostaria de saber mais sobre as soluções de automação de vocês.", timestamp: new Date(Date.now() - 11 * 60000).toISOString() },
  { id: "d3", sender: "bot",  content: "Claro! Temos diversas soluções. Poderia me informar seu nome completo?", timestamp: new Date(Date.now() - 10 * 60000).toISOString() },
  { id: "d4", sender: "user", content: "Maria Silva, da empresa TechCorp Ltda.", timestamp: new Date(Date.now() - 9 * 60000).toISOString() },
  { id: "d5", sender: "bot",  content: "Obrigado, Maria! E qual o CNPJ da TechCorp?", timestamp: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: "d6", sender: "user", content: "O CNPJ é 12.345.678/0001-99.", timestamp: new Date(Date.now() - 6 * 60000).toISOString() },
  { id: "d7", sender: "bot",  content: "Perfeito! Qual o nível de interesse da empresa em automações no momento?", timestamp: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: "d8", sender: "user", content: "Bastante alto! Estamos buscando automatizar nosso atendimento via WhatsApp urgentemente.", timestamp: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: "d9", sender: "bot",  content: "Excelente! Vou registrar isso como prioridade alta. Um especialista da Tecfag entrará em contato em breve com uma proposta personalizada para a TechCorp. 🚀", timestamp: new Date(Date.now() - 1 * 60000).toISOString() },
];

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  open, title, description, confirmLabel, variant = "danger",
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-zinc-100"
        style={{ animation: "fadeSlideUp 0.2s ease-out" }}
      >
        <div className="flex items-start gap-4 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            variant === "danger" ? "bg-red-50" : "bg-amber-50"
          }`}>
            <AlertTriangle className={`w-5 h-5 ${variant === "danger" ? "text-red-500" : "text-amber-500"}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-1">{title}</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            {confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveMonitor() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean; type: "deleteAll" | "archive" | null;
  }>({ open: false, type: null });
  const [demoMessages, setDemoMessages] = useState<Message[]>(DEMO_MESSAGES_INITIAL);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { play: playSound } = useNotificationSound();

  // ── Queries ──────────────────────────────────────────────────────────────

  // ── Dados de demonstração (usados quando não há sessões reais) ──────────
  const DEMO_SESSIONS: Session[] = [
    {
      id: "demo-1",
      startTime: new Date().toISOString(),
      status: "ACTIVE",
      clientName: "Maria Silva",
      clientPhone: "+55 11 98765-4321",
      lastMessage: "Olá, gostaria de saber mais...",
      unread: 2,
      capturedData: JSON.stringify({
        telefone: "+55 11 98765-4321",
        nome_completo: "Maria Silva",
        cnpj_empresa: "12.345.678/0001-99",
        razao_social: "TechCorp Ltda.",
        nome_fantasia: null,
        qualificacao_sdr: "Quente",
        tipo_produto: "Automação de WhatsApp",
        projetos_desenvolvimento: null,
        nivel_interesse: "Alto",
      }),
      annotation: "Cliente demonstrou alto interesse em soluções de automação via WhatsApp. Empresa de médio porte, segmento tech. Aguardando proposta comercial.",
    },
    {
      id: "demo-2",
      startTime: new Date(Date.now() - 15 * 60000).toISOString(),
      status: "ACTIVE",
      clientName: "João Santos",
      clientPhone: "+55 21 99876-5432",
      lastMessage: "Pode me enviar o catálogo?",
      unread: 0,
      capturedData: JSON.stringify({
        telefone: "+55 21 99876-5432",
        nome_completo: "João Santos",
        cnpj_empresa: null,
        razao_social: null,
        nome_fantasia: null,
        qualificacao_sdr: null,
        tipo_produto: null,
        projetos_desenvolvimento: null,
        nivel_interesse: null,
      }),
      annotation: null,
    },
    {
      id: "demo-3",
      startTime: new Date(Date.now() - 30 * 60000).toISOString(),
      status: "COMPLETED",
      clientName: "Ana Costa",
      clientPhone: "+55 31 97654-3210",
      lastMessage: "Obrigada pela atenção!",
      unread: 0,
      capturedData: JSON.stringify({
        telefone: "+55 31 97654-3210",
        nome_completo: "Ana Costa",
        cnpj_empresa: null,
        razao_social: null,
        nome_fantasia: null,
        qualificacao_sdr: null,
        tipo_produto: null,
        projetos_desenvolvimento: null,
        nivel_interesse: null,
      }),
      annotation: null,
    },
  ];


  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/sessions", { archived: showArchived }],
    queryFn: async () => {
      const res = await fetch(`/api/sessions?archived=${showArchived}`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/sessions", activeSessionId, "messages"],
    enabled: !!activeSessionId,
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${activeSessionId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
  });

  const { data: aiStatus } = useQuery<{ paused: boolean }>({
    queryKey: ["/api/bot/ai-status"],
    refetchInterval: 10000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const aiToggleMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      const res = await apiRequest("POST", "/api/bot/ai-status", { paused });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/bot/ai-status"], data);
      toast({
        title: data.paused ? "IA Pausada" : "IA Retomada",
        description: data.paused
          ? "O robô não responderá automaticamente."
          : "O robô voltou a responder às mensagens.",
      });
    },
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "NEW_MESSAGE") {
        if (data.content === "!REFRESH_SESSION") {
          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        if (data.sessionId === activeSessionId) {
          queryClient.setQueryData<Message[]>(
            ["/api/sessions", activeSessionId, "messages"],
            (old = []) => [
              ...old,
              {
                id: Math.random().toString(),
                sender: data.sender,
                content: data.content,
                timestamp: data.timestamp,
                isNew: true,
              },
            ]
          );
        }
        // Mostrar notificação e som para mensagens de usuário
        if (data.sender === "user") {
          const now = new Date();
          const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
          setNotification({
            id: data.sessionId,
            senderName: data.clientName || "Cliente",
            message: data.content,
            time,
          });
          if (soundEnabled) playSound();
        }
      } else if (data.type === "AI_STATUS") {
        queryClient.setQueryData(["/api/bot/ai-status"], { paused: data.paused });
      } else if (data.type === "BOT_STATUS") {
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
        toast({
          title: `Robô ${data.status === "RUNNING" ? "Ligado" : data.status === "IDLE" ? "Desligado" : "em Status: " + data.status}`,
          variant: data.status === "ERROR" ? "destructive" : "default",
        });
      }
    };

    return () => socket.close();
  }, [activeSessionId, queryClient, soundEnabled, playSound]);

  // ── Simulação de mensagens entrantes (apenas em modo demo) ───────────────
  const simulatedIncoming: { content: string; delay: number }[] = [
    { content: "O CNPJ é 12.345.678/0001-99", delay: 8000 },
    { content: "Temos interesse em soluções de automação", delay: 18000 },
    { content: "Pode enviar uma proposta para o meu email?", delay: 30000 },
  ];

  useEffect(() => {
    const isDemo = sessions.length === 0;
    if (!isDemo || activeSessionId !== "demo-1") return;

    const timers = simulatedIncoming.map(({ content, delay }) =>
      setTimeout(() => {
        const newMsg: Message = {
          id: `sim-${Date.now()}`,
          sender: "user",
          content,
          timestamp: new Date().toISOString(),
          isNew: true,
        };
        setDemoMessages((prev) => [...prev, newMsg]);
        if (soundEnabled) playSound();

        // Bot responde após 2s
        setTimeout(() => {
          setDemoMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              sender: "bot",
              content: "Anotado! Vou registrar essa informação. Há mais algo que gostaria de compartilhar?",
              timestamp: new Date().toISOString(),
              isNew: true,
            },
          ]);
        }, 2000);
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [sessions.length, activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Efeitos ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const available = sessions.length > 0 ? sessions : DEMO_SESSIONS;
    if (!activeSessionId && available.length > 0) {
      setActiveSessionId(available[0].id);
    }
  }, [sessions, activeSessionId]);

  // ── Dados derivados ───────────────────────────────────────────────────────

  // Usar demo quando não há sessões reais
  const effectiveSessions = sessions.length > 0 ? sessions : DEMO_SESSIONS;
  const effectiveMessages = sessions.length === 0 && activeSessionId?.startsWith("demo")
    ? demoMessages
    : messages;

  const filteredSessions = effectiveSessions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.clientName?.toLowerCase().includes(q) ||
      s.clientPhone?.toLowerCase().includes(q)
    );
  });

  const activeSession = effectiveSessions.find((s) => s.id === activeSessionId) ?? null;
  const isAIPaused = !!aiStatus?.paused;

  // ── Ações de Confirmar ─────────────────────────────────────────────────────

  const handleDeleteAll = async () => {
    try {
      await apiRequest("DELETE", "/api/sessions/delete-all", {});
      setActiveSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Todos os chats foram apagados." });
    } catch (e: any) {
      toast({ title: "Erro ao apagar chats", description: e.message, variant: "destructive" });
    } finally {
      setConfirmModal({ open: false, type: null });
    }
  };

  const handleArchive = async () => {
    try {
      await apiRequest("POST", `/api/sessions/${activeSessionId}/archive`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Sessão arquivada" });
    } catch (e: any) {
      toast({ title: "Erro ao arquivar", description: e.message, variant: "destructive" });
    } finally {
      setConfirmModal({ open: false, type: null });
    }
  };

  const handleSendManual = useCallback(() => {
    if (!manualMessage.trim() || !activeSessionId) return;
    // TODO: quando backend pronto — enviar mensagem manual via API
    setManualMessage("");
  }, [manualMessage, activeSessionId]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>


      {/* ── Modais de Confirmação ── */}
      <ConfirmModal
        open={confirmModal.open && confirmModal.type === "deleteAll"}
        title="Apagar todos os chats?"
        description="Esta ação é irreversível. Todas as mensagens, logs e dados capturados serão permanentemente removidos."
        confirmLabel="Sim, apagar tudo"
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmModal({ open: false, type: null })}
      />
      <ConfirmModal
        open={confirmModal.open && confirmModal.type === "archive"}
        title="Arquivar conversa?"
        description="A sessão será marcada como concluída e movida para o histórico de arquivadas."
        confirmLabel="Arquivar"
        variant="warning"
        onConfirm={handleArchive}
        onCancel={() => setConfirmModal({ open: false, type: null })}
      />

      {/* ── Layout Principal de 3 Colunas — sem bordas externas ── */}
      <div className="h-full flex overflow-hidden">

        {/* COLUNA ESQUERDA — Sessões */}
        <div className="flex-shrink-0 w-72">
          <SessionSidebar
            sessions={filteredSessions}
            activeSessionId={activeSessionId}
            showArchived={showArchived}
            searchQuery={searchQuery}
            isAIPaused={isAIPaused}
            isAITogglePending={aiToggleMutation.isPending}
            onSelectSession={setActiveSessionId}
            onToggleArchived={setShowArchived}
            onSearchChange={setSearchQuery}
            onToggleAI={() => aiToggleMutation.mutate(!isAIPaused)}
          />
        </div>

        {/* CENTRO — Conversa */}
        <div className="flex-1 flex min-w-0">
          <ChatArea
            sessionId={activeSessionId}
            activeSession={activeSession}
            messages={effectiveMessages}
            isAIPaused={isAIPaused}
            soundEnabled={soundEnabled}
            manualMessage={manualMessage}
            onToggleSound={() => setSoundEnabled((s) => !s)}
            onManualMessageChange={setManualMessage}
            onSendManual={handleSendManual}
            onArchive={() => setConfirmModal({ open: true, type: "archive" })}
            onDeleteAll={() => setConfirmModal({ open: true, type: "deleteAll" })}
          />
        </div>

        {/* COLUNA DIREITA — Dados Captados */}
        <div className="flex-shrink-0 w-80 border-l border-zinc-100">
          <CapturedDataPanel
            sessionId={activeSessionId}
            capturedData={activeSession?.capturedData ?? null}
            clientPhone={activeSession?.clientPhone ?? null}
            annotation={activeSession?.annotation}
          />
        </div>
      </div>
    </>
  );
}