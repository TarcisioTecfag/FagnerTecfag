/**
 * client/src/components/CustomerModal.tsx
 *
 * Novo modal de visitante — baseado no repositório client-glance
 * (https://github.com/TarcisioTecfag/client-glance)
 *
 * Design 100% preservado do original.
 * Adaptado para receber dados reais do sistema Tecfag/LiveChat.
 */

import { useState } from "react";
import {
  X, MapPin, Globe, Hash, Phone, Mail, CreditCard, Clock,
  ExternalLink, ChevronRight, User, Activity, MessageSquare,
  Zap, Filter, MousePointerClick, BarChart3, FileText,
  Laptop, Smartphone, Tablet, Target, Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Tipos do sistema Tecfag ──────────────────────────────────────────────────

export interface VisitorForModal {
  id: string;
  name?: string | null;
  city?: string | null;
  country?: string | null;
  browser?: string | null;
  userAgent?: string | null;
  totalVisits: number;
  source?: string | null;
  totalPages: number;
  totalChats: number;
  engagementScore: number;
  purchaseIntentScore?: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  pipelineStage?: string | null;
  deviceType?: string | null;
  aiBriefing?: {
    produtoInteresse?: string;
    fabricaO?: string;
    volume?: string;
    sentimento?: string;
    proximaAcao?: string;
  } | null;
  // Dados do cliente (pós-venda / máquinas / peças)
  posVendaNome?: string | null;
  posVendaTelefone?: string | null;
  posVendaEmail?: string | null;
  posVendaCnpjCpf?: string | null;
  posVendaProblema?: string | null;
  pecaDesejada?: string | null;
  maquinaDesejada?: string | null;
  // Link para CRM
  rdCrmDealId?: string | null;
}

export interface PageviewForModal {
  id: string | number;
  url: string;
  pageTitle?: string | null;
  visitedAt: string;
  intentTag?: string | null;
  timeSpent?: number | null;
  scrollDepth?: number | null;
}

export interface TimelineEventForModal {
  type: string;
  timestamp: string;
  label: string;
  meta?: Record<string, any>;
}

interface CustomerModalProps {
  visitor: VisitorForModal;
  pageviews: PageviewForModal[];
  timeline?: TimelineEventForModal[] | null;
  timelineLoading?: boolean;
  open: boolean;
  onClose: () => void;
  onOpenCRM?: () => void;
  onLoadTimeline?: (visitorId: string) => void;
}

// ─── Sub-componentes (preservados do original) ────────────────────────────────

const StatCard = ({
  icon: Icon, label, value, delay, highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  delay: number;
  highlight?: "red" | "amber" | "emerald";
}) => (
  <div
    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/50 min-w-0 animate-stagger-in hover:bg-muted/80 transition-colors"
    style={{ animationDelay: `${delay}ms` }}
  >
    <Icon className="w-4 h-4 text-brand" />
    <span
      className={`text-lg font-bold ${
        highlight === "red" ? "text-red-600" :
        highlight === "amber" ? "text-amber-600" :
        highlight === "emerald" ? "text-emerald-600" :
        "text-foreground"
      }`}
    >
      {value}
    </span>
    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
  </div>
);

const InfoChip = ({
  icon: Icon, children, delay, empty,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  delay: number;
  empty?: boolean;
}) => (
  <div
    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-muted/50 text-sm text-foreground animate-stagger-in hover:bg-muted transition-colors cursor-default ${empty ? "opacity-40 italic" : ""}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    <Icon className="w-4 h-4 text-brand/70 flex-shrink-0" />
    <span className="truncate">{children}</span>
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtTime(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}min ${s}s` : `${m}min`;
  }
  return `${seconds}s`;
}

function sourceLabel(source?: string | null): string {
  const map: Record<string, string> = {
    google_ads: "Google Ads", google_organic: "Google Orgânico",
    facebook: "Facebook", instagram: "Instagram",
    direct: "Direto", email: "E-mail", whatsapp: "WhatsApp",
    referral: "Referência", youtube: "YouTube",
  };
  return map[source ?? ""] ?? source ?? "Desconhecido";
}

// Intent tag helpers
const INTENT_COLORS: Record<string, string> = {
  checkout_compra:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  orcamento_contato:         "bg-blue-50 text-blue-700 border-blue-200",
  maquinas_seladora_premium: "bg-orange-50 text-orange-700 border-orange-200",
  maquinas_seladora:         "bg-orange-50 text-orange-600 border-orange-100",
  maquinas_geral:            "bg-amber-50 text-amber-700 border-amber-200",
  pecas_reposicao:           "bg-yellow-50 text-yellow-700 border-yellow-200",
  pos_venda_suporte:         "bg-purple-50 text-purple-700 border-purple-200",
  institucional:             "bg-zinc-100 text-zinc-500 border-zinc-200",
  blog_conteudo:             "bg-sky-50 text-sky-600 border-sky-200",
};
const INTENT_ICONS: Record<string, string> = {
  checkout_compra: "🛒", orcamento_contato: "📋",
  maquinas_seladora_premium: "🏭", maquinas_seladora: "⚙️",
  maquinas_geral: "🔧",  pecas_reposicao: "🔩",
  pos_venda_suporte: "🛠️", institucional: "🏢", blog_conteudo: "📰",
};

function deviceIcon(deviceType?: string | null): React.ElementType {
  if (deviceType === "mobile") return Smartphone;
  if (deviceType === "tablet") return Tablet;
  return Laptop;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CustomerModal({
  visitor, pageviews, timeline, timelineLoading,
  open, onClose, onOpenCRM, onLoadTimeline,
}: CustomerModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<"cliente" | "historico" | "atividades">("cliente");

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  if (!open) return null;

  const displayName = visitor.name || "NÃO IDENTIFICADO";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "?")
    .join("")
    .toUpperCase();

  const location = [visitor.city, visitor.country].filter(Boolean).join(", ") || "Localização desconhecida";
  const DevIcon = deviceIcon(visitor.deviceType);

  // Score de compra com highlight
  const intentScore = visitor.purchaseIntentScore ?? 0;
  const scoreHighlight: "red" | "amber" | "emerald" | undefined =
    intentScore >= 60 ? "emerald" : intentScore >= 30 ? "amber" : intentScore >= 1 ? undefined : undefined;

  // Funnel / Pipeline label
  const funnelLabel = (visitor.pipelineStage ?? "novo_atendimento").replace(/_/g, " ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? "opacity-0" : "opacity-100"}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-4xl bg-background rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-all duration-300 ${isClosing ? "opacity-0 scale-95" : "animate-scale-in"}`}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-brand to-brand-dark px-8 pt-6 pb-8 animate-fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar com iniciais */}
              <div
                className="w-16 h-16 rounded-full bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center border-2 border-primary-foreground/30 animate-scale-in flex-shrink-0"
                style={{ animationDelay: "100ms" }}
              >
                <span className="text-2xl font-bold text-primary-foreground">{initials}</span>
              </div>

              <div className="animate-slide-in-right">
                <h2 className="text-2xl font-bold text-primary-foreground">{displayName}</h2>
                <div className="flex items-center gap-4 mt-1.5 text-primary-foreground/80 text-sm flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />{location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DevIcon className="w-3.5 h-3.5" />
                    {visitor.browser || visitor.deviceType || "Chrome"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" />{visitor.totalVisits} visitas
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 animate-fade-in flex-shrink-0" style={{ animationDelay: "200ms" }}>
              {onOpenCRM && (
                <button
                  onClick={onOpenCRM}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground text-sm font-medium backdrop-blur-sm transition-all hover:scale-105 active:scale-95"
                >
                  Ver no CRM <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center text-primary-foreground transition-all hover:rotate-90 duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Stats Row ────────────────────────────────────────────────── */}
        <div className="px-8 -mt-4 relative z-10">
          <div className="grid grid-cols-4 gap-3 bg-background rounded-xl border border-border shadow-sm p-2">
            <StatCard icon={Activity}     label="Páginas"  value={visitor.totalPages}    delay={150} />
            <StatCard icon={MessageSquare} label="Chats"   value={visitor.totalChats}    delay={250} />
            <StatCard
              icon={Zap}
              label="Eng."
              value={visitor.engagementScore}
              delay={350}
              highlight={visitor.engagementScore >= 60 ? "red" : visitor.engagementScore >= 30 ? "amber" : undefined}
            />
            <StatCard
              icon={Target}
              label="Intenção"
              value={intentScore}
              delay={450}
              highlight={scoreHighlight}
            />
          </div>
        </div>

        {/* ── Source & Funnel ───────────────────────────────────────────── */}
        <div className="px-8 mt-4 flex items-center gap-2 animate-fade-in flex-wrap" style={{ animationDelay: "300ms" }}>
          <Badge variant="outline" className="text-xs">
            Source: <span className="font-semibold ml-1">{sourceLabel(visitor.source)}</span>
          </Badge>
          <Badge className="bg-brand-light text-brand border-brand/20 hover:bg-brand-light text-xs">
            <Filter className="w-3 h-3 mr-1" />
            {funnelLabel}
          </Badge>
          {visitor.aiBriefing?.proximaAcao && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">
              ⚡ {visitor.aiBriefing.proximaAcao}
            </Badge>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden mt-4 animate-slide-up" style={{ animationDelay: "350ms" }}>
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as typeof activeTab);
              if (v === "atividades" && !timeline && onLoadTimeline) {
                onLoadTimeline(visitor.id);
              }
            }}
            className="flex flex-col h-full"
          >
            <div className="px-8">
              <TabsList className="w-full bg-muted/50 p-1 rounded-lg">
                <TabsTrigger
                  value="cliente"
                  className="flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-brand gap-1.5 transition-all"
                >
                  <User className="w-3.5 h-3.5" /> Cliente
                </TabsTrigger>
                <TabsTrigger
                  value="historico"
                  className="flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-brand gap-1.5 transition-all"
                >
                  <Globe className="w-3.5 h-3.5" /> Navegação
                </TabsTrigger>
                <TabsTrigger
                  value="atividades"
                  className="flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-brand gap-1.5 transition-all"
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Jornada
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-6 mt-4">

              {/* ── Tab: Cliente ─────────────────────────────────────── */}
              <TabsContent value="cliente" className="mt-0 space-y-4">
                {/* Dados de contato */}
                <div className="grid grid-cols-2 gap-2.5">
                  <InfoChip icon={User} delay={0} empty={!visitor.posVendaNome && !visitor.name}>
                    {visitor.posVendaNome || visitor.name || "Não identificado"}
                  </InfoChip>
                  <InfoChip icon={Phone} delay={50} empty={!visitor.posVendaTelefone}>
                    {visitor.posVendaTelefone || "Telefone não informado"}
                  </InfoChip>
                  <InfoChip icon={Mail} delay={100} empty={!visitor.posVendaEmail}>
                    {visitor.posVendaEmail || "E-mail não informado"}
                  </InfoChip>
                  <InfoChip icon={CreditCard} delay={150} empty={!visitor.posVendaCnpjCpf}>
                    {visitor.posVendaCnpjCpf || "CPF/CNPJ não informado"}
                  </InfoChip>
                </div>

                {/* Produto / Interesse */}
                {(visitor.maquinaDesejada || visitor.pecaDesejada || visitor.aiBriefing?.produtoInteresse) && (
                  <div className="mt-2 p-4 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-2">🧠 Interesse Detectado</p>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      {(visitor.maquinaDesejada || visitor.aiBriefing?.produtoInteresse) && (
                        <div>
                          <span className="text-amber-600 font-semibold">🎯 Produto:</span>{" "}
                          <span className="text-zinc-700">{visitor.maquinaDesejada || visitor.aiBriefing?.produtoInteresse}</span>
                        </div>
                      )}
                      {visitor.pecaDesejada && (
                        <div>
                          <span className="text-amber-600 font-semibold">🔩 Peça:</span>{" "}
                          <span className="text-zinc-700">{visitor.pecaDesejada}</span>
                        </div>
                      )}
                      {visitor.aiBriefing?.volume && (
                        <div>
                          <span className="text-amber-600 font-semibold">📦 Volume:</span>{" "}
                          <span className="text-zinc-700">{visitor.aiBriefing.volume}</span>
                        </div>
                      )}
                      {visitor.aiBriefing?.fabricaO && (
                        <div>
                          <span className="text-amber-600 font-semibold">🏭 Fabrica:</span>{" "}
                          <span className="text-zinc-700">{visitor.aiBriefing.fabricaO}</span>
                        </div>
                      )}
                      {visitor.aiBriefing?.sentimento && (
                        <div className="col-span-2">
                          <span className="text-amber-600 font-semibold">💬 Sentimento:</span>{" "}
                          <span className="text-zinc-700">{visitor.aiBriefing.sentimento}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Primeiro acesso */}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 text-brand/60" />
                  Primeiro acesso: <strong className="text-foreground">{timeAgo(visitor.firstSeenAt)}</strong>
                  &nbsp;·&nbsp;
                  Última visita: <strong className="text-foreground">{timeAgo(visitor.lastSeenAt)}</strong>
                </div>

                {/* Problema Pós-Venda */}
                {visitor.posVendaProblema && (
                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-100 text-[12px]">
                    <p className="text-purple-600 font-bold mb-1">⚙️ Problema Relatado</p>
                    <p className="text-zinc-700 leading-relaxed">{visitor.posVendaProblema}</p>
                  </div>
                )}
              </TabsContent>

              {/* ── Tab: Histórico / Navegação ───────────────────────── */}
              <TabsContent value="historico" className="mt-0">
                {pageviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Globe className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">Nenhuma página registrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pageviews.map((pv, i) => {
                      const showIntent = pv.intentTag && pv.intentTag !== "navegacao_geral";
                      const intentClass = showIntent ? (INTENT_COLORS[pv.intentTag!] ?? "bg-zinc-50 text-zinc-500 border-zinc-200") : null;
                      const intentIcon = showIntent ? (INTENT_ICONS[pv.intentTag!] ?? "🌐") : null;

                      return (
                        <div
                          key={String(pv.id)}
                          className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border hover:border-brand/30 hover:bg-brand-light/30 transition-all group cursor-pointer animate-stagger-in"
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          {/* Número */}
                          <div className="w-8 h-8 rounded-full bg-brand-light text-brand text-xs font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-brand group-hover:text-primary-foreground transition-all group-hover:scale-110">
                            {i + 1}
                          </div>

                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-foreground truncate">{pv.pageTitle || pv.url}</p>
                              {intentClass && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${intentClass}`}>
                                  {intentIcon} {pv.intentTag!.replace(/_/g, " ")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{pv.url}</p>
                            {/* Time-on-page + scroll */}
                            {(pv.timeSpent || pv.scrollDepth) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {pv.timeSpent != null && pv.timeSpent > 0 && (
                                  <span className="text-[9px] text-blue-500 font-medium">⏱ {fmtTime(pv.timeSpent)}</span>
                                )}
                                {pv.scrollDepth != null && pv.scrollDepth > 0 && (
                                  <span className="text-[9px] text-purple-500 font-medium">📜 {pv.scrollDepth}%</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Tempo atrás */}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            {timeAgo(pv.visitedAt)}
                          </div>

                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── Tab: Atividades / Jornada ────────────────────────── */}
              <TabsContent value="atividades" className="mt-0">
                {timelineLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="text-sm">Carregando jornada...</span>
                  </div>
                ) : !timeline || timeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Activity className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">Nenhum evento registrado</p>
                    {onLoadTimeline && (
                      <button
                        onClick={() => onLoadTimeline(visitor.id)}
                        className="mt-3 text-xs text-brand hover:underline font-medium"
                      >
                        Carregar jornada
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    {/* Linha do tempo */}
                    <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />

                    <div className="space-y-1">
                      {timeline.map((evt, i) => {
                        const TYPE_META: Record<string, { icon: React.ElementType; label: string }> = {
                          session_start: { icon: Globe,           label: "Sessão iniciada" },
                          pageview:      { icon: FileText,        label: "Página visitada" },
                          chat_start:    { icon: MessageSquare,   label: "Chat iniciado" },
                          chat_closed:   { icon: Activity,        label: "Chat encerrado" },
                          note_added:    { icon: FileText,        label: "Nota adicionada" },
                          returned:      { icon: MousePointerClick, label: "Retornou ao site" },
                        };
                        const meta = TYPE_META[evt.type] ?? { icon: Activity, label: evt.type };
                        const Icon = meta.icon;
                        const urlPath = evt.meta?.url
                          ? (evt.meta.url as string).replace(/^https?:\/\/[^/]+/, "").slice(0, 55)
                          : null;

                        // Intent emoji inline
                        const QUICK_INTENT: Record<string, string> = {
                          checkout_compra: "🛒", orcamento_contato: "📋",
                          maquinas_seladora_premium: "🏭", maquinas_seladora: "⚙️",
                          maquinas_geral: "🔧", pecas_reposicao: "🔩",
                          pos_venda_suporte: "🛠️",
                        };
                        const intentEmoji = evt.meta?.intentTag && evt.meta.intentTag !== "navegacao_geral"
                          ? (QUICK_INTENT[evt.meta.intentTag as string] ?? null)
                          : null;

                        return (
                          <div
                            key={i}
                            className="flex items-start gap-4 px-4 py-3 rounded-xl hover:bg-muted/50 transition-all cursor-default animate-stagger-in relative"
                            style={{ animationDelay: `${i * 60}ms` }}
                          >
                            <div className="w-[22px] h-[22px] rounded-full bg-brand-light text-brand flex items-center justify-center flex-shrink-0 z-10 ring-2 ring-background">
                              <Icon className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-foreground truncate">{evt.label}</p>
                                {intentEmoji && <span className="text-[11px]">{intentEmoji}</span>}
                              </div>
                              {urlPath && urlPath !== "/" && (
                                <p className="text-[10px] text-muted-foreground font-mono truncate">{urlPath}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {new Date(evt.timestamp).toLocaleString("pt-BR", {
                                  timeZone: "America/Sao_Paulo",
                                  day: "2-digit", month: "2-digit",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                              <Clock className="w-3 h-3" />
                              {timeAgo(evt.timestamp)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
