import { useState, useEffect } from "react";
import {
  Database, Key, Link as LinkIcon, CheckCircle2, AlertTriangle, Plus, Trash2,
  Loader2, RefreshCw, Users2, ArrowRight, RotateCcw, Plug, GitBranch,
  ShieldCheck, WifiOff, ChevronRight, Zap, Settings2, Clock, Edit2, Save, X
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

// ── Standard fields ───────────────────────────────────────────────────────────
const STANDARD_FIELDS: Record<string, { value: string; label: string }[]> = {
  deal: [{ value: "__std__name", label: "Título do Card (name)" }],
  contact: [
    { value: "__std__name", label: "Nome do Contato (name)" },
    { value: "__std__email", label: "E-mail (email)" },
    { value: "__std__phone", label: "Telefone (phone)" },
    { value: "__std__facebook", label: "Facebook (facebook)" },
    { value: "__std__linkedin", label: "LinkedIn (linkedin)" },
  ],
  organization: [
    { value: "__std__name", label: "Nome da Empresa (name)" },
    { value: "__std__website", label: "Website (website)" },
    { value: "__std__phone", label: "Telefone (phone)" },
    { value: "__std__email", label: "E-mail (email)" },
    { value: "__std__instagram", label: "Instagram (instagram)" },
    { value: "__std__facebook", label: "Facebook (facebook)" },
    { value: "__std__linkedin", label: "LinkedIn (linkedin)" },
    { value: "__std__twitter", label: "Twitter (twitter)" },
    { value: "__std__market_segment", label: "Segmento de Mercado (market_segment)" },
    { value: "__std__annual_revenue", label: "Receita Anual (annual_revenue)" },
    { value: "__std__number_of_employees", label: "Nº de Funcionários (number_of_employees)" },
    { value: "__std__city", label: "Cidade (city)" },
    { value: "__std__state", label: "Estado (state)" },
    { value: "__std__country", label: "País (country)" },
    { value: "__std__zip_code", label: "CEP (zip_code)" },
    { value: "__std__address", label: "Endereço (address)" },
  ],
};

const ENTITY_COLORS: Record<string, string> = {
  deal:         "bg-zinc-100 text-zinc-700 border-zinc-300",
  contact:      "bg-zinc-100 text-zinc-700 border-zinc-300",
  organization: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "auth",            label: "Autenticação",            icon: ShieldCheck, rdOnly: false },
  { id: "funnel",          label: "Funil & Etapa",           icon: GitBranch,   rdOnly: true },
  { id: "owner",           label: "Responsável & Rodízio",   icon: Users2,      rdOnly: true },
  { id: "mapping-rd",      label: "Mapeamento RD Station",   icon: Zap,         rdOnly: true },
  { id: "mapping-generic", label: "Mapeamento Genérico",     icon: LinkIcon,    rdOnly: false },
  { id: "operators",       label: "Operadores por Fluxo",    icon: Users2,      rdOnly: false },
  { id: "schedule",        label: "Horário de Atendimento",  icon: Clock,       rdOnly: false },
];

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-5 border-b border-zinc-200">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-lg bg-zinc-100 border border-zinc-200">
          <Icon size={18} className="text-zinc-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          {description && <p className="text-sm text-zinc-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CRMConfig() {
  const { toast } = useToast();
  const [apiKey, setApiKey]           = useState("");
  const [provider, setProvider]       = useState("hubspot");
  const [mappings, setMappings]       = useState<{ id: number; aiIntent: string; crmField: string }[]>([]);
  const [pipelineId, setPipelineId]   = useState("");
  const [stageId, setStageId]         = useState("");
  const [rdMappings, setRdMappings]   = useState<
    { id: number; botField: string; crmFieldId: string; entity: "deal" | "organization" | "contact" }[]
  >([]);
  const [rrMode, setRrMode]             = useState<"fixed" | "roundrobin">("fixed");
  const [rrFixedOwnerId, setRrFixedOwnerId] = useState("");
  const [rrUsers, setRrUsers]           = useState<{ id: string; name: string }[]>([]);
  const [rrCurrentIndex, setRrCurrentIndex] = useState(0);
  const [connected, setConnected]       = useState<boolean | null>(null);

  const isRD = provider === "rd_station";

  // Active tab — defaults to first visible
  const visibleNav = NAV_ITEMS.filter((n) => !n.rdOnly || isRD);
  const [activeTab, setActiveTab] = useState("auth");

  // Operadores por fluxo
  const SUBFLOW_LABELS: Record<string, string> = {
    PECAS:         "Peças (Fluxo 1)",
    MAQUINAS:      "Máquinas (Fluxo 1)",
    PERSONNALITE:  "Personnalite (Fluxo 1)",
    "2A_BOLETO":   "Boleto / 2ª via",
    "2B_NF":       "Nota Fiscal Financeiro",
    "2C_OUTROS":   "Outros Financeiro",
    "3_AT":        "Assistência Técnica",
    "4A_RASTREAR": "Rastrear Pedido",
    "4B_NF":       "NF do Pedido",
    "5A_CLIENTE":  "Cliente Geral",
  };

  type Operator = { name: string; id: string };
  const [operators, setOperators] = useState<Record<string, Operator[]>>({});
  const [editingOp, setEditingOp] = useState<string | null>(null);
  const [editOpForm, setEditOpForm] = useState<Operator>({ name: "", id: "" });

  // Horário de atendimento
  const [schedule, setSchedule] = useState({
    enabled: true,
    weekdays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 18,
    timezone: "America/Sao_Paulo",
    offHoursMessage: "Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h. Retornamos em breve!",
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingOps, setSavingOps] = useState(false);

  const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const { data: operatorsData } = useQuery<Record<string, Operator[]>>({
    queryKey: ["/api/fagner/operators"],
    queryFn: async () => {
      const res = await fetch("/api/fagner/operators", { credentials: "include" });
      return res.json();
    },
  });

  const { data: scheduleData } = useQuery<typeof schedule>({
    queryKey: ["/api/fagner/schedule"],
    queryFn: async () => {
      const res = await fetch("/api/fagner/schedule", { credentials: "include" });
      return res.json();
    },
  });

  useEffect(() => { if (operatorsData) setOperators(operatorsData); }, [operatorsData]);
  useEffect(() => { if (scheduleData) setSchedule(scheduleData); }, [scheduleData]);

  const handleSaveOperators = async () => {
    setSavingOps(true);
    try {
      const res = await fetch("/api/fagner/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(operators),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      toast({ title: "Operadores salvos!", description: "Configuração de operadores por fluxo atualizada." });
      queryClient.invalidateQueries({ queryKey: ["/api/fagner/operators"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingOps(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/fagner/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(schedule),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      toast({ title: "Horário salvo!", description: "Configuração de horário atualizada." });
      queryClient.invalidateQueries({ queryKey: ["/api/fagner/schedule"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingSchedule(false);
    }
  };

  // Reset tab to auth whenever RD-only tabs become invisible
  useEffect(() => {
    const visible = NAV_ITEMS.filter((n) => !n.rdOnly || isRD);
    if (!visible.find((n) => n.id === activeTab)) setActiveTab("auth");
  }, [isRD]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: config, isLoading } = useQuery<any>({ queryKey: ["/api/settings/crm_config"] });

  useEffect(() => {
    if (config) {
      setApiKey(config.apiKey || "");
      setProvider(config.provider || "hubspot");
      setMappings(config.mappings || []);
      setPipelineId(config.pipelineId || "");
      setStageId(config.stageId || "");
      setRdMappings(config.rdMappings || []);
    }
  }, [config]);

  const { data: rrConfig } = useQuery<any>({
    queryKey: ["/api/rd-crm/roundrobin"],
    enabled: isRD && !!apiKey,
    queryFn: async () => {
      const res = await fetch("/api/rd-crm/roundrobin", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar rodízio");
      return res.json();
    },
  });

  useEffect(() => {
    if (rrConfig) {
      setRrMode(rrConfig.mode || "fixed");
      setRrFixedOwnerId(rrConfig.fixedOwnerId || "");
      setRrUsers(rrConfig.users || []);
      setRrCurrentIndex(rrConfig.currentIndex || 0);
    }
  }, [rrConfig]);

  const { data: rdPipelines } = useQuery<any[]>({
    queryKey: ["/api/rd-crm/pipelines"],
    enabled: isRD && !!apiKey,
  });

  const { data: filteredStages } = useQuery<any[]>({
    queryKey: ["/api/rd-crm/pipelines", pipelineId, "stages"],
    enabled: isRD && !!apiKey && !!pipelineId,
    queryFn: async () => {
      const res = await fetch(`/api/rd-crm/pipelines/${pipelineId}/stages`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar etapas");
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || [];
    },
  });

  const { data: rdCustomFields } = useQuery<any[]>({
    queryKey: ["/api/rd-crm/custom-fields"],
    enabled: isRD && !!apiKey,
    queryFn: async () => {
      const res = await fetch("/api/rd-crm/custom-fields", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar campos");
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || [];
    },
  });

  const { data: rdUsers, isFetching: isLoadingUsers, refetch: refetchUsers } = useQuery<
    { id: string; name: string; email: string }[]
  >({
    queryKey: ["/api/rd-crm/users"],
    enabled: false,
    queryFn: async () => {
      const res = await fetch("/api/rd-crm/users", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar usuários");
      return res.json();
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (value: any) => {
      await apiRequest("POST", "/api/settings", { key: "crm_config", value });
    },
    onSuccess: () => {
      toast({ title: "Configurações salvas", description: "As configurações de CRM foram atualizadas." });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/crm_config"] });
    },
  });

  const saveRRMutation = useMutation({
    mutationFn: async (rrData: any) => {
      const res = await fetch("/api/rd-crm/roundrobin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(rrData),
      });
      if (!res.ok) throw new Error("Erro ao salvar rodízio");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rodízio salvo!", description: "Configuração de responsável/rodízio atualizada." });
      queryClient.invalidateQueries({ queryKey: ["/api/rd-crm/roundrobin"] });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiRequest("POST", "/api/rd-crm/test", { token });
      return res.json();
    },
    onSuccess: (data) => {
      setConnected(true);
      toast({ title: "Conexão bem-sucedida", description: data.message || "RD CRM conectado." });
    },
    onError: (e: any) => {
      setConnected(false);
      toast({ title: "Falha na conexão", description: e.message, variant: "destructive" });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rd-crm/refresh-token");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.token) setApiKey(data.token);
      toast({ title: "Token Renovado", description: data.message || "Access Token renovado." });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/crm_config"] });
    },
    onError: (e: any) => toast({ title: "Falha na renovação", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = () =>
    saveMutation.mutate({ apiKey, provider, mappings, pipelineId, stageId, rdMappings });

  const addMapping    = () => setMappings([...mappings, { id: Date.now(), aiIntent: "", crmField: "" }]);
  const removeMapping = (id: number) => setMappings(mappings.filter((m) => m.id !== id));
  const updateMapping = (id: number, field: string, value: string) =>
    setMappings(mappings.map((m) => (m.id === id ? { ...m, [field]: value } : m)));

  // ── Save button shared style ──────────────────────────────────────────────
  const SaveBtn = ({ label = "Salvar", onClick = handleSave, loading = saveMutation.isPending }) => (
    <Button
      onClick={onClick}
      disabled={loading}
      className="text-white transition-colors px-6"
      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
    >
      {loading && <Loader2 className="animate-spin mr-2" size={15} />}
      {label}
    </Button>
  );

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-red-900" style={{ background: "linear-gradient(145deg, #1a0000, #450a0a, #1a0000)" }}>
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white/10 rounded-lg border border-white/10">
              <Settings2 size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-red-300 text-xs font-medium">Painel</span>
                <ChevronRight size={11} className="text-red-500" />
                <span className="text-red-400 text-xs font-medium">CRM</span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Configuração de CRM</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {connected === true && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Conectado
              </span>
            )}
            {connected === false && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full">
                <WifiOff size={12} />
                Sem conexão
              </span>
            )}
            <span className="text-xs text-zinc-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              {isRD ? "RD Station CRM" : provider}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white overflow-y-auto py-6 px-3 flex flex-col gap-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest px-3 mb-2">
            Seções
          </p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left
                ${isActive
                  ? "text-white shadow-sm scale-[1.01]"
                  : "text-zinc-600 hover:bg-red-50 hover:text-zinc-900"
                }`}
              style={isActive ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)" } : {}}
              >
                <Icon
                  size={15}
                  className={`transition-transform duration-200 ${
                    isActive ? "text-zinc-100 scale-110" : "text-zinc-400 group-hover:scale-110"
                  }`}
                />
                <span className="leading-tight">{item.label}</span>
                {isActive && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-white/50 animate-pulse" />
                    <ChevronRight size={13} className="shrink-0 text-zinc-400" />
                  </span>
                )}
              </button>
            );
          })}

          <div className="mt-auto mx-1 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
            <p className="text-[11px] font-semibold text-zinc-700 mb-1">💡 Dica</p>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Salve as credenciais primeiro para habilitar as demais seções.
            </p>
          </div>
        </aside>

        {/* Tab content — keyed so each tab triggers enter animation */}
        <main className="flex-1 overflow-y-auto">
          <div key={activeTab} className="animate-tab-enter h-full">

          {/* ── TAB: Autenticação ─────────────────────────────────────── */}
          {activeTab === "auth" && (
            <div className="p-8 max-w-3xl space-y-6">
              <SectionHeader
                icon={ShieldCheck}
                title="Autenticação OAuth2"
                description="Insira o Access Token gerado pelo fluxo OAuth2 da RD Station App Store."
              />

              <div className="space-y-5">
                {/* Provider */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-700">Provedor de CRM</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger className="h-10 max-w-xs bg-white border-zinc-200">
                      <SelectValue placeholder="Selecione o provedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hubspot">HubSpot</SelectItem>
                      <SelectItem value="rd_station">RD Station CRM</SelectItem>
                      <SelectItem value="salesforce">Salesforce</SelectItem>
                      <SelectItem value="pipedrive">Pipedrive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Token */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-700">Access Token (OAuth2)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="font-mono bg-white border-zinc-200 flex-1"
                      placeholder="Cole aqui seu access_token OAuth2 do RD Station"
                    />
                    <Button
                      variant="outline"
                      onClick={() => testMutation.mutate(apiKey)}
                      disabled={testMutation.isPending || !apiKey}
                      className="shrink-0 border-zinc-200 hover:bg-zinc-50"
                    >
                      {testMutation.isPending
                        ? <Loader2 className="animate-spin h-4 w-4 mr-2" />
                        : <Plug size={15} className="mr-2" />}
                      Testar
                    </Button>
                    {isRD && (
                      <Button
                        variant="outline"
                        onClick={() => refreshMutation.mutate()}
                        disabled={refreshMutation.isPending || !apiKey}
                        className="shrink-0 border-zinc-200 hover:bg-zinc-50"
                      >
                        {refreshMutation.isPending
                          ? <Loader2 className="animate-spin h-4 w-4 mr-2" />
                          : <RefreshCw size={15} className="mr-2" />}
                        Renovar Token
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">
                    Gere o token pelo fluxo OAuth2 na <strong>RD Station App Store</strong>. O token expira em 2 horas.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <SaveBtn label="Salvar Credenciais" />
              </div>
            </div>
          )}

          {/* ── TAB: Funil & Etapa ────────────────────────────────────── */}
          {activeTab === "funnel" && isRD && (
            <div className="p-8 max-w-3xl space-y-6">
              <SectionHeader
                icon={GitBranch}
                title="Funil & Etapa de Vendas"
                description="Selecione em qual funil e etapa o card será criado no RD CRM."
              />

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-700">Funil (Pipeline)</Label>
                  <Select value={pipelineId} onValueChange={setPipelineId}>
                    <SelectTrigger className="h-10 bg-white border-zinc-200">
                      <SelectValue placeholder="Selecione o funil" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {rdPipelines?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-700">Etapa (Stage)</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="h-10 bg-white border-zinc-200">
                      <SelectValue placeholder={pipelineId ? "Selecione a etapa" : "Selecione um funil primeiro"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {filteredStages?.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stage trail */}
              {filteredStages && filteredStages.length > 0 && (
                <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Etapas do Funil</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {filteredStages.map((s: any, i: number) => (
                      <div key={s.id} className="flex items-center gap-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                          ${s.id === stageId
                            ? "bg-zinc-950 text-white border-zinc-950"
                            : "bg-white text-zinc-500 border-zinc-300"
                          }`}>
                          {s.name}
                        </span>
                        {i < filteredStages.length - 1 && (
                          <ChevronRight size={12} className="text-zinc-300 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <SaveBtn label="Salvar Funil" />
              </div>
            </div>
          )}

          {/* ── TAB: Responsável & Rodízio ────────────────────────────── */}
          {activeTab === "owner" && isRD && (
            <div className="p-8 max-w-3xl space-y-6">
              <SectionHeader
                icon={Users2}
                title="Responsável & Rodízio de Leads"
                description="Defina quem recebe os leads gerados pelo bot."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchUsers()}
                    disabled={isLoadingUsers}
                    className="gap-1.5 text-xs border-zinc-200 hover:bg-zinc-50"
                  >
                    {isLoadingUsers ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Carregar Usuários
                  </Button>
                }
              />

              {/* Mode selector */}
              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={() => setRrMode("fixed")}
                  className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                    rrMode === "fixed"
                      ? "border-red-800 shadow-sm"
                      : "border-zinc-200 bg-white hover:border-red-300"
                  }`}
                  style={rrMode === "fixed" ? { background: "linear-gradient(135deg, #1a0000, #7f1d1d)" } : {}}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🎯</span>
                    <span className={`font-semibold text-sm ${rrMode === "fixed" ? "text-white" : "text-zinc-700"}`}>
                      Modo Fixo
                    </span>
                    {rrMode === "fixed" && <CheckCircle2 size={15} className="ml-auto text-zinc-400" />}
                  </div>
                  <p className={`text-xs leading-snug ${rrMode === "fixed" ? "text-zinc-400" : "text-zinc-500"}`}>
                    Todos os leads atribuídos a um único responsável.
                  </p>
                </button>

                <button
                  onClick={() => setRrMode("roundrobin")}
                  className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                    rrMode === "roundrobin"
                      ? "border-red-800 shadow-sm"
                      : "border-zinc-200 bg-white hover:border-red-300"
                  }`}
                  style={rrMode === "roundrobin" ? { background: "linear-gradient(135deg, #1a0000, #7f1d1d)" } : {}}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🔄</span>
                    <span className={`font-semibold text-sm ${rrMode === "roundrobin" ? "text-white" : "text-zinc-700"}`}>
                      Modo Rodízio
                    </span>
                    {rrMode === "roundrobin" && <CheckCircle2 size={15} className="ml-auto text-zinc-400" />}
                  </div>
                  <p className={`text-xs leading-snug ${rrMode === "roundrobin" ? "text-zinc-400" : "text-zinc-500"}`}>
                    Leads distribuídos sequencialmente entre usuários.
                  </p>
                </button>
              </div>

              {/* Fixed content */}
              {rrMode === "fixed" && (
                <div className="space-y-2 bg-zinc-50 border border-zinc-200 rounded-xl p-5">
                  <Label className="text-sm font-medium text-zinc-700">Usuário Responsável</Label>
                  {rdUsers && rdUsers.length > 0 ? (
                    <Select value={rrFixedOwnerId} onValueChange={setRrFixedOwnerId}>
                      <SelectTrigger className="h-10 max-w-sm bg-white border-zinc-200">
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {rdUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <span>{u.name}</span>
                              <span className="text-zinc-400 text-xs">{u.email}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                      <AlertTriangle size={14} />
                      Clique em "Carregar Usuários" para listar os usuários do RD CRM.
                      {rrFixedOwnerId && (
                        <span className="ml-2 font-mono text-xs opacity-60">ID: {rrFixedOwnerId}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Roundrobin content */}
              {rrMode === "roundrobin" && (
                <div className="space-y-4 bg-zinc-50 border border-zinc-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-zinc-700">Fila de Rodízio</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-zinc-500 gap-1 hover:text-zinc-800"
                      onClick={() => setRrCurrentIndex(0)}
                    >
                      <RotateCcw size={12} /> Resetar ordem
                    </Button>
                  </div>

                  {rrUsers.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-white border border-zinc-200 rounded-lg">
                      <ArrowRight size={14} className="text-zinc-500 shrink-0" />
                      <p className="text-sm text-zinc-700">
                        <strong>Próximo lead:</strong>{" "}
                        {rrUsers[rrCurrentIndex % rrUsers.length]?.name || "—"}
                        <span className="text-zinc-400 text-xs ml-2">
                          ({(rrCurrentIndex % rrUsers.length) + 1} de {rrUsers.length})
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
                    {rrUsers.length === 0 ? (
                      <div className="text-center text-zinc-400 text-sm py-10">
                        <Users2 size={24} className="mx-auto mb-2 opacity-30" />
                        Nenhum usuário na fila. Adicione abaixo.
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {rrUsers.map((u, idx) => (
                          <div
                            key={u.id}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                              idx === rrCurrentIndex % rrUsers.length ? "bg-zinc-50" : "hover:bg-zinc-50/50"
                            }`}
                          >
                            <span className="text-xs font-mono text-zinc-400 w-5 text-center">{idx + 1}</span>
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="flex-1 text-sm font-medium text-zinc-800">{u.name}</span>
                            {idx === rrCurrentIndex % rrUsers.length && (
                              <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">
                                ← próximo
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-red-500 hover:bg-red-50"
                              onClick={() => {
                                const next = rrUsers.filter((_, i) => i !== idx);
                                setRrUsers(next);
                                if (rrCurrentIndex >= next.length && next.length > 0) setRrCurrentIndex(0);
                              }}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {rdUsers && rdUsers.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(userId) => {
                          const user = rdUsers.find((u) => u.id === userId);
                          if (user && !rrUsers.find((u) => u.id === userId)) {
                            setRrUsers([...rrUsers, { id: user.id, name: user.name }]);
                          } else {
                            toast({ title: "Usuário já na fila", variant: "destructive" });
                          }
                        }}
                      >
                        <SelectTrigger className="max-w-xs h-9 text-sm bg-white border-zinc-200">
                          <SelectValue placeholder="Adicionar usuário à fila..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[250px]">
                          {rdUsers
                            .filter((u) => !rrUsers.find((rru) => rru.id === u.id))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-zinc-400">Selecione para adicionar</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                      <AlertTriangle size={14} />
                      Clique em "Carregar Usuários" para adicionar à fila.
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <Button
                  onClick={() => saveRRMutation.mutate({ mode: rrMode, fixedOwnerId: rrFixedOwnerId, users: rrUsers, currentIndex: rrCurrentIndex })}
                  disabled={saveRRMutation.isPending}
                  className="text-white transition-colors px-6"
                  style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                >
                  {saveRRMutation.isPending && <Loader2 className="animate-spin mr-2" size={15} />}
                  Salvar Responsável
                </Button>
              </div>
            </div>
          )}

          {/* ── TAB: Mapeamento RD Station ────────────────────────────── */}
          {activeTab === "mapping-rd" && isRD && (
            <div className="p-8 max-w-5xl space-y-6">
              <SectionHeader
                icon={Zap}
                title="Mapeamento RD Station"
                description="Mapeie os dados capturados pela IA para campos do RD Station (padrão ou personalizados)."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toast({ title: "Atualizando campos..." });
                        queryClient.invalidateQueries({ queryKey: ["/api/rd-crm/custom-fields"] });
                      }}
                      className="gap-1.5 text-xs border-zinc-200 hover:bg-zinc-50"
                    >
                      <RefreshCw size={13} /> Atualizar Campos
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setRdMappings([...rdMappings, { id: Date.now(), botField: "", crmFieldId: "", entity: "deal" }])}
                      className="gap-1.5 text-xs text-white"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    >
                      <Plus size={13} /> Adicionar
                    </Button>
                  </div>
                }
              />

              {rdMappings.length === 0 ? (
                <div className="text-center py-16 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-400">
                  <Zap size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum mapeamento configurado.</p>
                  <p className="text-xs mt-1">Clique em "Adicionar" para criar um novo.</p>
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_160px_1fr_36px] gap-3 px-4">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Campo do Bot</span>
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Entidade</span>
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Campo no RD Station</span>
                    <span />
                  </div>

                  <div className="space-y-2">
                    {rdMappings.map((m) => (
                      <div
                        key={m.id}
                        className="grid grid-cols-[1fr_160px_1fr_36px] gap-3 items-center bg-white border border-zinc-200 rounded-xl px-4 py-3 hover:border-zinc-300 hover:shadow-sm transition-all duration-150"
                      >
                        <Select
                          value={m.botField}
                          onValueChange={(v) => setRdMappings(rdMappings.map((rm) => rm.id === m.id ? { ...rm, botField: v } : rm))}
                        >
                          <SelectTrigger className="h-9 bg-zinc-50 border-zinc-200 text-sm">
                            <SelectValue placeholder="Campo do bot" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            <SelectItem value="telefone">Telefone (WhatsApp)</SelectItem>
                            <SelectItem value="nome_completo">Nome Completo</SelectItem>
                            <SelectItem value="cnpj_empresa">CNPJ</SelectItem>
                            <SelectItem value="razao_social">Razão Social (Receita Federal)</SelectItem>
                            <SelectItem value="nome_fantasia">Nome Fantasia (Receita Federal)</SelectItem>
                            <SelectItem value="qualificacao_sdr">Qualificação SDR</SelectItem>
                            <SelectItem value="tipo_produto">Tipo de Produto</SelectItem>
                            <SelectItem value="nome_empresa">Nome da Empresa (legado)</SelectItem>
                            <SelectItem value="projetos_desenvolvimento">Projetos / Desenvolvimento (Sim ou Não)</SelectItem>
                            <SelectItem value="nivel_interesse">Nível de Interesse (análise IA)</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={m.entity}
                          onValueChange={(v: any) => setRdMappings(rdMappings.map((rm) => rm.id === m.id ? { ...rm, entity: v } : rm))}
                        >
                          <SelectTrigger className="h-9 bg-zinc-50 border-zinc-200 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="deal">Negociação (Card)</SelectItem>
                            <SelectItem value="organization">Empresa</SelectItem>
                            <SelectItem value="contact">Contato</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={m.crmFieldId}
                          onValueChange={(v) => setRdMappings(rdMappings.map((rm) => rm.id === m.id ? { ...rm, crmFieldId: v } : rm))}
                        >
                          <SelectTrigger className="h-9 bg-zinc-50 border-zinc-200 text-sm">
                            <SelectValue placeholder="Campo no RD Station" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {(STANDARD_FIELDS[m.entity] || []).length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                  Campos Padrão
                                </div>
                                {(STANDARD_FIELDS[m.entity] || []).map((sf) => (
                                  <SelectItem key={sf.value} value={sf.value}>{sf.label}</SelectItem>
                                ))}
                                {(rdCustomFields || []).filter((f) => f.entity === m.entity).length > 0 && (
                                  <div className="mx-2 my-1 border-t border-zinc-100" />
                                )}
                              </>
                            )}
                            {(rdCustomFields || []).filter((f) => f.entity === m.entity).length > 0 && (
                              <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                Campos Personalizados
                              </div>
                            )}
                            {(rdCustomFields || []).filter((f) => f.entity === m.entity).map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          onClick={() => setRdMappings(rdMappings.filter((rm) => rm.id !== m.id))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-zinc-100 flex justify-end">
                    <SaveBtn label="Salvar Mapeamentos" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── TAB: Mapeamento Genérico ──────────────────────────────── */}
          {activeTab === "mapping-generic" && (
            <div className="p-8 max-w-3xl space-y-6">
              <SectionHeader
                icon={LinkIcon}
                title="Mapeamento Genérico"
                description="Mapeie variáveis da IA para campos de destino no CRM."
                action={
                  <Button
                    size="sm"
                    onClick={addMapping}
                    className="gap-1.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-white"
                  >
                    <Plus size={13} /> Adicionar
                  </Button>
                }
              />

              {mappings.length === 0 ? (
                <div className="text-center py-16 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-400">
                  <LinkIcon size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum mapeamento configurado.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_1fr_36px] gap-3 px-4">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Variável de IA (Intenção)</span>
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Campo de Destino no CRM</span>
                    <span />
                  </div>

                  <div className="space-y-2">
                    {mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="grid grid-cols-[1fr_1fr_36px] gap-3 items-center bg-white border border-zinc-200 rounded-xl px-4 py-3 hover:border-zinc-300 hover:shadow-sm transition-all duration-150"
                      >
                        <Input
                          value={mapping.aiIntent}
                          onChange={(e) => updateMapping(mapping.id, "aiIntent", e.target.value)}
                          placeholder="ex: nome_cliente"
                          className="h-9 bg-zinc-50 border-zinc-200 text-sm font-mono"
                        />
                        <Input
                          value={mapping.crmField}
                          onChange={(e) => updateMapping(mapping.id, "crmField", e.target.value)}
                          placeholder="ex: firstname"
                          className="h-9 bg-zinc-50 border-zinc-200 text-sm font-mono"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          onClick={() => removeMapping(mapping.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-zinc-100 flex justify-end">
                    <SaveBtn label="Salvar Mapeamentos" />
                  </div>
                </>
              )}
            </div>
          )}
          {/* ── TAB: Operadores por Fluxo ───────────────────────────── */}
          {activeTab === "operators" && (
            <div className="p-8 max-w-3xl space-y-6">
              <SectionHeader
                icon={Users2}
                title="Operadores por Fluxo"
                description="Defina qual atendente recebe cada tipo de atendimento após a triagem do Fagner."
              />

              <div className="space-y-3">
                {Object.entries(SUBFLOW_LABELS).map(([subflow, label]) => {
                  const ops = operators[subflow] ?? [];
                  const isEditing = editingOp === subflow;
                  return (
                    <div key={subflow} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-zinc-700">{label}</span>
                        <button
                          onClick={() => { setEditingOp(isEditing ? null : subflow); setEditOpForm(ops[0] ?? { name: "", id: "" }); }}
                          className="text-xs text-zinc-500 hover:text-zinc-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-200 transition-colors"
                        >
                          {isEditing ? <X size={11} /> : <Edit2 size={11} />}
                          {isEditing ? "Cancelar" : "Editar"}
                        </button>
                      </div>

                      {!isEditing ? (
                        ops.length > 0 ? (
                          <div className="space-y-1">
                            {ops.map((op, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                  {op.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-zinc-700">{op.name}</span>
                                {op.id && <span className="text-zinc-400 text-xs font-mono">ID: {op.id}</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 italic">Nenhum operador configurado</p>
                        )
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-zinc-600">Nome do Atendente</Label>
                              <Input
                                value={editOpForm.name}
                                onChange={(e) => setEditOpForm({ ...editOpForm, name: e.target.value })}
                                className="h-8 text-sm bg-white border-zinc-200 mt-1"
                                placeholder="Ex: Jeisa"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-zinc-600">ID no RD Conversas</Label>
                              <Input
                                value={editOpForm.id}
                                onChange={(e) => setEditOpForm({ ...editOpForm, id: e.target.value })}
                                className="h-8 text-sm bg-white border-zinc-200 mt-1 font-mono"
                                placeholder="Ex: op-jeisa"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (!editOpForm.name) return;
                              setOperators({ ...operators, [subflow]: [editOpForm] });
                              setEditingOp(null);
                            }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                          >
                            <Save size={11} /> Salvar Operador
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <Button
                  onClick={handleSaveOperators}
                  disabled={savingOps}
                  className="text-white px-6"
                  style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                >
                  {savingOps && <Loader2 className="animate-spin mr-2" size={15} />}
                  Salvar Todos os Operadores
                </Button>
              </div>
            </div>
          )}

          {/* ── TAB: Horário de Atendimento ──────────────────────────── */}
          {activeTab === "schedule" && (
            <div className="p-8 max-w-2xl space-y-6">
              <SectionHeader
                icon={Clock}
                title="Horário de Atendimento"
                description="Defina os dias e horários em que o Fagner responde automaticamente. Fora do horário, ele enviará uma mensagem automática."
              />

              {/* Ativar/desativar */}
              <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-zinc-700">Controle de Horário Ativo</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Quando ativo, o Fagner não responde fora do horário configurado.</p>
                </div>
                <Switch
                  checked={schedule.enabled}
                  onCheckedChange={(v) => setSchedule({ ...schedule, enabled: v })}
                  className="data-[state=checked]:bg-red-600"
                />
              </div>

              {/* Dias da semana */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-zinc-700">Dias de Atendimento</Label>
                <div className="flex gap-2 flex-wrap">
                  {WEEKDAY_LABELS.map((day, i) => {
                    const isActive = schedule.weekdays.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          const next = isActive
                            ? schedule.weekdays.filter((d) => d !== i)
                            : [...schedule.weekdays, i].sort();
                          setSchedule({ ...schedule, weekdays: next });
                        }}
                        className={`h-9 w-12 rounded-lg text-xs font-semibold border-2 transition-all duration-150 ${
                          isActive
                            ? "text-white border-red-700"
                            : "text-zinc-500 bg-white border-zinc-200 hover:border-zinc-300"
                        }`}
                        style={isActive ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)" } : {}}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Horário */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-700">Início</Label>
                  <select
                    value={schedule.startHour}
                    onChange={(e) => setSchedule({ ...schedule, startHour: Number(e.target.value) })}
                    className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-700">Término</Label>
                  <select
                    value={schedule.endHour}
                    onChange={(e) => setSchedule({ ...schedule, endHour: Number(e.target.value) })}
                    className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mensagem fora do horário */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-zinc-700">Mensagem Fora do Horário</Label>
                <Textarea
                  value={schedule.offHoursMessage}
                  onChange={(e) => setSchedule({ ...schedule, offHoursMessage: e.target.value })}
                  rows={3}
                  className="bg-white border-zinc-200 resize-none text-sm"
                  placeholder="Mensagem enviada automaticamente fora do horário de atendimento..."
                />
                <p className="text-xs text-zinc-400">O Fagner adiciona automaticamente o horário de abertura ao final da mensagem.</p>
              </div>

              {/* Preview */}
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Preview da configuração:</p>
                <p className="text-sm text-zinc-700">
                  <strong>{schedule.enabled ? "✅ Ativo" : "❌ Desativado"}</strong>
                  {" · "}
                  {WEEKDAY_LABELS.filter((_, i) => schedule.weekdays.includes(i)).join(", ")}
                  {" · "}
                  {String(schedule.startHour).padStart(2, "0")}:00 às {String(schedule.endHour).padStart(2, "0")}:00
                  {" · Brasília (BRT)"}
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <Button
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  className="text-white px-6"
                  style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                >
                  {savingSchedule && <Loader2 className="animate-spin mr-2" size={15} />}
                  Salvar Horário
                </Button>
              </div>
            </div>
          )}

          </div>
        </main>
      </div>
    </div>
  );
}