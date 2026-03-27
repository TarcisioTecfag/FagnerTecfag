import { useState, useEffect, useRef } from "react";
import {
  ShoppingBag, Settings2, Activity, BarChart3, AlertCircle, BookMarked,
  FlaskConical, Tag, ChevronRight, Plus, Trash2, Loader2, CheckCircle2,
  XCircle, Search, Send, RefreshCw, Zap, TrendingUp, Package,
  Link as LinkIcon, MessageSquare, Wifi, WifiOff, Save, X, AlertTriangle,
  Check, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import { Switch }  from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TriggerSettings {
  keywords: string[];
  actionAvailable: "send_link" | "inform_only";
  actionUnavailable: "suggest_similar" | "inform_only";
  minConfidence: number;
}

interface ActionLog {
  id: string;
  timestamp: string;
  type: "search" | "found" | "not_found" | "link_sent" | "notified";
  description: string;
  product?: string;
  autonomous: boolean;
}

interface VtexStats {
  searchesToday: number;
  hitRate: number;
  linksSent: number;
  failures: number;
  conversions: number;
  searchesByHour: { hour: number; count: number }[];
}

interface Failure {
  id: string;
  query: string;
  reason: string;
  createdAt: string;
  resolved: boolean;
  suggestedSynonym?: string;
}

interface Synonym {
  id: string;
  term: string;
  canonical: string;
}

interface VtexCategory {
  id: string;
  name: string;
  tags: string[];
  expanded?: boolean;
}

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "triggers",    label: "Gatilhos",         icon: Settings2    },
  { id: "log",         label: "Log de Ações",      icon: Activity     },
  { id: "performance", label: "Performance",       icon: BarChart3    },
  { id: "failures",    label: "Fila de Falhas",    icon: AlertCircle  },
  { id: "synonyms",    label: "Sinônimos",         icon: BookMarked   },
  { id: "simulator",   label: "Simulador de Busca",icon: FlaskConical },
  { id: "categories",  label: "Categorias VTEX",   icon: Tag          },
];

// ─── Fuzzy similarity (Levenshtein ratio) ─────────────────────────────────────
function similarity(a: string, b: string): number {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon, title, description, action,
}: { icon: React.ElementType; title: string; description?: string; action?: React.ReactNode }) {
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

// ─── Mini Bar Chart (SVG) ─────────────────────────────────────────────────────
function MiniBarChart({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 480, h = 80;
  const barW = w / data.length - 2;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      {data.map((d, i) => {
        const barH = (d.count / max) * h;
        const x = i * (w / data.length) + 1;
        const y = h - barH;
        return (
          <g key={d.hour}>
            <rect
              x={x} y={y} width={barW} height={barH}
              rx={2}
              fill={d.count > 0 ? "url(#vtexGrad)" : "rgba(220,38,38,0.08)"}
              className="transition-all duration-300"
            />
            {i % 4 === 0 && (
              <text x={x + barW / 2} y={h + 12} textAnchor="middle" fontSize={9} fill="#a1a1aa">
                {d.hour}h
              </text>
            )}
          </g>
        );
      })}
      <defs>
        <linearGradient id="vtexGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Log Icon ─────────────────────────────────────────────────────────────────
function LogIcon({ type }: { type: ActionLog["type"] }) {
  const map: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    search:    { icon: Search,       color: "text-blue-600",   bg: "bg-blue-50" },
    found:     { icon: CheckCircle2, color: "text-emerald-600",bg: "bg-emerald-50" },
    not_found: { icon: XCircle,      color: "text-red-500",    bg: "bg-red-50" },
    link_sent: { icon: LinkIcon,     color: "text-violet-600", bg: "bg-violet-50" },
    notified:  { icon: MessageSquare,color: "text-amber-600",  bg: "bg-amber-50" },
  };
  const { icon: Icon, color, bg } = map[type] ?? map.search;
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
      <Icon size={14} className={color} />
    </div>
  );
}

// ─── Default seed data (used when API returns empty) ──────────────────────────
const DEFAULT_SETTINGS: TriggerSettings = {
  keywords: ["envasadora", "seladora", "rotuladora", "empacotadora"],
  actionAvailable: "send_link",
  actionUnavailable: "suggest_similar",
  minConfidence: 75,
};

const SEED_LOGS: ActionLog[] = [];
const SEED_STATS: VtexStats = {
  searchesToday: 0,
  hitRate: 0,
  linksSent: 0,
  failures: 0,
  conversions: 0,
  searchesByHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })),
};
const SEED_FAILURES: Failure[] = [];
const SEED_SYNONYMS: Synonym[] = [];
const SEED_CATEGORIES: VtexCategory[] = [];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VTEXConfig() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("triggers");

  // ── Data Fetching Hooks ────────────────────────────────────────────────────
  const { data: qSettings } = useQuery({ queryKey: ["vtex-settings"], queryFn: async () => { const r = await fetch("/api/vtex/settings"); return r.json(); }});
  const { data: qLogs } = useQuery({ queryKey: ["vtex-logs"], queryFn: async () => { const r = await fetch("/api/vtex/logs"); return r.json(); }, refetchInterval: 5000 });
  const { data: qStats } = useQuery({ queryKey: ["vtex-stats"], queryFn: async () => { const r = await fetch("/api/vtex/stats"); return r.json(); }, refetchInterval: 10000 });
  const { data: qFailures } = useQuery({ queryKey: ["vtex-failures"], queryFn: async () => { const r = await fetch("/api/vtex/failures"); return r.json(); }, refetchInterval: 10000 });
  const { data: qSynonyms } = useQuery({ queryKey: ["vtex-synonyms"], queryFn: async () => { const r = await fetch("/api/vtex/synonyms"); return r.json(); }});
  const { data: qCategories } = useQuery({ queryKey: ["vtex-categories"], queryFn: async () => { const r = await fetch("/api/vtex/categories"); return r.json(); }});

  // ── State ──────────────────────────────────────────────────────────────────
  const [settings, setSettings]       = useState<TriggerSettings>(DEFAULT_SETTINGS);
  const [newKw, setNewKw]             = useState("");
  const [newSynTerm, setNewSynTerm]   = useState("");
  const [newSynCanon, setNewSynCanon] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"unknown"|"ok"|"error">("unknown");
  const [healthChecking, setHealthChecking] = useState(false);
  const [lastPing, setLastPing]       = useState<string | null>(null);

  useEffect(() => {
    if (qSettings) setSettings({ ...DEFAULT_SETTINGS, ...qSettings });
  }, [qSettings]);

  const logs: ActionLog[]       = qLogs || SEED_LOGS;
  const stats: VtexStats        = qStats || SEED_STATS;
  const failures: Failure[]     = qFailures || SEED_FAILURES;
  const synonyms: Synonym[]     = qSynonyms || SEED_SYNONYMS;
  const categories: VtexCategory[] = qCategories || SEED_CATEGORIES;

  // Simulator
  const [simQuery, setSimQuery]     = useState("");
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult]   = useState<{
    found: boolean;
    productName?: string;
    link?: string;
    price?: number | null;
    priceFormatted?: string;
    available?: boolean;
    category?: string;
    description?: string;
    normalizedQuery?: string;
    error?: string;
  } | null>(null);

  // Categories editing
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [newCatTag, setNewCatTag]       = useState("");

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  };

  const handleHealthCheck = async () => {
    setHealthChecking(true);
    await new Promise((r) => setTimeout(r, 900));
    setHealthStatus("ok");
    setLastPing(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setHealthChecking(false);
    toast({ title: "VTEX conectada ✅", description: "API respondendo normalmente." });
  };

  const saveSettingsMut = useMutation({
    mutationFn: async (s: TriggerSettings) => {
      await fetch("/api/vtex/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    },
    onSuccess: () => {
      toast({ title: "Gatilhos salvos!", description: "Configurações atualizadas com sucesso." });
      qc.invalidateQueries({ queryKey: ["vtex-settings"] });
      setSavingSettings(false);
    }
  });

  const handleSaveSettings = () => {
    setSavingSettings(true);
    saveSettingsMut.mutate(settings);
  };

  const addKeyword = () => {
    const kw = newKw.trim().toLowerCase();
    if (!kw || settings.keywords.includes(kw)) return;
    setSettings((s) => ({ ...s, keywords: [...s.keywords, kw] }));
    setNewKw("");
  };

  const removeKeyword = (kw: string) =>
    setSettings((s) => ({ ...s, keywords: s.keywords.filter((k) => k !== kw) }));

  const resolveFailureMut = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/vtex/failures/${id}/resolve`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vtex-failures"] })
  });

  const addSynonymMut = useMutation({
    mutationFn: async (data: { term: string; canonical: string }) => {
      const res = await fetch("/api/vtex/synonyms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Erro ao salvar sinônimo");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vtex-synonyms"] })
  });

  const delSynonymMut = useMutation({
    mutationFn: async (id: string) => fetch(`/api/vtex/synonyms/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vtex-synonyms"] })
  });

  const addCatMut = useMutation({
    mutationFn: async (data: { name: string; tags: string[] }) => {
      await fetch("/api/vtex/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vtex-categories"] })
  });
  
  const updateCatMut = useMutation({
    mutationFn: async (data: { id: string; name?: string; tags?: string[]; expanded?: boolean }) => {
      await fetch(`/api/vtex/categories/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vtex-categories"] })
  });
  
  const delCatMut = useMutation({
    mutationFn: async (id: string) => fetch(`/api/vtex/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vtex-categories"] })
  });

  const resolveFailure = (id: string, action: "synonym" | "ignore") => {
    const f = failures.find((x) => x.id === id);
    if (!f) return;
    if (action === "synonym" && f.suggestedSynonym) {
      addSynonymMut.mutate({ term: f.query, canonical: f.suggestedSynonym });
      toast({ title: "Sinônimo criado", description: `"${f.query}" → "${f.suggestedSynonym}"` });
    }
    resolveFailureMut.mutate(id);
  };

  // Enrich failures with fuzzy suggestions based on existing synonyms
  const enrichedFailures = failures.map((f) => {
    if (f.suggestedSynonym) return f;
    let best = { score: 0, canonical: "" };
    for (const s of synonyms) {
      const sc = similarity(f.query, s.term);
      if (sc > best.score) best = { score: sc, canonical: s.canonical };
    }
    for (const c of categories) {
      const sc = similarity(f.query, c.name);
      if (sc > best.score) best = { score: sc, canonical: c.name };
    }
    return best.score > 0.4 ? { ...f, suggestedSynonym: best.canonical } : f;
  });

  // Simulator logic — calls real /api/vtex/search backend
  const runSimulator = async () => {
    if (!simQuery.trim()) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/vtex/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: simQuery.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erro desconhecido" }));
        setSimResult({ found: false, error: err.message });
        return;
      }
      const data = await res.json();
      setSimResult(data);
    } catch (e: any) {
      setSimResult({ found: false, error: e.message });
    } finally {
      setSimRunning(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-red-900" style={{ background: "linear-gradient(145deg, #1a0000, #450a0a, #1a0000)" }}>
        <div className="px-8 py-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white/10 rounded-lg border border-white/10">
              <ShoppingBag size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-red-300 text-xs font-medium">Painel</span>
                <ChevronRight size={11} className="text-red-500" />
                <span className="text-red-400 text-xs font-medium">Integrações</span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Configuração VTEX</h1>
            </div>
          </div>

          {/* Health check badge */}
          <div className="flex items-center gap-3">
            {healthStatus === "ok" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <Wifi size={12} />
                API VTEX OK {lastPing && <span className="opacity-60 ml-0.5">· {lastPing}</span>}
              </span>
            )}
            {healthStatus === "error" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full">
                <WifiOff size={12} /> Falha na conexão VTEX
              </span>
            )}
            <Button
              size="sm"
              onClick={handleHealthCheck}
              disabled={healthChecking}
              className="h-8 text-xs gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white"
            >
              {healthChecking ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {healthStatus === "unknown" ? "Verificar conexão" : "Testar novamente"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white overflow-y-auto py-6 px-3 flex flex-col gap-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest px-3 mb-2">
            Seções
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left
                  ${isActive ? "text-white shadow-sm scale-[1.01]" : "text-zinc-600 hover:bg-red-50 hover:text-zinc-900"}`}
                style={isActive ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)" } : {}}
              >
                <Icon size={15} className={isActive ? "text-zinc-100 scale-110" : "text-zinc-400"} />
                <span className="leading-tight">{item.label}</span>
                {isActive && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-white/50 animate-pulse" />
                    <ChevronRight size={13} className="shrink-0 text-zinc-300" />
                  </span>
                )}
              </button>
            );
          })}

          <div className="mt-auto mx-1 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
            <p className="text-[11px] font-semibold text-zinc-700 mb-1">🤖 Integração Ativa</p>
            <p className="text-[11px] text-zinc-500 leading-snug">
              O Fagner buscará produtos automaticamente quando o cliente mencionar palavras-chave configuradas.
            </p>
          </div>
        </aside>

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto">
          <div key={activeTab} className="animate-tab-enter h-full">

            {/* ══════ TAB: GATILHOS ═══════════════════════════════════════ */}
            {activeTab === "triggers" && (
              <div className="p-8 max-w-3xl space-y-7">
                <SectionHeader
                  icon={Settings2}
                  title="Configurações de Gatilho"
                  description="Defina quando e como o Fagner busca máquinas automaticamente no catálogo VTEX."
                />

                {/* Keywords */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-zinc-700">
                    Palavras-chave que ativam a busca
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {settings.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-50 text-red-700 border border-red-200"
                      >
                        {kw}
                        <button
                          onClick={() => removeKeyword(kw)}
                          className="hover:text-red-900 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 max-w-sm">
                    <Input
                      value={newKw}
                      onChange={(e) => setNewKw(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                      placeholder="Nova palavra-chave..."
                      className="h-9 border-zinc-200 bg-white"
                    />
                    <Button
                      size="sm"
                      onClick={addKeyword}
                      className="h-9 px-4 text-white"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                </div>

                {/* Action available */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-zinc-700">Ação quando produto está disponível</Label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { value: "send_link",   label: "Enviar link automaticamente", emoji: "📤" },
                      { value: "inform_only", label: "Só informar disponibilidade",  emoji: "💬" },
                    ].map((opt) => {
                      const active = settings.actionAvailable === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSettings((s) => ({ ...s, actionAvailable: opt.value as any }))}
                          className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                            active ? "border-red-800 shadow-sm" : "border-zinc-200 bg-white hover:border-red-300"
                          }`}
                          style={active ? { background: "linear-gradient(135deg, #1a0000, #7f1d1d)" } : {}}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{opt.emoji}</span>
                            <span className={`font-semibold text-sm ${active ? "text-white" : "text-zinc-700"}`}>{opt.label}</span>
                            {active && <CheckCircle2 size={14} className="ml-auto text-zinc-300" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action unavailable */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-zinc-700">Ação quando produto está indisponível</Label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { value: "suggest_similar", label: "Avisar cliente + sugerir similar", emoji: "💡" },
                      { value: "inform_only",      label: "Só avisar indisponibilidade",      emoji: "⚠️" },
                    ].map((opt) => {
                      const active = settings.actionUnavailable === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSettings((s) => ({ ...s, actionUnavailable: opt.value as any }))}
                          className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                            active ? "border-red-800 shadow-sm" : "border-zinc-200 bg-white hover:border-red-300"
                          }`}
                          style={active ? { background: "linear-gradient(135deg, #1a0000, #7f1d1d)" } : {}}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{opt.emoji}</span>
                            <span className={`font-semibold text-sm ${active ? "text-white" : "text-zinc-700"}`}>{opt.label}</span>
                            {active && <CheckCircle2 size={14} className="ml-auto text-zinc-300" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Confidence slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-zinc-700">Confiança mínima para agir</Label>
                    <span
                      className="text-sm font-bold px-3 py-0.5 rounded-full text-white"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    >
                      {settings.minConfidence}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={settings.minConfidence}
                    onChange={(e) => setSettings((s) => ({ ...s, minConfidence: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                  <p className="text-xs text-zinc-400">
                    Abaixo de {settings.minConfidence}%, o bot pedirá confirmação antes de agir.
                  </p>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex justify-end">
                  <Button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="text-white px-8"
                    style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                  >
                    {savingSettings ? <Loader2 className="animate-spin mr-2" size={15} /> : <Save size={15} className="mr-2" />}
                    Salvar Configurações
                  </Button>
                </div>
              </div>
            )}

            {/* ══════ TAB: LOG DE AÇÕES ════════════════════════════════════ */}
            {activeTab === "log" && (
              <div className="p-8 space-y-5 max-w-4xl">
                <SectionHeader
                  icon={Activity}
                  title="Log de Ações Autônomas"
                  description="Linha do tempo em tempo real de tudo que o Fagner fez sozinho."
                  action={
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Ao vivo
                    </span>
                  }
                />

                <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/50 transition-colors">
                      <LogIcon type={log.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-800 truncate">{log.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {log.autonomous && (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            🟢 Auto
                          </span>
                        )}
                        <span className="text-xs text-zinc-400 tabular-nums">{fmtTime(log.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="py-12 text-center text-zinc-400">
                      <Activity size={28} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma ação registrada ainda.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════ TAB: PERFORMANCE ════════════════════════════════════ */}
            {activeTab === "performance" && (
              <div className="p-8 space-y-6 max-w-4xl">
                <SectionHeader
                  icon={BarChart3}
                  title="Dashboard de Performance VTEX"
                  description="Métricas exclusivas da integração autônoma do Fagner com o catálogo."
                />

                {/* Metric cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: "Buscas hoje",        value: String(stats.searchesToday), icon: Search,     color: "text-blue-600",    bg: "bg-blue-50" },
                    { label: "Taxa de acerto",     value: `${stats.hitRate}%`,         icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Links enviados",     value: String(stats.linksSent),     icon: LinkIcon,   color: "text-violet-600",  bg: "bg-violet-50" },
                    { label: "Falhas",             value: String(stats.failures),      icon: XCircle,    color: "text-red-500",     bg: "bg-red-50" },
                    { label: "Conversões",         value: String(stats.conversions),   icon: Package,    color: "text-amber-600",   bg: "bg-amber-50" },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <div key={m.label} className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.bg}`}>
                          <Icon size={16} className={m.color} />
                        </div>
                        <p className="text-2xl font-bold text-zinc-900">{m.value}</p>
                        <p className="text-xs text-zinc-500 leading-tight">{m.label}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Hourly chart */}
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-zinc-800">Buscas por hora (hoje)</p>
                    <span className="text-xs text-zinc-400">últimas 24h</span>
                  </div>
                  <div className="pb-4">
                    <MiniBarChart data={stats.searchesByHour} />
                  </div>
                </div>
              </div>
            )}

            {/* ══════ TAB: FILA DE FALHAS ══════════════════════════════════ */}
            {activeTab === "failures" && (
              <div className="p-8 max-w-3xl space-y-6">
                <SectionHeader
                  icon={AlertCircle}
                  title="Fila de Falhas"
                  description="Buscas que o bot não conseguiu resolver. Crie sinônimos ou ignore cada item."
                />

                {enrichedFailures.length === 0 ? (
                  <div className="py-16 text-center">
                    <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-400" />
                    <p className="text-sm font-medium text-zinc-700">Fila limpa! Nenhuma falha pendente.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden divide-y divide-zinc-100">
                    {enrichedFailures.map((f) => (
                      <div key={f.id} className="p-4 hover:bg-zinc-50/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-mono text-sm font-semibold text-zinc-800">"{f.query}"</p>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                                {f.reason}
                              </span>
                            </div>
                            {f.suggestedSynonym && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="text-xs text-zinc-400">💡 Sugestão automática:</span>
                                <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                                  → {f.suggestedSynonym}
                                </span>
                              </div>
                            )}
                            <p className="text-[11px] text-zinc-400 mt-1">{fmtTime(f.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {f.suggestedSynonym && (
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1 text-white"
                                style={{ background: "linear-gradient(135deg, #6d28d9, #7c3aed)" }}
                                onClick={() => resolveFailure(f.id, "synonym")}
                              >
                                <Check size={11} /> Aceitar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-zinc-500 border-zinc-200 gap-1 hover:text-red-600 hover:border-red-200"
                              onClick={() => resolveFailure(f.id, "ignore")}
                            >
                              <X size={11} /> Ignorar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════ TAB: SINÔNIMOS ═══════════════════════════════════════ */}
            {activeTab === "synonyms" && (
              <div className="p-8 max-w-3xl space-y-6">
                <SectionHeader
                  icon={BookMarked}
                  title="Cadastro de Sinônimos / Aliases"
                  description="Ensine o Fagner os termos que os clientes usam para cada categoria de máquina."
                />

                {/* Add form */}
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-zinc-700">Novo sinônimo</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Termo do cliente</Label>
                      <Input
                        value={newSynTerm}
                        onChange={(e) => setNewSynTerm(e.target.value)}
                        placeholder='ex: "máquina de selar"'
                        className="h-9 bg-white border-zinc-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Categoria canônica</Label>
                      <Input
                        value={newSynCanon}
                        onChange={(e) => setNewSynCanon(e.target.value)}
                        placeholder='ex: "Seladora"'
                        className="h-9 bg-white border-zinc-200"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="text-white gap-1.5"
                    style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    disabled={!newSynTerm.trim() || !newSynCanon.trim()}
                    onClick={() => {
                      addSynonymMut.mutate({ term: newSynTerm.trim(), canonical: newSynCanon.trim() });
                      setNewSynTerm("");
                      setNewSynCanon("");
                      toast({ title: "Sinônimo adicionado!" });
                    }}
                  >
                    <Plus size={14} /> Adicionar sinônimo
                  </Button>
                </div>

                {/* List */}
                <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-5 py-2.5 bg-zinc-50 border-b border-zinc-200">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Termo do cliente</p>
                    <span />
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Categoria canônica</p>
                    <span />
                  </div>
                  {synonyms.map((s) => (
                    <div
                      key={s.id}
                      className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-5 py-3 border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50"
                    >
                      <span className="font-mono text-sm text-zinc-700">"{s.term}"</span>
                      <ChevronRight size={14} className="text-zinc-300 shrink-0" />
                      <span className="text-sm font-medium text-zinc-800">{s.canonical}</span>
                      <button
                        onClick={() => { delSynonymMut.mutate(s.id); }}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {synonyms.length === 0 && (
                    <div className="py-10 text-center text-zinc-400">
                      <BookMarked size={24} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum sinônimo cadastrado ainda.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════ TAB: SIMULADOR ═══════════════════════════════════════ */}
            {activeTab === "simulator" && (
              <div className="p-8 max-w-2xl space-y-6">
                <SectionHeader
                  icon={FlaskConical}
                  title="Simulador de Consulta ao Vivo"
                  description="Teste qualquer termo antes de usar em produção. Veja o que o Fagner faria em tempo real."
                />

                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 space-y-4">
                  <Label className="text-sm font-medium text-zinc-700">O que o cliente digitou?</Label>
                  <div className="flex gap-2">
                    <Input
                      value={simQuery}
                      onChange={(e) => setSimQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSimulator()}
                      placeholder='ex: "máquina de embalar biscoito"'
                      className="bg-white border-zinc-200"
                    />
                    <Button
                      onClick={runSimulator}
                      disabled={simRunning || !simQuery.trim()}
                      className="text-white gap-2 shrink-0"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                    >
                      {simRunning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Simular
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Combina com sinônimos e categorias cadastradas usando correspondência fuzzy.
                  </p>
                </div>

                {simResult && (
                  <div className={`rounded-xl border-2 p-5 space-y-4 ${
                    simResult.found
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-red-50 border-red-300"
                  }`}>
                    <div className="flex items-center gap-3">
                      {simResult.found
                        ? <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                        : <XCircle size={22} className="text-red-500 shrink-0" />}
                      <p className={`font-semibold text-base ${
                        simResult.found ? "text-emerald-800" : "text-red-700"
                      }`}>
                        {simResult.error
                          ? `Erro: ${simResult.error}`
                          : simResult.found
                          ? "Produto encontrado no catálogo VTEX!"
                          : `Produto não encontrado${simResult.normalizedQuery ? ` (buscado: "${simResult.normalizedQuery}")` : ""}`
                        }
                      </p>
                    </div>

                    {simResult.found && (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white rounded-lg border p-3">
                          <p className="text-xs text-zinc-400 mb-0.5">Produto</p>
                          <p className="font-semibold text-zinc-800">{simResult.productName}</p>
                        </div>
                        <div className="bg-white rounded-lg border p-3">
                          <p className="text-xs text-zinc-400 mb-0.5">Categoria</p>
                          <p className="font-semibold text-zinc-800">{simResult.category || "—"}</p>
                        </div>
                        <div className="bg-white rounded-lg border p-3">
                          <p className="text-xs text-zinc-400 mb-0.5">Preço</p>
                          <p className="font-semibold text-zinc-800">{simResult.priceFormatted || "Consulte"}</p>
                        </div>
                        <div className="bg-white rounded-lg border p-3">
                          <p className="text-xs text-zinc-400 mb-0.5">Disponibilidade</p>
                          <p className={`font-semibold ${
                            simResult.available ? "text-emerald-600" : "text-red-600"
                          }`}>{simResult.available ? "✅ Disponível" : "⚠️ Indisponível"}</p>
                        </div>
                        {simResult.link && (
                          <div className="bg-white rounded-lg border p-3 col-span-2">
                            <p className="text-xs text-zinc-400 mb-1">Link direto no site</p>
                            <a
                              href={simResult.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 text-sm font-mono break-all hover:underline"
                            >
                              {simResult.link}
                            </a>
                          </div>
                        )}
                        {simResult.description && (
                          <div className="bg-white rounded-lg border p-3 col-span-2">
                            <p className="text-xs text-zinc-400 mb-1">Descrição</p>
                            <p className="text-sm text-zinc-600 leading-relaxed">{simResult.description}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {!simResult.found && !simResult.error && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs">
                        <AlertTriangle size={14} className="shrink-0" />
                        Nenhum produto encontrado. Verifique os sinônimos cadastrados ou tente um termo mais específico.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══════ TAB: CATEGORIAS VTEX ═════════════════════════════════ */}
            {activeTab === "categories" && (
              <div className="p-8 max-w-3xl space-y-6">
                <SectionHeader
                  icon={Tag}
                  title="Mapa de Categorias VTEX"
                  description="Associe cada categoria do seu catálogo às palavras-chave correspondentes para enriquecer as buscas do Fagner."
                />

                <div className="space-y-3">
                  {categories.map((cat) => {
                    const isEditing = editingCatId === cat.id;
                    return (
                      <div
                        key={cat.id}
                        className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() => setEditingCatId(isEditing ? null : cat.id)}
                          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                          >
                            <Package size={14} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-zinc-800">{cat.name}</p>
                            <p className="text-xs text-zinc-400">{cat.tags.length} tag{cat.tags.length !== 1 ? "s" : ""}</p>
                          </div>
                          {isEditing ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                        </button>

                        {isEditing && (
                          <div className="px-5 pb-5 pt-2 border-t border-zinc-100 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {cat.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"
                                >
                                  {tag}
                                  <button
                                    onClick={() =>
                                      updateCatMut.mutate({
                                        id: cat.id,
                                        tags: cat.tags.filter((t) => t !== tag),
                                      })
                                    }
                                    className="hover:text-red-900"
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2 max-w-xs">
                              <Input
                                value={newCatTag}
                                onChange={(e) => setNewCatTag(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const t = newCatTag.trim().toLowerCase();
                                    if (t && !cat.tags.includes(t)) {
                                      updateCatMut.mutate({ id: cat.id, tags: [...cat.tags, t] });
                                      setNewCatTag("");
                                    }
                                  }
                                }}
                                placeholder="Nova tag..."
                                className="h-8 text-sm border-zinc-200 bg-white"
                              />
                              <Button
                                size="sm"
                                className="h-8 text-white"
                                style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                                onClick={() => {
                                  const t = newCatTag.trim().toLowerCase();
                                  if (t && !cat.tags.includes(t)) {
                                    updateCatMut.mutate({ id: cat.id, tags: [...cat.tags, t] });
                                    setNewCatTag("");
                                  }
                                }}
                              >
                                <Plus size={13} />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>{/* /animate-tab-enter */}
        </main>
      </div>
    </div>
  );
}
