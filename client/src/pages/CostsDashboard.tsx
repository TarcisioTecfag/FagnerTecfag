import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Cpu,
  Cloud,
  FileSearch,
  PackageOpen,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiCost {
  id: string;
  service: string;
  operation: string;
  cost: number;
  currency: string;
  tokens: number | null;
  notes: string | null;
  createdAt: string;
}

interface ServiceSummary {
  service: string;
  total: number;
  count: number;
  totalTokens: number | null;
}

interface CostSummary {
  byService: ServiceSummary[];
  overall: { total: number | null; count: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_OPTIONS = [
  { value: "gemini",       label: "Gemini AI",      color: "bg-red-50 text-red-700",       icon: Cpu },
  { value: "google_cloud", label: "Google Cloud",   color: "bg-orange-50 text-orange-700",  icon: Cloud },
  { value: "cnpj",        label: "Consulta CNPJ",  color: "bg-rose-50 text-rose-700",      icon: FileSearch },
  { value: "outro",       label: "Outro",           color: "bg-zinc-100 text-zinc-600",     icon: PackageOpen },
];

const PERIOD_OPTIONS = [
  { value: "all",   label: "Todo período" },
  { value: "day",   label: "Hoje" },
  { value: "week",  label: "Últimos 7 dias" },
  { value: "month", label: "Últimos 30 dias" },
];

function getServiceMeta(service: string) {
  return (
    SERVICE_OPTIONS.find((s) => s.value === service) ?? SERVICE_OPTIONS[3]
  );
}

function fmt(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
  });
}

function fmtDate(iso: string) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ─── Form modal ───────────────────────────────────────────────────────────────

interface NewCostForm {
  service: string;
  operation: string;
  cost: string;
  tokens: string;
  notes: string;
}

const emptyForm: NewCostForm = {
  service: "gemini",
  operation: "",
  cost: "",
  tokens: "",
  notes: "",
};

interface AddModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddCostModal({ onClose, onSaved }: AddModalProps) {
  const [form, setForm] = useState<NewCostForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const set = (field: keyof NewCostForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.operation.trim() || !form.cost.trim()) {
      toast({ title: "Preencha operação e custo", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: form.service,
          operation: form.operation.trim(),
          cost: parseFloat(form.cost.replace(",", ".")),
          tokens: form.tokens ? parseInt(form.tokens) : null,
          notes: form.notes.trim() || null,
        }),
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: "Custo registrado com sucesso" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Erro ao salvar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-50">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <DollarSign size={16} />
            </div>
            <h2 className="font-semibold text-zinc-950 text-sm">Novo Registro de Custo</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Service */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Serviço</label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICE_OPTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => set("service", s.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all
                      ${form.service === s.value
                        ? "border-red-700 text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-red-300"
                      }`}
                    style={form.service === s.value
                      ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }
                      : {}
                    }
                  >
                    <Icon size={14} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Operation */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Operação</label>
            <input
              type="text"
              value={form.operation}
              onChange={(e) => set("operation", e.target.value)}
              placeholder="Ex: Consulta Gemini Pro, Verificação CNPJ..."
              className="w-full border border-red-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 transition-colors"
              required
            />
          </div>

          {/* Cost + Tokens row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">Custo (R$)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.cost}
                onChange={(e) => set("cost", e.target.value)}
                placeholder="0,0000"
                className="w-full border border-red-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">Tokens <span className="text-zinc-400">(opcional)</span></label>
              <input
                type="number"
                min="0"
                value={form.tokens}
                onChange={(e) => set("tokens", e.target.value)}
                placeholder="0"
                className="w-full border border-red-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 transition-colors"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Observações <span className="text-zinc-400">(opcional)</span></label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Detalhes adicionais..."
              className="w-full border border-red-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 resize-none transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-red-100 text-zinc-600 text-sm font-medium py-2 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              {loading ? "Salvando..." : "Salvar Registro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CostsDashboard() {
  const [showModal, setShowModal] = useState(false);
  const [filterService, setFilterService] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const qc = useQueryClient();
  const { toast } = useToast();

  // Queries
  const { data: summary, isLoading: summaryLoading } = useQuery<CostSummary>({
    queryKey: ["/api/costs/summary"],
    refetchInterval: 30000,
  });

  const { data: costs = [], isLoading: costsLoading, refetch } = useQuery<ApiCost[]>({
    queryKey: ["/api/costs", filterService, filterPeriod],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterService !== "all") params.append("service", filterService);
      if (filterPeriod !== "all") params.append("period", filterPeriod);
      const r = await fetch(`/api/costs?${params}`, { credentials: "include" });
      return r.json();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/costs/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/costs"] });
      qc.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      toast({ title: "Registro removido" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Erro ao remover", variant: "destructive" });
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/costs"] });
    qc.invalidateQueries({ queryKey: ["/api/costs/summary"] });
  }

  function onSaved() {
    refresh();
  }

  const totalGeral = summary?.overall?.total ?? 0;

  // ─── Summary cards config ──────────────────────────────────────────────────
  const summaryCards = [
    {
      label: "Total Geral",
      value: fmt(totalGeral),
      sub: `${summary?.overall?.count ?? 0} registros`,
      icon: TrendingUp,
      isMain: true,
    },
    ...SERVICE_OPTIONS.map((svc) => {
      const data = summary?.byService?.find((b) => b.service === svc.value);
      return {
        label: svc.label,
        value: fmt(data?.total),
        sub: data ? `${data.count} operações` : "Sem registros",
        icon: svc.icon,
        colorClass: svc.color,
        isMain: false,
      };
    }),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">Custos de API</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Acompanhe os custos das APIs consumidas pelo chatbot Fagner
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { refetch(); refresh(); }}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-red-100 text-zinc-400 hover:text-red-600 hover:border-red-300 transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 h-9 px-4 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <Plus size={15} />
              Novo Registro
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="flex-shrink-0 px-8 pb-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`rounded-xl p-4 border`}
                style={card.isMain
                  ? { background: "linear-gradient(145deg, #1a0000, #7f1d1d)", borderColor: "rgba(153,27,27,0.4)" }
                  : { background: "#ffffff", borderColor: "#fee2e2" }
                }
              >
                <div className="flex items-start justify-between mb-3">
                  <p className={`text-xs font-medium ${card.isMain ? "text-red-300" : "text-zinc-500"}`}>
                    {card.label}
                  </p>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={card.isMain ? { background: "rgba(255,255,255,0.10)" } : { background: "rgba(220,38,38,0.07)" }}
                  >
                    <Icon size={14} style={{ color: card.isMain ? "#fca5a5" : "#dc2626" }} />
                  </div>
                </div>
                <p className={`text-lg font-bold tracking-tight leading-none ${card.isMain ? "text-white" : "text-zinc-950"}`}>
                  {summaryLoading ? "..." : card.value}
                </p>
                <p className={`text-xs mt-1 ${card.isMain ? "text-red-400" : "text-zinc-400"}`}>
                  {summaryLoading ? "" : card.sub}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-8 pb-3 flex items-center gap-3 flex-wrap">
        {/* Service filter */}
        <div className="flex items-center gap-1.5 bg-red-50 rounded-lg p-1">
          <button
            onClick={() => setFilterService("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterService === "all" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-950"}`}
          >
            Todos
          </button>
          {SERVICE_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilterService(s.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterService === s.value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-950"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Period filter */}
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          className="text-xs font-medium border border-red-100 rounded-lg px-3 py-2 outline-none focus:border-red-500 bg-white text-zinc-600 transition-colors"
        >
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 pb-8">
        <div className="bg-white rounded-xl border border-red-100 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_2fr_120px_100px_80px] gap-4 px-5 py-3 border-b border-red-50" style={{ background: "rgba(220,38,38,0.03)" }}>
            {["Serviço", "Operação", "Data", "Custo", ""].map((h) => (
              <p key={h} className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{h}</p>
            ))}
          </div>

          {/* Rows */}
          {costsLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
              Carregando...
            </div>
          ) : costs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(220,38,38,0.07)" }}>
                <DollarSign size={22} style={{ color: "#dc2626" }} />
              </div>
              <p className="text-sm text-zinc-500">Nenhum custo registrado ainda</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs font-medium underline underline-offset-2"
                style={{ color: "#dc2626" }}
              >
                Adicionar primeiro registro
              </button>
            </div>
          ) : (
            costs.map((c) => {
              const meta = getServiceMeta(c.service);
              const Icon = meta.icon;
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_2fr_120px_100px_80px] gap-4 px-5 py-3.5 items-center border-b border-red-50/50 hover:bg-red-50/20 transition-colors group"
                >
                  {/* Service badge */}
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit ${meta.color}`}>
                    <Icon size={11} />
                    {meta.label}
                  </div>

                  {/* Operation */}
                  <div>
                    <p className="text-sm text-zinc-800 font-medium truncate">{c.operation}</p>
                    {c.tokens != null && (
                      <p className="text-xs text-zinc-400">{c.tokens.toLocaleString("pt-BR")} tokens</p>
                    )}
                    {c.notes && (
                      <p className="text-xs text-zinc-400 truncate">{c.notes}</p>
                    )}
                  </div>

                  {/* Date */}
                  <p className="text-xs text-zinc-400">{fmtDate(c.createdAt)}</p>

                  {/* Cost */}
                  <p className="text-sm font-semibold text-zinc-950 tabular-nums">{fmt(c.cost)}</p>

                  {/* Delete */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        if (confirm("Remover este registro?")) deleteMutation.mutate(c.id);
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <AddCostModal onClose={() => setShowModal(false)} onSaved={onSaved} />
      )}
    </div>
  );
}
