import { useState, useEffect, useMemo } from "react";
import {
  Save, Play, Bot, Loader2, History, Copy, Check,
  RotateCcw, Sparkles, FileText, MessageSquare, User,
  ChevronDown, ChevronUp, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type HistoryItem = { id: string; timestamp: string; value: string; changedBy: string };

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function getUserInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

export default function PromptEditor() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPromptState] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [simulationResponse, setSimulationResponse] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: fetchedPrompt, isLoading } = useQuery<string>({
    queryKey: ["/api/settings/system_prompt"],
  });

  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ["/api/settings/prompt-history"],
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (fetchedPrompt !== undefined && fetchedPrompt !== null) {
      setPrompt(fetchedPrompt as string);
      setSavedPromptState(fetchedPrompt as string);
    }
  }, [fetchedPrompt]);

  const hasUnsavedChanges = prompt !== savedPrompt;
  const charCount = prompt.length;
  const words = wordCount(prompt);
  const lineCount = prompt.split("\n").length;

  const saveMutation = useMutation({
    mutationFn: async (value: string) => {
      await apiRequest("POST", "/api/settings", { key: "system_prompt", value });
    },
    onSuccess: () => {
      toast({ title: "✅ Configuração salva", description: "O novo prompt foi aplicado ao robô." });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/system_prompt"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/prompt-history"] });
      setSavedPromptState(prompt);
    }
  });

  const handleSimulate = async () => {
    if (!testMessage) return;
    setIsSimulating(true);
    setSimulationResponse(null);
    try {
      const response = await apiRequest("POST", "/api/bot/simulate", {
        systemPrompt: prompt,
        message: testMessage
      });
      const data = await response.json();
      setSimulationResponse(data.text || data.message || "Sem resposta.");
    } catch (error: any) {
      setSimulationResponse(`Erro na simulação: ${error.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopyHistory = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: "Copiado!", description: "Prompt antigo copiado para a área de transferência." });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRestoreHistory = (value: string) => {
    setPrompt(value);
    toast({ title: "Prompt restaurado", description: "O prompt antigo foi carregado no editor. Salve para aplicar." });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" size={32} style={{ color: "#dc2626" }} />
          <p className="text-sm text-zinc-500">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 animate-page-enter">

      {/* ── Page Header ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 shadow-xl"
        style={{ background: "linear-gradient(145deg, #1a0000, #7f1d1d, #450a0a, #1a0000)" }}
      >
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full blur-3xl" style={{ background: "rgba(239,68,68,0.12)" }} />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full blur-3xl" style={{ background: "rgba(127,29,29,0.15)" }} />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl backdrop-blur"
              style={{ background: "rgba(255,255,255,0.10)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
            >
              <Sparkles size={22} style={{ color: "#fca5a5" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Editor de Prompt</h1>
                {hasUnsavedChanges && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1"
                    style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", borderColor: "rgba(251,191,36,0.30)" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Não salvo
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm" style={{ color: "rgba(252,165,165,0.75)" }}>
                Configure a inteligência central e a personalidade do seu robô.
              </p>
            </div>
          </div>
          <Button
            disabled={saveMutation.isPending || !hasUnsavedChanges}
            onClick={() => saveMutation.mutate(prompt)}
            className={`gap-2 font-semibold shadow-lg transition-all`}
            style={hasUnsavedChanges
              ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626, #ef4444)", color: "#fff", boxShadow: "0 4px 14px rgba(220,38,38,0.30)" }
              : { background: "rgba(255,255,255,0.10)", color: "rgba(254,202,202,0.50)" }
            }
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Configuração
          </Button>
        </div>
      </div>

      {/* ── Prompt Editor Card ── */}
      <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-red-50 bg-zinc-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <FileText size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Prompt do Sistema</h2>
              <p className="text-xs text-zinc-500">Escreva as instruções em texto simples ou Markdown.</p>
            </div>
          </div>
          {/* Stats pills */}
          <div className="hidden sm:flex items-center gap-2">
            {[
              { label: `${charCount.toLocaleString()} caracteres` },
              { label: `${words.toLocaleString()} palavras` },
              { label: `${lineCount} linhas` },
            ].map(p => (
              <span key={p.label} className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium" style={{ color: "#991b1b" }}>
                {p.label}
              </span>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full min-h-[500px] border-0 rounded-none resize-none focus-visible:ring-0 p-6 font-mono text-sm leading-relaxed text-zinc-800 bg-[#FAFAFA] placeholder:text-zinc-400"
          placeholder="Digite as instruções do sistema aqui..."
        />

        {/* Footer bar */}
        <div className="flex items-center justify-between border-t border-red-50 bg-zinc-50/60 px-6 py-2.5">
          <span className="text-xs text-zinc-400">
            {hasUnsavedChanges ? "Alterações pendentes de salvamento" : "Prompt sincronizado com o robô"}
          </span>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${hasUnsavedChanges ? "text-amber-500" : "text-emerald-500"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${hasUnsavedChanges ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
            {hasUnsavedChanges ? "Não salvo" : "Salvo"}
          </div>
        </div>
      </div>

      {/* ── Simulator + Quick Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Simulator (2/3 width) */}
        <div className="lg:col-span-2 rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 border-b border-red-50 bg-zinc-50/80 px-6 py-4">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <Bot size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Simulador de IA</h2>
              <p className="text-xs text-zinc-500">Teste o comportamento do robô com o prompt atual.</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <Input
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="ex: 'Olá, gostaria de saber os preços'"
                className="bg-zinc-50 border-red-100 text-sm focus-visible:ring-red-200"
                onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
              />
              <Button
                onClick={handleSimulate}
                disabled={!testMessage || isSimulating}
                className="gap-2 shrink-0 text-white"
                style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
              >
                {isSimulating ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                {isSimulating ? "Simulando..." : "Testar"}
              </Button>
            </div>

            {/* Response area */}
            <div className="min-h-[160px] rounded-xl border border-red-100 bg-red-50/30 p-4">
              {isSimulating ? (
                <div className="flex h-full items-center justify-center gap-2 text-zinc-400 text-sm min-h-[120px]">
                  <Loader2 className="animate-spin" size={18} />
                  <span>Gerando resposta...</span>
                </div>
              ) : simulationResponse ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    >
                      <Bot size={12} />
                    </div>
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Resposta do Robô</span>
                  </div>
                  <div className="rounded-lg bg-white border border-red-100 p-4 text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap font-sans max-h-[280px] overflow-y-auto">
                    {simulationResponse}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full items-center justify-center gap-2 text-zinc-400 text-sm min-h-[120px]">
                  <MessageSquare size={24} className="text-red-200" />
                  <span className="italic">Digite uma mensagem e clique em "Testar" para ver o resultado.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats (1/3 width) */}
        <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 border-b border-red-50 bg-zinc-50/80 px-6 py-4">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
            >
              <Zap size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Estatísticas</h2>
              <p className="text-xs text-zinc-500">Métricas do prompt atual.</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {[
              { label: "Caracteres", value: charCount.toLocaleString(), style: { background: "rgba(220,38,38,0.07)", color: "#991b1b" } },
              { label: "Palavras", value: words.toLocaleString(), style: { background: "rgba(239,68,68,0.07)", color: "#b91c1c" } },
              { label: "Linhas", value: lineCount.toString(), style: { background: "rgba(127,29,29,0.07)", color: "#7f1d1d" } },
              { label: "Versões no Histórico", value: (history?.length ?? 0).toString(), style: { background: "rgba(251,191,36,0.10)", color: "#92400e" } },
            ].map(stat => (
              <div key={stat.label} className="flex items-center justify-between rounded-xl border border-red-50 bg-zinc-50/50 px-4 py-3">
                <span className="text-sm text-zinc-600">{stat.label}</span>
                <span className="rounded-lg px-2.5 py-0.5 text-sm font-bold" style={stat.style}>{stat.value}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-red-50">
              <p className="text-xs text-zinc-400 text-center">
                {hasUnsavedChanges ? "⚠️ Existem alterações não salvas" : "✓ Tudo sincronizado"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── History Section ── */}
      <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-red-50 bg-zinc-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <History size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Histórico de Alterações</h2>
              <p className="text-xs text-zinc-500">Versões anteriores do prompt. Restaure ou copie conforme necessário.</p>
            </div>
          </div>
          {history && history.length > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold" style={{ color: "#991b1b" }}>
              {history.length} {history.length === 1 ? "versão" : "versões"}
            </span>
          )}
        </div>

        <div className="divide-y divide-red-50">
          {history && history.length > 0 ? (
            history.map((item) => {
              const isExpanded = expandedId === item.id;
              const hasContent = item.value && item.value.trim().length > 0;
              const preview = hasContent ? item.value.slice(0, 120) + (item.value.length > 120 ? "..." : "") : "Prompt vazio ou não disponível.";

              return (
                <div key={item.id} className="p-4 hover:bg-red-50/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: metadata */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* User Avatar */}
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold shadow-sm"
                        style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                      >
                        {getUserInitials(item.changedBy || "S")}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-zinc-700">{item.changedBy || "Sistema"}</span>
                          <span className="text-xs text-zinc-400">·</span>
                          <span className="text-xs text-zinc-400">{formatDate(item.timestamp)}</span>
                          {!hasContent && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Vazio</span>
                          )}
                        </div>

                        {/* Preview text */}
                        <div className={`text-xs text-zinc-500 font-mono leading-relaxed ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>
                          {isExpanded ? (hasContent ? item.value : "Nenhum conteúdo disponível.") : preview}
                        </div>

                        {/* Expand/collapse toggle */}
                        {hasContent && item.value.length > 120 && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="mt-1.5 flex items-center gap-1 text-xs font-medium transition-colors"
                            style={{ color: "#dc2626" }}
                          >
                            {isExpanded ? (
                              <><ChevronUp size={12} /> Ver menos</>
                            ) : (
                              <><ChevronDown size={12} /> Ver mais</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs border-red-100 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        disabled={!hasContent}
                        onClick={() => handleRestoreHistory(item.value)}
                        title="Carregar este prompt no editor"
                      >
                        <RotateCcw size={12} />
                        Restaurar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs border-red-100"
                        disabled={!hasContent}
                        onClick={() => handleCopyHistory(item.value, item.id)}
                        title="Copiar prompt para área de transferência"
                      >
                        {copiedId === item.id ? (
                          <><Check size={12} className="text-emerald-500" /> Copiado</>
                        ) : (
                          <><Copy size={12} /> Copiar</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <History size={24} className="text-red-200" />
              </div>
              <p className="text-sm font-medium text-zinc-500">Nenhuma alteração registrada</p>
              <p className="text-xs text-zinc-400 text-center max-w-xs">
                Ao salvar o prompt, a versão anterior será automaticamente preservada aqui.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}