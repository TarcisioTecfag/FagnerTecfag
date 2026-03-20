// client/src/pages/ConversasConfig.tsx
// Página dedicada para configuração da integração com RD Station Conversas

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MessageSquare,
  Key,
  Wifi,
  Phone,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Users,
  FileText,
  Map,
  ArrowLeftRight,
  RotateCcw,
} from "lucide-react";


interface RdStatus {
  configured: boolean;
  hasIntegration: boolean;
  integration: string;
  whitelistCount: number;
  whitelist: string[];
  humanFlowId: string;
}

interface RdFlow {
  id: string;
  title: string;
}

interface RdEmployee {
  id: string;
  name: string;
  email: string;
}

interface RdTemplate {
  id: string;
  title: string;
  content: string;
}

export default function ConversasConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rdToken,       setRdToken]       = useState("");
  const [rdIntegration, setRdIntegration] = useState("");
  const [rdWhitelist,   setRdWhitelist]   = useState("");
  const [rdHumanFlowId, setRdHumanFlowId] = useState("");

  const { data: rdStatus, refetch: refetchStatus } = useQuery<RdStatus>({
    queryKey: ["/api/rd-conversas/status"],
    staleTime: 30_000,
  });

  const { data: flows = [], refetch: refetchFlows, isFetching: fetchingFlows } = useQuery<RdFlow[]>({
    queryKey: ["/api/rd-conversas/flows"],
    enabled: rdStatus?.configured ?? false,
    staleTime: 60_000,
  });

  const { data: employees = [], refetch: refetchEmployees, isFetching: fetchingEmployees } = useQuery<RdEmployee[]>({
    queryKey: ["/api/rd-conversas/employees"],
    enabled: rdStatus?.configured ?? false,
    staleTime: 60_000,
  });

  const { data: templates = [], refetch: refetchTemplates, isFetching: fetchingTemplates } = useQuery<RdTemplate[]>({
    queryKey: ["/api/rd-conversas/templates"],
    enabled: rdStatus?.configured ?? false,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/rd-conversas/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rd-conversas/status"] });
      refetchStatus();
      toast({ title: "Sucesso", description: "Configurações salvas com sucesso." });
    },
    onError: () => toast({ title: "Erro", description: "Falha ao salvar configuração.", variant: "destructive" }),
  });

  // Round-robin de peças
  const { data: rrState, refetch: refetchRR } = useQuery<{
    currentIndex: number;
    nextSector: string;
    sectors: string[];
  }>({
    queryKey: ["/api/rd-conversas/pecas-rr"],
    refetchInterval: 10_000,
  });

  const resetRRMutation = useMutation({
    mutationFn: (index: number) => apiRequest("POST", "/api/rd-conversas/pecas-rr/reset", { index }),
    onSuccess: () => {
      refetchRR();
      toast({ title: "Round-Robin ajustado", description: "Próximo setor atualizado com sucesso." });
    },
  });

  const cardClass = "bg-white rounded-3xl border border-red-100 shadow-sm p-8 space-y-5 relative overflow-hidden group hover:border-red-200 transition-colors";
  const barClass  = "absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500";
  const barStyle  = { background: "linear-gradient(90deg, #991b1b, #ef4444, #991b1b)" };
  const iconStyle = { background: "linear-gradient(135deg, #7f1d1d, #dc2626)" };
  const btnStyle  = { background: "linear-gradient(135deg, #7f1d1d, #dc2626)" };

  function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
    return (
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl text-white" style={iconStyle}><Icon size={20} /></div>
        <div>
          <h3 className="text-lg font-bold text-zinc-950">{title}</h3>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col animate-page-enter">
      {/* Header */}
      <div
        className="px-8 py-6 border-b shrink-0"
        style={{
          background: "linear-gradient(135deg, #1a0000 0%, #3b0000 50%, #1a0000 100%)",
          borderColor: "rgba(153,27,27,0.35)",
        }}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg" style={iconStyle}>
            <MessageSquare size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Configurações de Conversas</h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(252,165,165,0.75)" }}>
              Integração com RD Station Conversas (Tallos) — API v2/v3
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-8 space-y-6 max-w-4xl w-full mx-auto">

        {/* Status banner */}
        <div className={`flex items-center gap-4 p-5 rounded-2xl border shadow-sm ${
          rdStatus?.configured ? "border-emerald-100 bg-emerald-50/40" : "border-amber-100 bg-amber-50/40"
        }`}>
          {rdStatus?.configured
            ? <CheckCircle2 size={28} className="text-emerald-600 shrink-0" />
            : <AlertCircle  size={28} className="text-amber-500 shrink-0" />}
          <div className="flex-1">
            <p className={`font-bold text-base ${rdStatus?.configured ? "text-emerald-900" : "text-amber-900"}`}>
              {rdStatus?.configured ? "RD Conversas Conectado" : "RD Conversas não configurado"}
            </p>
            <p className="text-sm text-zinc-500 mt-0.5">
              {rdStatus?.configured
                ? `Chip: ${rdStatus.integration || "(não definido)"} · Whitelist: ${rdStatus.whitelistCount} número(s) · Fluxo humano: ${rdStatus.humanFlowId ? "✓ configurado" : "não configurado"}`
                : "Configure o Token JWT abaixo para ativar a integração com o RD Conversas."}
            </p>
          </div>
          {rdStatus?.configured && (
            <Button variant="ghost" size="sm" onClick={() => refetchStatus()} className="text-zinc-500 hover:text-zinc-700 rounded-xl">
              <RefreshCw size={14} className="mr-1.5" /> Atualizar
            </Button>
          )}
        </div>

        {/* Token JWT */}
        <div className={cardClass}>
          <div className={barClass} style={barStyle} />
          <SectionTitle icon={Key} title="Token JWT" subtitle="Obtido em: RD Conversas → Apps e Integrações → API" />
          <div className="flex gap-3">
            <Input
              type="password"
              placeholder={rdStatus?.configured ? "Token configurado (••••••••••)" : "Cole o token JWT aqui"}
              value={rdToken}
              onChange={(e) => setRdToken(e.target.value)}
              className="font-mono bg-zinc-50/80 border-red-100 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 h-12 rounded-xl text-base px-4"
            />
            <Button
              onClick={() => { saveMutation.mutate({ token: rdToken }); setRdToken(""); }}
              disabled={!rdToken || saveMutation.isPending}
              className="text-white font-medium px-8 h-12 rounded-xl shrink-0"
              style={btnStyle}
            >
              Salvar
            </Button>
          </div>
          {rdStatus?.configured && (
            <p className="text-xs text-emerald-600 font-medium">✓ Token JWT ativo. Para trocar, cole o novo token acima.</p>
          )}
        </div>

        {/* Chip + Whitelist + Flow ID */}
        <div className={cardClass}>
          <div className={barClass} style={barStyle} />
          <SectionTitle icon={Wifi} title="Configurações de Operação" subtitle="Chip de WhatsApp, whitelist de teste e fluxo de atendimento humano" />

          <div className="space-y-6">
            {/* Chip */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 ml-1">
                <MessageSquare size={11} /> Nome do Chip (Integration)
              </Label>
              <p className="text-xs text-zinc-400 ml-1">Nome exato do chip de WhatsApp Business cadastrado no RD Conversas.</p>
              <div className="flex gap-3">
                <Input
                  placeholder={rdStatus?.integration || "Ex: Chip Tecfag Principal"}
                  value={rdIntegration}
                  onChange={(e) => setRdIntegration(e.target.value)}
                  className="h-12 border-red-100 bg-zinc-50/50 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 rounded-xl"
                />
                <Button
                  onClick={() => { saveMutation.mutate({ integration: rdIntegration }); setRdIntegration(""); }}
                  disabled={!rdIntegration || saveMutation.isPending}
                  className="text-white px-6 h-12 rounded-xl shrink-0"
                  style={btnStyle}
                >Salvar</Button>
              </div>
            </div>

            {/* Whitelist */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 ml-1">
                <Phone size={11} /> Whitelist de Teste
              </Label>
              <p className="text-xs text-zinc-400 ml-1">
                Somente esses números receberão resposta do bot durante os testes. Deixe vazio para atender todos.<br/>
                Formato: números separados por vírgula (ex: 5514998364338, 5511999998888)
              </p>
              <div className="flex gap-3">
                <Input
                  placeholder="5514998364338, 5511999998888"
                  value={rdWhitelist}
                  onChange={(e) => setRdWhitelist(e.target.value)}
                  className="h-12 border-red-100 bg-zinc-50/50 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 rounded-xl font-mono text-sm"
                />
                <Button
                  onClick={() => {
                    const nums = rdWhitelist.split(",").map((n) => n.trim()).filter(Boolean);
                    saveMutation.mutate({ whitelist: nums });
                    setRdWhitelist("");
                  }}
                  disabled={!rdWhitelist || saveMutation.isPending}
                  className="text-white px-6 h-12 rounded-xl shrink-0"
                  style={btnStyle}
                >Salvar</Button>
              </div>
              {/* Numbers ativos */}
              {(rdStatus?.whitelist?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {rdStatus!.whitelist.map((n) => (
                    <span key={n} className="bg-red-50 text-red-800 border border-red-100 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold">{n}</span>
                  ))}
                </div>
              )}
              {(rdStatus?.whitelist?.length ?? 0) === 0 && rdStatus?.configured && (
                <p className="text-xs text-emerald-600 font-medium ml-1">✓ Whitelist vazia — bot atende todos os contatos.</p>
              )}
            </div>

            {/* Flow ID */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 ml-1">
                <GitBranch size={11} /> ID do Fluxo de Atendimento Humano
              </Label>
              <p className="text-xs text-zinc-400 ml-1">ID do fluxo interno do RD Conversas para onde o Fagner encaminha o cliente ao finalizar a triagem. Consulte a lista abaixo.</p>
              <div className="flex gap-3">
                <Input
                  placeholder={rdStatus?.humanFlowId || "Ex: 6789abcdef1234567890"}
                  value={rdHumanFlowId}
                  onChange={(e) => setRdHumanFlowId(e.target.value)}
                  className="h-12 border-red-100 bg-zinc-50/50 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 rounded-xl font-mono text-sm"
                />
                <Button
                  onClick={() => { saveMutation.mutate({ humanFlowId: rdHumanFlowId }); setRdHumanFlowId(""); }}
                  disabled={!rdHumanFlowId || saveMutation.isPending}
                  className="text-white px-6 h-12 rounded-xl shrink-0"
                  style={btnStyle}
                >Salvar</Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Round-Robin Peças ── */}
        <div className={cardClass}>
          <div className={barClass} style={barStyle} />
          <div className="flex items-center justify-between">
            <SectionTitle
              icon={ArrowLeftRight}
              title="Round-Robin — Setor de Peças"
              subtitle="Alternância automática e justa entre os dois setores de peças"
            />
            <Button variant="ghost" size="sm" onClick={() => refetchRR()} className="text-zinc-500 hover:text-zinc-700 rounded-xl">
              <RefreshCw size={14} className="mr-1.5" /> Atualizar
            </Button>
          </div>

          {/* Indicador visual */}
          <div className="grid grid-cols-2 gap-4">
            {(rrState?.sectors ?? ["Tecfag Peças", "Tecfag Peças 2"]).map((sector, i) => {
              const isNext = rrState?.nextSector === sector;
              return (
                <div
                  key={sector}
                  className={`p-5 rounded-2xl border-2 transition-all ${
                    isNext
                      ? "border-red-500 bg-red-50/60 shadow-md"
                      : "border-red-100 bg-white opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-sm text-zinc-800">{sector}</span>
                    {isNext && (
                      <span className="text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full animate-pulse">
                        ← PRÓXIMO
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isNext ? "default" : "outline"}
                    onClick={() => resetRRMutation.mutate(i)}
                    disabled={resetRRMutation.isPending}
                    className={`w-full rounded-xl text-xs font-semibold ${isNext ? "text-white" : "border-red-200 text-red-700 hover:bg-red-50"}`}
                    style={isNext ? btnStyle : {}}
                  >
                    <RotateCcw size={12} className="mr-1.5" />
                    Forçar próximo para este
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-zinc-400">
            A cada atendimento do fluxo <strong>Peças</strong>, o Fagner alterna automaticamente entre os dois setores. Use os botões acima para ajustar manualmente se necessário.
          </p>
        </div>

        {/* Consultas — só exibe se conectado */}

        {rdStatus?.configured && (
          <>
            {/* Fluxos disponíveis */}
            <div className={cardClass}>
              <div className={barClass} style={barStyle} />
              <div className="flex items-center justify-between">
                <SectionTitle icon={GitBranch} title="Fluxos Disponíveis" subtitle="Fluxos internos cadastrados no RD Conversas" />
                <Button variant="ghost" size="sm" onClick={() => refetchFlows()} disabled={fetchingFlows} className="text-zinc-500 hover:text-zinc-700 rounded-xl">
                  <RefreshCw size={14} className={`mr-1.5 ${fetchingFlows ? "animate-spin" : ""}`} /> Atualizar
                </Button>
              </div>
              {flows.length === 0
                ? <p className="text-sm text-zinc-400">Nenhum fluxo encontrado. Clique em Atualizar.</p>
                : (
                  <div className="divide-y divide-red-50 border border-red-100 rounded-2xl overflow-hidden">
                    {flows.map((f) => (
                      <div key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-red-50/30 transition-colors">
                        <span className="font-medium text-sm text-zinc-800">{f.title}</span>
                        <span
                          className="font-mono text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-red-100 hover:text-red-700 transition-colors"
                          title="Clique para copiar"
                          onClick={() => { navigator.clipboard.writeText(f.id); toast({ title: "ID copiado!", description: f.id }); }}
                        >{f.id}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Operadores */}
            <div className={cardClass}>
              <div className={barClass} style={barStyle} />
              <div className="flex items-center justify-between">
                <SectionTitle icon={Users} title="Operadores Cadastrados" subtitle="Funcionários com acesso ao RD Conversas" />
                <Button variant="ghost" size="sm" onClick={() => refetchEmployees()} disabled={fetchingEmployees} className="text-zinc-500 hover:text-zinc-700 rounded-xl">
                  <RefreshCw size={14} className={`mr-1.5 ${fetchingEmployees ? "animate-spin" : ""}`} /> Atualizar
                </Button>
              </div>
              {employees.length === 0
                ? <p className="text-sm text-zinc-400">Nenhum operador encontrado. Clique em Atualizar.</p>
                : (
                  <div className="divide-y divide-red-50 border border-red-100 rounded-2xl overflow-hidden">
                    {employees.map((e) => (
                      <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-red-50/30 transition-colors">
                        <div>
                          <p className="font-medium text-sm text-zinc-800">{e.name}</p>
                          <p className="text-xs text-zinc-400">{e.email}</p>
                        </div>
                        <span className="font-mono text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-lg">{e.id}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Templates */}
            <div className={cardClass}>
              <div className={barClass} style={barStyle} />
              <div className="flex items-center justify-between">
                <SectionTitle icon={FileText} title="Templates de Mensagem" subtitle="Templates aprovados pelo Meta disponíveis para envio" />
                <Button variant="ghost" size="sm" onClick={() => refetchTemplates()} disabled={fetchingTemplates} className="text-zinc-500 hover:text-zinc-700 rounded-xl">
                  <RefreshCw size={14} className={`mr-1.5 ${fetchingTemplates ? "animate-spin" : ""}`} /> Atualizar
                </Button>
              </div>
              {templates.length === 0
                ? <p className="text-sm text-zinc-400">Nenhum template encontrado. Clique em Atualizar.</p>
                : (
                  <div className="divide-y divide-red-50 border border-red-100 rounded-2xl overflow-hidden">
                    {templates.map((t) => (
                      <div key={t.id} className="px-5 py-3 hover:bg-red-50/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-zinc-800">{t.title}</p>
                          <span className="font-mono text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-lg">{t.id}</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{t.content}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Mapa de departamentos */}
            <div className={cardClass}>
              <div className={barClass} style={barStyle} />
              <SectionTitle
                icon={Map}
                title="Mapa de Departamentos"
                subtitle="Como o Fagner redireciona cada fluxo para o departamento correto do RD Conversas"
              />
              <p className="text-xs text-zinc-400">
                Os nomes abaixo devem ser <strong>idênticos</strong> aos departamentos cadastrados no painel RD Conversas. Para personalizar, use a configuração <code className="bg-zinc-100 px-1.5 py-0.5 rounded">fagner_department_map</code> nas settings do banco.
              </p>
              <div className="divide-y divide-red-50 border border-red-100 rounded-2xl overflow-hidden text-sm">
                {[
                  { flow: "PECAS",        dept: "Tecfag Peças" },
                  { flow: "MAQUINAS",     dept: "Tecfag Maquinas" },
                  { flow: "PERSONNALITE", dept: "Tecfag PersonnalIté" },
                  { flow: "2A_BOLETO",    dept: "FINANCEIRO" },
                  { flow: "2B_NF",        dept: "FINANCEIRO" },
                  { flow: "2C_OUTROS",    dept: "FINANCEIRO" },
                  { flow: "3_AT",         dept: "ASSISTÊNCIA TÉCNICA" },
                  { flow: "4A_RASTREAR",  dept: "PÓS VENDA" },
                  { flow: "4B_NF",        dept: "PÓS VENDA" },
                  { flow: "5A_CLIENTE",   dept: "RECEPÇÃO" },
                  { flow: "5B_CURRICULO", dept: "ADMINISTRADORES" },
                ].map(({ flow, dept }) => (
                  <div key={flow} className="flex items-center justify-between px-5 py-2.5 hover:bg-red-50/20 transition-colors">
                    <span className="font-mono font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg text-xs">{flow}</span>
                    <span className="text-zinc-600 font-medium">{dept}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
