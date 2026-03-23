import { useState, useRef, useEffect } from "react";
import {
  Power, PowerOff, TrendingUp, Users, MessageCircle,
  TerminalSquare, Loader2, Copy, History, Clock, CheckSquare,
  Send, RotateCcw, Radio, Mic, Image as ImageIcon, Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useBotLogs } from "@/hooks/use-bot-logs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import FlowMonitor from "@/components/FlowMonitor";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = "overview" | "logs" | "live" | "flows";

type ChatMessage = {
  id: string;
  role: "user" | "bot" | "error";
  content: string;
  tokens?: number;
  ts: Date;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  trendColor = "text-emerald-500",
  sub,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  trendColor?: string;
  sub?: string;
}) {
  return (
    <Card className="bg-white border border-red-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-zinc-500">{title}</CardTitle>
        <div className="p-1.5 rounded-lg" style={{ background: "rgba(220,38,38,0.07)" }}>
          <Icon className="h-4 w-4" style={{ color: "#dc2626" }} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-bold text-zinc-800 tracking-tight">{value}</div>
        {trend && (
          <p className={`text-xs flex items-center mt-1.5 font-medium ${trendColor}`}>
            <TrendingUp className="h-3 w-3 mr-1 shrink-0" />
            {trend}
          </p>
        )}
        {sub && !trend && (
          <p className="text-xs text-zinc-500 mt-1.5 font-medium">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LeadsChart({
  leadsByDay,
  isLoading,
}: {
  leadsByDay: { date: string; count: number }[] | undefined;
  isLoading: boolean;
}) {
  return (
    <Card className="bg-white border border-red-100 shadow-sm flex flex-col h-full">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-base text-zinc-800">Geração de Leads</CardTitle>
        <CardDescription className="text-zinc-500 text-xs">
          Detalhamento diário de leads capturados pelo robô (últimos 30 dias).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex items-end pb-4 px-4 min-h-0">
        {isLoading ? (
          <div className="w-full flex items-center justify-center h-full">
            <Loader2 className="animate-spin" size={24} style={{ color: "#dc2626" }} />
          </div>
        ) : leadsByDay && leadsByDay.length > 0 ? (
          <div className="w-full flex items-end justify-between gap-0.5 h-full">
            {(() => {
              const maxVal = Math.max(...leadsByDay.map((d) => d.count), 1);
              return leadsByDay.map((d, i) => {
                const heightPct = (d.count / maxVal) * 100;
                const label = new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                });
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm relative group hover:opacity-90 transition-opacity"
                    style={{ height: "100%", background: "rgba(220,38,38,0.07)" }}
                    title={`${label}: ${d.count} leads`}
                  >
                    <div
                      className="absolute bottom-0 w-full rounded-t-sm transition-all duration-500"
                      style={{
                        height: `${Math.max(heightPct, d.count > 0 ? 4 : 0)}%`,
                        background: "linear-gradient(180deg, #ef4444, #dc2626)"
                      }}
                    />
                    <div
                      className="absolute -top-7 left-1/2 -translate-x-1/2 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10"
                      style={{ background: "#1a0000" }}
                    >
                      {label}: {d.count}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="w-full flex items-center justify-center h-full text-zinc-400 text-sm italic">
            Nenhum dado ainda
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OperatorsChart({
  leadsByOperator,
  isLoading,
}: {
  leadsByOperator: { name: string; count: number }[] | undefined;
  isLoading: boolean;
}) {
  const barColors = [
    "#dc2626", "#ef4444", "#b91c1c", "#991b1b", "#7f1d1d", "#f87171",
  ];

  return (
    <Card className="bg-white border border-red-100 shadow-sm flex flex-col h-full">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-base text-zinc-800">Leads por Operador</CardTitle>
        <CardDescription className="text-zinc-500 text-xs">
          Distribuição de leads enviados para os operadores via rodízio do CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin" size={24} style={{ color: "#dc2626" }} />
          </div>
        ) : leadsByOperator && leadsByOperator.length > 0 ? (
          <div className="space-y-4 pt-1">
            {(() => {
              const maxCount = Math.max(...leadsByOperator.map((op) => op.count), 1);
              return leadsByOperator.map((op, i) => {
                const initials = op.name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase();
                return (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 text-white"
                          style={{ background: barColors[i % barColors.length] }}
                        >
                          {initials}
                        </div>
                        <span className="text-sm font-medium text-zinc-800">{op.name}</span>
                      </div>
                      <span className="text-sm font-bold text-zinc-800">
                        {op.count}{" "}
                        <span className="text-xs font-normal text-zinc-500">leads</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-red-50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(op.count / maxCount) * 100}%`,
                          background: barColors[i % barColors.length]
                        }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm italic text-center">
            Nenhum lead atribuído ainda. Os dados aparecerão após a sincronização com o CRM.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TerminalLogs({
  liveLogs,
  sessions,
  sessionLogs,
  isLoadingSessionLogs,
  isHistoryOpen,
  setIsHistoryOpen,
  selectedSessionId,
  setSelectedSessionId,
}: {
  liveLogs: { message: string; level: string; timestamp: string }[];
  sessions: { id: string; startTime: string; endTime: string | null; status: string }[] | undefined;
  sessionLogs: { message: string; level: string; timestamp: string }[] | undefined;
  isLoadingSessionLogs: boolean;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (v: boolean) => void;
  selectedSessionId: string | null;
  setSelectedSessionId: (v: string | null) => void;
}) {
  return (
    <Card className="bg-white border border-red-100 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Card Header */}
      <CardHeader className="pb-3 border-b border-red-50 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-zinc-800">
            <TerminalSquare className="h-5 w-5" style={{ color: "#dc2626" }} />
            Logs do Sistema
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-700"
              onClick={() => {
                const text = liveLogs
                  .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}`)
                  .join("\n");
                navigator.clipboard.writeText(text);
              }}
              title="Copiar Logs"
            >
              <Copy size={14} />
            </Button>

            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-700"
                  title="Sessões Passadas"
                >
                  <History size={14} />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0 border-red-100">
                <DialogHeader className="p-6 border-b border-red-50">
                  <DialogTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" style={{ color: "#dc2626" }} /> Histórico de Sessões
                  </DialogTitle>
                  <DialogDescription>
                    Visualize os logs das sessões passadas do robô.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 flex overflow-hidden">
                  {/* Session List */}
                  <div className="w-1/3 border-r border-red-50 overflow-y-auto p-2 space-y-1 bg-red-50/30">
                    {sessions?.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSessionId(session.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${
                          selectedSessionId === session.id
                            ? "bg-white border-red-100 shadow-sm"
                            : "border-transparent hover:bg-red-50/50"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-xs font-semibold text-zinc-900">
                            {format(new Date(session.startTime), "dd 'de' MMM, HH:mm", {
                              locale: ptBR,
                            })}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1 h-4 ${
                              session.status === "RUNNING"
                                ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                                : "text-zinc-500"
                            }`}
                          >
                            {session.status === "RUNNING" ? "Ativa" : "Finalizada"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <Clock size={10} />
                          {session.endTime
                            ? `Duração: ${Math.round(
                                (new Date(session.endTime).getTime() -
                                  new Date(session.startTime).getTime()) /
                                  60000
                              )} min`
                            : "Iniciada agora"}
                        </p>
                      </div>
                    ))}
                    {sessions?.length === 0 && (
                      <p className="text-center p-4 text-xs text-zinc-400 italic">
                        Nenhuma sessão anterior.
                      </p>
                    )}
                  </div>

                  {/* Session Logs View */}
                  <div className="flex-1 bg-zinc-950 text-zinc-300 font-mono text-[11px] overflow-y-auto p-4 space-y-2">
                    {!selectedSessionId ? (
                      <div className="h-full flex items-center justify-center text-zinc-600 italic">
                        Selecione uma sessão ao lado para ver os logs
                      </div>
                    ) : isLoadingSessionLogs ? (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-zinc-600" size={24} />
                      </div>
                    ) : (
                      sessionLogs?.map((log, i) => (
                        <div
                          key={i}
                          className={`flex gap-3 ${
                            log.level === "ERROR"
                              ? "text-red-400"
                              : log.level === "WARN"
                              ? "text-amber-400"
                              : "text-zinc-300"
                          }`}
                        >
                          <span className="shrink-0 text-zinc-600 font-bold">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                          </span>
                          <span className="break-all">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Badge
              variant="outline"
              className="text-[10px] font-semibold animate-pulse px-2"
              style={{ color: "#dc2626", borderColor: "#fca5a5", background: "rgba(220,38,38,0.05)" }}
            >
              AO VIVO
            </Badge>
          </div>
        </div>
      </CardHeader>

      {/* Terminal Body */}
      <CardContent className="flex-1 p-0 overflow-hidden relative bg-zinc-950 rounded-b-xl">
        <div className="absolute inset-0 p-4 overflow-y-auto space-y-1.5 flex flex-col-reverse justify-start
          [&::-webkit-scrollbar]:w-[4px]
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-zinc-700
          [&::-webkit-scrollbar-thumb]:rounded-full
        ">
          {[...liveLogs].reverse().map((log, i) => (
            <div
              key={i}
              className={`flex gap-3 font-mono text-xs leading-relaxed ${
                log.level === "ERROR"
                  ? "text-red-400"
                  : log.level === "WARN"
                  ? "text-amber-400"
                  : log.level === "SUCCESS"
                  ? "text-emerald-400"
                  : "text-zinc-200"
              }`}
            >
              <span className="shrink-0 text-zinc-500 font-bold tabular-nums">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="break-all">{log.message}</span>
            </div>
          ))}
          {liveLogs.length === 0 && (
            <div className="text-zinc-600 italic font-mono text-xs">Aguardando logs...</div>
          )}
        </div>
        {/* Fade at top */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-zinc-950 to-transparent pointer-events-none" />
      </CardContent>
    </Card>
  );
}

// ─── LiveChat Sub-component ──────────────────────────────────────────────────
// Usa o pipeline REAL do Fagner — as mensagens passam pelo orquestrador,
// todos os fluxos, detecção de CNPJ, crédito, RAG etc. estão ativos.

const FLOW_LABELS_CHAT: Record<number, string> = {
  1: "Vendas", 2: "Financeiro", 3: "Assistência Técnica", 4: "Pós Venda", 5: "Outros",
};
const SUBFLOW_LABELS_CHAT: Record<string, string> = {
  PECAS: "Peças", MAQUINAS: "Máquinas", PERSONNALITE: "Personnalite",
  "2A_BOLETO": "Boleto", "2B_NF": "NF Financeiro", "2C_OUTROS": "Outros Fin.",
  "3_AT": "A.T.", "4A_RASTREAR": "Rastrear", "4B_NF": "NF Pedido",
  "5A_CLIENTE": "Cliente", "5B_CURRICULO": "Currículo",
};

function LiveChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "bot",
    content: "Olá! 👋 Sou o Fagner. Pode testar comigo — vou responder exatamente como no RD Conversas. Escreva, envie uma foto ou grave um áudio!",
    ts: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{ base64: string; mimeType: string; durationSec: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPendingImage({ base64, mimeType: file.type, preview: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setPendingAudio({ base64, mimeType, durationSec: recordingSeconds });
        };
        reader.readAsDataURL(blob);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecordingSeconds(0);
        setIsRecording(false);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => mediaRecorderRef.current?.stop();
  const cancelMedia = () => {
    setPendingImage(null);
    setPendingAudio(null);
    if (isRecording) stopRecording();
  };

  const handleSend = async () => {
    const text = input.trim() || (pendingImage ? "Analise esta imagem." : pendingAudio ? "Analise este áudio." : "");
    if ((!text && !pendingImage && !pendingAudio) || isTyping) return;

    const media = pendingImage ?? pendingAudio;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || (pendingImage ? "📷 Imagem enviada" : "🎤 Áudio enviado"),
      ts: new Date(),
      ...(pendingImage && { imagePreview: pendingImage.preview }),
      ...(pendingAudio && { audioDuration: pendingAudio.durationSec }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setPendingImage(null);
    setPendingAudio(null);
    setIsTyping(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const body: any = { message: text };
      if (media) {
        body.mediaBase64  = media.base64;
        body.mediaMimeType = media.mimeType;
      }

      const res = await fetch("/api/bot/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Erro desconhecido" }));
        throw new Error(error.message || `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Atualiza estado da sessão
      if (data.session) setSessionInfo(data.session);

      // Adiciona cada resposta do Fagner como uma bolha separada (split humanizado)
      const replies: string[] = data.replies ?? [data.response];
      const newBotMsgs: ChatMessage[] = replies.map((r: string) => ({
        id: crypto.randomUUID(),
        role: "bot" as const,
        content: r,
        ts: new Date(),
      }));
      setMessages(prev => [...prev, ...newBotMsgs]);

    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "error",
        content: `Erro: ${err?.message ?? "falha ao conectar"}`,
        ts: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = async () => {
    // Reseta a sessão do orquestrador no backend
    await fetch("/api/bot/simulate/session", { method: "DELETE", credentials: "include" });
    setSessionInfo(null);
    setMessages([{
      id: "welcome",
      role: "bot",
      content: "Nova conversa iniciada. A sessão do Fagner foi reiniciada — tudo começa do zero! 🚀",
      ts: new Date(),
    }]);
    setInput("");
    setPendingImage(null);
    setPendingAudio(null);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (

    <div className="h-full flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* ── Chat Header ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-red-100 rounded-t-xl"
        style={{ background: "#fff" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/fagnerfil.jfif"
            alt="Fagner"
            className="h-9 w-9 rounded-full object-cover shadow-sm shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-zinc-800 leading-none">Fagner <span className="text-[10px] font-normal text-zinc-400 ml-1">· pipeline real</span></p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(34,197,94,0.12)", color: "#16a34a" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                Online
              </span>
              {sessionInfo?.flow && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                  F{sessionInfo.flow} · {FLOW_LABELS_CHAT[sessionInfo.flow]}
                  {sessionInfo.subFlow && ` › ${SUBFLOW_LABELS_CHAT[sessionInfo.subFlow] ?? sessionInfo.subFlow}`}
                </span>
              )}
              {sessionInfo?.companyName && (
                <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">🏢 {sessionInfo.companyName}</span>
              )}
              {sessionInfo?.hasCnpjData && (
                <span className="text-[10px] font-medium text-emerald-600">CNPJ ✓</span>
              )}
              {sessionInfo?.creditEligible === true && (
                <span className="text-[10px] font-medium text-emerald-600">Crédito ✓</span>
              )}
              {sessionInfo?.creditEligible === false && (
                <span className="text-[10px] font-medium text-amber-600">À vista</span>
              )}
              {sessionInfo?.isCompleted && (
                <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-full">✅ Finalizado</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-red-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-50 shrink-0"
          title="Reseta a sessão do Fagner — começa do zero"
        >
          <RotateCcw size={12} />
          Nova Sessão
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 relative overflow-hidden min-h-0" style={{ background: "#fafafa" }}>
        <div
          className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-3
            [&::-webkit-scrollbar]:w-[4px]
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-zinc-200
            [&::-webkit-scrollbar-thumb]:rounded-full
          "
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 items-end ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Bot avatar */}
              {msg.role !== "user" && (
                msg.role === "error" ? (
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mb-0.5"
                    style={{ background: "#ef4444" }}
                  >
                    !
                  </div>
                ) : (
                  <img
                    src="/fagnerfil.jfif"
                    alt="Fagner"
                    className="h-7 w-7 rounded-full object-cover shrink-0 mb-0.5"
                  />
                )
              )}

              {/* Bubble */}
              <div
                className={`max-w-[72%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                  msg.role === "user"
                    ? "rounded-br-sm text-white"
                    : msg.role === "error"
                    ? "rounded-bl-sm bg-red-50 text-red-700 border border-red-100"
                    : "rounded-bl-sm bg-white text-zinc-800 border border-zinc-100"
                }`}
                style={msg.role === "user" ? { background: "linear-gradient(135deg,#ef4444,#b91c1c)" } : {}}
              >
                {/* Image preview in bubble */}
                {(msg as any).imagePreview && (
                  <img
                    src={(msg as any).imagePreview}
                    alt="Imagem enviada"
                    className="rounded-xl mb-2 max-w-full max-h-48 object-contain"
                  />
                )}
                {/* Audio indicator in bubble */}
                {(msg as any).audioDuration !== undefined && (
                  <div className="flex items-center gap-2 mb-2 opacity-90">
                    <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
                      <Mic size={13} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="h-1 bg-white/30 rounded-full">
                        <div className="h-1 bg-white/80 rounded-full w-3/4" />
                      </div>
                    </div>
                    <span className="text-[10px] opacity-70">{fmtTime((msg as any).audioDuration)}</span>
                  </div>
                )}
                {msg.content}
                {msg.tokens && msg.tokens > 0 && (
                  <div className="mt-1 text-[9px] opacity-50 text-right">{msg.tokens} tokens</div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-2.5 items-end">
              <img
                src="/fagnerfil.jfif"
                alt="Fagner"
                className="h-7 w-7 rounded-full object-cover shrink-0"
              />
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-zinc-100 shadow-sm flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Pending media preview bar ── */}
      {(pendingImage || pendingAudio || isRecording) && (
        <div
          className="shrink-0 px-4 py-2 flex items-center gap-3 border-t border-red-50"
          style={{ background: "rgba(220,38,38,0.03)" }}
        >
          {pendingImage && (
            <div className="flex items-center gap-2">
              <img src={pendingImage.preview} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-red-100" />
              <span className="text-xs text-zinc-600 font-medium">Imagem pronta para enviar</span>
            </div>
          )}
          {isRecording && (
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-600 font-semibold">Gravando… {fmtTime(recordingSeconds)}</span>
              <button
                onClick={stopRecording}
                className="ml-1 text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Parar
              </button>
            </div>
          )}
          {pendingAudio && !isRecording && (
            <div className="flex items-center gap-2">
              <Mic size={14} style={{ color: "#dc2626" }} />
              <span className="text-xs text-zinc-600 font-medium">Áudio gravado ({fmtTime(pendingAudio.durationSec)})</span>
            </div>
          )}
          <button
            onClick={cancelMedia}
            className="ml-auto text-xs text-zinc-400 hover:text-red-600 transition-colors font-medium"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {/* ── Input Bar ── */}
      <div
        className="shrink-0 px-4 py-3 border-t border-red-50 rounded-b-xl"
        style={{ background: "#fff" }}
      >
        <div className="flex items-end gap-2">
          {/* Image button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping || isRecording}
            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-105 active:scale-95"
            style={{ color: pendingImage ? "#dc2626" : "#a1a1aa", background: pendingImage ? "rgba(220,38,38,0.08)" : "#f4f4f5" }}
            title="Enviar imagem"
          >
            <ImageIcon size={16} />
          </button>

          {/* Mic button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTyping || !!pendingImage}
            className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-105 active:scale-95 ${isRecording ? "animate-pulse" : ""}`}
            style={{
              color: isRecording || pendingAudio ? "#dc2626" : "#a1a1aa",
              background: isRecording ? "rgba(220,38,38,0.15)" : pendingAudio ? "rgba(220,38,38,0.08)" : "#f4f4f5",
            }}
            title={isRecording ? "Parar gravação" : "Gravar áudio"}
          >
            <Mic size={16} />
          </button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            placeholder={pendingImage ? "Descreva o que quer saber sobre a imagem… (opcional)" : pendingAudio ? "Adicione contexto ao áudio… (opcional)" : "Digite uma mensagem… (Enter para enviar)"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all leading-relaxed overflow-hidden disabled:opacity-50"
            style={{ maxHeight: 120 }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !pendingImage && !pendingAudio) || isTyping || isRecording}
            className="h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 shadow-sm"
            style={{ background: "linear-gradient(135deg,#ef4444,#b91c1c)" }}
            title="Enviar (Enter)"
          >
            {isTyping ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5 text-center">
          Fagner · Gemini 3.1 Pro Preview · suporta texto, imagem e áudio
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────


export default function Dashboard() {
  const { logs: liveLogs } = useBotLogs();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const { data: sessions } = useQuery<
    { id: string; startTime: string; endTime: string | null; status: string }[]
  >({
    queryKey: ["/api/sessions"],
    enabled: isHistoryOpen,
  });

  const { data: sessionLogs, isLoading: isLoadingSessionLogs } = useQuery<
    { message: string; level: string; timestamp: string }[]
  >({
    queryKey: [`/api/sessions/${selectedSessionId}/logs`],
    enabled: !!selectedSessionId,
  });

  const { data: botStatus, isLoading: isLoadingStatus } = useQuery<{ status: string }>({
    queryKey: ["/api/bot/status"],
    refetchInterval: 5000,
  });

  const { data: leadsByDay, isLoading: isLoadingLeadsByDay } = useQuery<
    { date: string; count: number }[]
  >({
    queryKey: ["/api/dashboard/leads-by-day"],
    refetchInterval: 30000,
  });

  const { data: leadsByOperator, isLoading: isLoadingLeadsByOp } = useQuery<
    { name: string; count: number }[]
  >({
    queryKey: ["/api/dashboard/leads-by-operator"],
    refetchInterval: 30000,
  });

  const { data: dashStats } = useQuery<{
    totalLeads: number;
    syncedToCrm: number;
    activeSessions: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 15000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (active: boolean) => {
      await apiRequest("POST", "/api/bot/toggle", { action: active ? "start" : "stop" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
    },
  });

  const isBotActive = botStatus?.status === "RUNNING" || botStatus?.status === "STARTING";
  const isStopping = botStatus?.status === "STOPPING";
  const isPending = isLoadingStatus || toggleMutation.isPending || isStopping;

  const statusLabel =
    botStatus?.status === "RUNNING"
      ? "EXECUTANDO"
      : botStatus?.status === "STARTING"
      ? "INICIANDO"
      : botStatus?.status === "STOPPING"
      ? "ENCERRANDO..."
      : botStatus?.status === "IDLE"
      ? "INATIVO"
      : "OFFLINE";

  return (
    <div className="flex flex-col h-full bg-zinc-50/60">

      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-white border-b border-red-100 shadow-sm">
        {/* Left: Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Painel de Controle</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Monitore o desempenho do robô e o status do sistema.
          </p>
        </div>

        {/* Right: Bot Status Pill */}
        <div
          className={`flex items-center gap-4 px-4 py-2.5 rounded-full border-2 transition-colors duration-300 ${
            isBotActive
              ? "border-red-200 bg-red-50"
              : "border-zinc-200 bg-white"
          }`}
        >
          {/* Icon */}
          <div
            className={`p-1.5 rounded-full transition-colors`}
            style={isBotActive
              ? { background: "rgba(220,38,38,0.10)", color: "#dc2626" }
              : { background: "#f4f4f5", color: "#71717a" }
            }
          >
            {isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : isBotActive ? (
              <Power size={18} />
            ) : (
              <PowerOff size={18} />
            )}
          </div>

          {/* Status text */}
          <div>
            <p className="text-xs font-medium text-zinc-700 leading-none mb-0.5">Status do Robô</p>
            <p
              className="text-xs font-bold leading-none"
              style={{ color: isBotActive ? "#dc2626" : "#71717a" }}
            >
              {statusLabel}
            </p>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-red-100" />

          {/* Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={isBotActive}
              disabled={isPending}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              id="bot-status"
              className="data-[state=checked]:bg-red-600"
            />
            <Label htmlFor="bot-status" className="cursor-pointer text-xs font-medium text-zinc-700">
              {isBotActive ? "Desligar" : "Ligar"}
            </Label>
          </div>
        </div>
      </div>

      {/* ── 2. TAB BAR ────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-6 bg-white border-b border-red-100">
        {(
          [
            { id: "overview" as ActiveTab, label: "Visão Geral",      icon: null },
            { id: "logs" as ActiveTab,     label: "Terminal de Logs", icon: null },
            { id: "live" as ActiveTab,     label: "Ao Vivo",          icon: Radio },
            { id: "flows" as ActiveTab,    label: "Monitor de Fluxos",icon: Activity },
          ] as { id: ActiveTab; label: string; icon: React.ElementType | null }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors duration-200 focus:outline-none ${
              activeTab === tab.id
                ? "text-zinc-800"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.icon && (
              <tab.icon
                size={13}
                className={tab.id === "live" ? (activeTab === "live" ? "text-emerald-500 animate-pulse" : "text-zinc-400") : ""}
              />
            )}
            {tab.label}
            <span
              className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full transition-all duration-300 origin-left`}
              style={{
                background: activeTab === tab.id ? "#dc2626" : "transparent",
                transform: activeTab === tab.id ? "scaleX(1)" : "scaleX(0)"
              }}
            />
          </button>
        ))}
      </div>

      {/* ── 3. CONTENT AREA ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden min-h-0 p-5">

        {/* ── TAB 1: VISÃO GERAL ────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div key="overview" className="h-full flex flex-col gap-4 animate-tab-enter">

            {/* Row 1: KPI Cards with stagger pop-in */}
            <div className="shrink-0 grid grid-cols-3 gap-4">
              <div className="animate-pop-in stagger-1">
                <KpiCard
                  title="Leads Capturados"
                  value={dashStats?.totalLeads ?? "—"}
                  icon={Users}
                  sub={dashStats ? `${dashStats.syncedToCrm} enviado(s) ao CRM` : "Carregando..."}
                />
              </div>
              <div className="animate-pop-in stagger-2">
                <KpiCard
                  title="Conversas Ativas"
                  value={dashStats?.activeSessions ?? "—"}
                  icon={MessageCircle}
                  sub="Sessões em andamento agora"
                />
              </div>
              <div className="animate-pop-in stagger-3">
                <KpiCard
                  title="Cards Criados no CRM"
                  value={dashStats?.syncedToCrm ?? "—"}
                  icon={CheckSquare}
                  sub={dashStats ? `de ${dashStats.totalLeads} conversa(s) total` : "Carregando..."}
                />
              </div>
            </div>

            {/* Row 2: Charts */}
            <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
              <div className="col-span-3 min-h-0 animate-pop-in stagger-4">
                <LeadsChart leadsByDay={leadsByDay} isLoading={isLoadingLeadsByDay} />
              </div>
              <div className="col-span-2 min-h-0 animate-pop-in stagger-5">
                <OperatorsChart leadsByOperator={leadsByOperator} isLoading={isLoadingLeadsByOp} />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: TERMINAL DE LOGS ───────────────────────────────────── */}
        {activeTab === "logs" && (
          <div key="logs" className="h-full animate-tab-enter">
            <TerminalLogs
              liveLogs={liveLogs}
              sessions={sessions}
              sessionLogs={sessionLogs}
              isLoadingSessionLogs={isLoadingSessionLogs}
              isHistoryOpen={isHistoryOpen}
              setIsHistoryOpen={setIsHistoryOpen}
              selectedSessionId={selectedSessionId}
              setSelectedSessionId={setSelectedSessionId}
            />
          </div>
        )}

        {/* ── TAB 3: AO VIVO ── (sempre montado para preservar estado do chat) */}
        <div key="live" className="h-full" style={{ display: activeTab === "live" ? "block" : "none" }}>
          <div className="h-full bg-white border border-red-100 shadow-sm rounded-xl overflow-hidden">
            <LiveChat />
          </div>
        </div>
        {/* ── TAB 4: MONITOR DE FLUXOS ───────────────────────────────────── */}
        {activeTab === "flows" && (
          <div key="flows" className="h-full p-4 animate-tab-enter overflow-hidden">
            <FlowMonitor />
          </div>
        )}
      </div>
    </div>
  );
}