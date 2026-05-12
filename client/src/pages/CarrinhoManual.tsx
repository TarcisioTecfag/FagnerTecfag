import { useState } from "react";
import {
  ShoppingCart, User, Building2, Package, MapPin, Mail, Phone,
  Hash, ChevronRight, Loader2, CheckCircle2, XCircle, Copy,
  ExternalLink, Tag, Truck, AlertTriangle, RefreshCw, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CartResult {
  success: boolean;
  orderFormId: string;
  checkoutLink: string;
  total: string;
  couponApplied: boolean;
  freteInfo: {
    carrier: string;
    deliveryDays: number;
    priceFormatted: string;
  };
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({
  icon: Icon, title, children, accent = false
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border overflow-hidden ${accent ? "border-red-200 shadow-sm shadow-red-100" : "border-zinc-200"} bg-white`}>
      <div
        className="px-5 py-3.5 flex items-center gap-2.5 border-b"
        style={accent
          ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)", borderColor: "rgba(220,38,38,0.3)" }
          : { background: "#fafafa", borderColor: "#e4e4e7" }}
      >
        <Icon size={15} className={accent ? "text-red-200" : "text-zinc-500"} />
        <span className={`text-sm font-semibold ${accent ? "text-white" : "text-zinc-700"}`}>{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CarrinhoManual() {
  const { toast } = useToast();

  // Tipo de pessoa
  const [tipo, setTipo] = useState<"cpf" | "cnpj">("cpf");

  // Dados do produto
  const [skuId, setSkuId]         = useState("");
  const [produto, setProduto]     = useState("");
  const [quantidade, setQtd]      = useState("1");
  const [preco, setPreco]         = useState(""); // em reais

  // PF
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [cpf, setCpf]             = useState("");

  // PJ
  const [corporateName, setCorporateName] = useState("");
  const [tradeName, setTradeName]         = useState("");
  const [cnpj, setCnpj]                   = useState("");
  const [responsavel, setResponsavel]     = useState("");
  const [stateInscription, setStateInscription] = useState("ISENTO");

  // Contato e endereço (compartilhado)
  const [email, setEmail]         = useState("");
  const [telefone, setTelefone]   = useState("");
  const [cep, setCep]             = useState("");
  const [addressNumber, setAddrNum] = useState("");
  const [complement, setComplement] = useState("");

  // Estado de execução
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<CartResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // ── Format helpers ──────────────────────────────────────────────────────────
  const fmtCpf = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
      [a, b, c].filter(Boolean).join(".") + (e ? `-${e}` : "")
    );
  };
  const fmtCnpj = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 14);
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, e, f) =>
      [a, b, c].filter(Boolean).join(".") + (e ? `/${e}` : "") + (f ? `-${f}` : "")
    );
  };
  const fmtCep = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.replace(/(\d{5})(\d{0,3})/, (_, a, b) => a + (b ? `-${b}` : ""));
  };
  const fmtPhone = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) =>
      `(${a}) ${b}` + (c ? `-${c}` : "")
    );
  };
  const fmtPreco = (v: string) => v.replace(/[^\d,\.]/g, "");

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Converte preço para centavos
    const precoNum = Math.round(parseFloat(preco.replace(",", ".")) * 100);
    if (isNaN(precoNum) || precoNum <= 0) {
      setError("Preço inválido. Use o formato 1234.56 ou 1234,56");
      return;
    }

    const payload: Record<string, any> = {
      tipo,
      skuId: skuId.trim(),
      quantidade: parseInt(quantidade),
      produto: produto.trim(),
      preco: precoNum,
      email: email.trim(),
      telefone: telefone.replace(/\D/g, ""),
      cep: cep.replace(/\D/g, ""),
      addressNumber: addressNumber.trim(),
      complement: complement.trim() || undefined,
    };

    if (tipo === "cpf") {
      payload.firstName = firstName.trim();
      payload.lastName = lastName.trim();
      payload.cpf = cpf.replace(/\D/g, "");
    } else {
      payload.corporateName = corporateName.trim();
      payload.tradeName = tradeName.trim() || undefined;
      payload.cnpj = cnpj.replace(/\D/g, "");
      payload.responsavel = responsavel.trim();
      payload.stateInscription = stateInscription.trim() || "ISENTO";
    }

    setLoading(true);
    try {
      const res = await fetch("/api/vtex/build-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Erro desconhecido ao gerar carrinho.");
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(`Erro de rede: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.checkoutLink);
    toast({ title: "Link copiado! 📋", description: "Cole no chat ou WhatsApp do cliente." });
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 border-b"
        style={{ background: "linear-gradient(145deg, #1a0000, #450a0a, #1a0000)", borderColor: "rgba(153,27,27,0.5)" }}
      >
        <div className="px-8 py-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/10">
              <ShoppingCart size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-red-300 text-xs font-medium">Painel</span>
                <ChevronRight size={11} className="text-red-500" />
                <span className="text-red-400 text-xs font-medium">VTEX</span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Carrinho Manual com FAGNER5</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
              <AlertTriangle size={12} />
              Use quando o Fagner falhar
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700">
              Preencha os dados do cliente e do produto. O sistema irá gerar um link de pagamento completo
              com o <strong>cupom FAGNER5 (5% de desconto)</strong> já aplicado — pronto para enviar ao cliente.
            </p>
          </div>

          {/* ── Resultado ──────────────────────────────────────────────────── */}
          {result && (
            <div
              className="rounded-2xl border overflow-hidden shadow-lg"
              style={{ background: "linear-gradient(135deg, #052e16, #14532d)", borderColor: "rgba(34,197,94,0.3)" }}
            >
              <div className="px-6 py-4 flex items-center gap-3 border-b border-green-800/40">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-base">Carrinho Gerado com Sucesso!</p>
                  <p className="text-emerald-300 text-xs">Envie o link abaixo para o cliente</p>
                </div>
                <button
                  onClick={reset}
                  className="ml-auto text-green-400 hover:text-white transition-colors"
                  title="Gerar novo carrinho"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Link */}
                <div className="bg-black/30 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">🔗 Link de Pagamento</p>
                  <p className="text-green-100 text-sm break-all font-mono leading-relaxed">
                    {result.checkoutLink}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={copyLink}
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Copy size={12} /> Copiar Link
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => window.open(result.checkoutLink, "_blank")}
                      className="h-8 text-xs gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20"
                    >
                      <ExternalLink size={12} /> Abrir
                    </Button>
                  </div>
                </div>

                {/* Resumo */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <Tag size={16} className={`mx-auto mb-1 ${result.couponApplied ? "text-emerald-400" : "text-red-400"}`} />
                    <p className="text-white font-bold text-sm">
                      {result.couponApplied ? "✅ Cupom OK" : "⚠️ Sem cupom"}
                    </p>
                    <p className="text-emerald-300 text-xs">FAGNER5</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <ShoppingCart size={16} className="mx-auto mb-1 text-emerald-400" />
                    <p className="text-white font-bold text-sm">{result.total}</p>
                    <p className="text-emerald-300 text-xs">Total c/ desconto</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <Truck size={16} className="mx-auto mb-1 text-emerald-400" />
                    <p className="text-white font-bold text-sm">{result.freteInfo.priceFormatted}</p>
                    <p className="text-emerald-300 text-xs">{result.freteInfo.carrier} · {result.freteInfo.deliveryDays}d</p>
                  </div>
                </div>

                {!result.couponApplied && (
                  <div className="flex items-start gap-2.5 bg-amber-900/30 border border-amber-600/30 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-amber-200 text-xs leading-relaxed">
                      O cupom <strong>FAGNER5</strong> não foi aplicado. Isso pode ocorrer quando a máquina não está inclusa
                      na promoção VTEX ou há conflito com outro desconto. Verifique as regras da promoção no painel VTEX.
                      O link ainda é válido — o cliente verá o campo para digitar o cupom manualmente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Erro ───────────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Falha ao gerar carrinho</p>
                <p className="text-sm text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* ── Formulário ─────────────────────────────────────────────────── */}
          {!result && (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Tipo de pessoa */}
              <SectionCard icon={User} title="Tipo de Cliente" accent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "cpf",  label: "Pessoa Física",   desc: "CPF",  emoji: "👤" },
                    { value: "cnpj", label: "Pessoa Jurídica", desc: "CNPJ", emoji: "🏢" },
                  ].map((opt) => {
                    const active = tipo === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTipo(opt.value as "cpf" | "cnpj")}
                        className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                          active ? "border-red-700 shadow-md" : "border-zinc-200 bg-zinc-50 hover:border-red-300"
                        }`}
                        style={active ? { background: "linear-gradient(135deg, #1a0000, #7f1d1d)" } : {}}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{opt.emoji}</span>
                          <div>
                            <p className={`font-semibold text-sm ${active ? "text-white" : "text-zinc-700"}`}>
                              {opt.label}
                            </p>
                            <p className={`text-xs ${active ? "text-red-200" : "text-zinc-400"}`}>{opt.desc}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Produto */}
              <SectionCard icon={Package} title="Dados do Produto">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Nome do Produto" hint="Ex: Pratic Seal, Envasadora Automática...">
                      <Input
                        id="produto"
                        value={produto}
                        onChange={e => setProduto(e.target.value)}
                        placeholder="Ex: Pratic Seal 300"
                        required
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                  </div>
                  <Field label="SKU ID VTEX" hint="Número do SKU na VTEX (ex: 12345)">
                    <div className="relative">
                      <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <Input
                        id="skuId"
                        value={skuId}
                        onChange={e => setSkuId(e.target.value.replace(/\D/g, ""))}
                        placeholder="12345"
                        required
                        className="h-9 border-zinc-200 bg-white pl-8"
                      />
                    </div>
                  </Field>
                  <Field label="Preço Unitário (R$)" hint="Valor em reais. Ex: 873,40">
                    <Input
                      id="preco"
                      value={preco}
                      onChange={e => setPreco(fmtPreco(e.target.value))}
                      placeholder="873,40"
                      required
                      className="h-9 border-zinc-200 bg-white"
                    />
                  </Field>
                  <Field label="Quantidade">
                    <Input
                      id="quantidade"
                      type="number"
                      min={1}
                      max={99}
                      value={quantidade}
                      onChange={e => setQtd(e.target.value)}
                      required
                      className="h-9 border-zinc-200 bg-white"
                    />
                  </Field>
                </div>
              </SectionCard>

              {/* Dados do Cliente — PF */}
              {tipo === "cpf" && (
                <SectionCard icon={User} title="Dados do Cliente (Pessoa Física)">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Nome">
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="João"
                        required
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                    <Field label="Sobrenome">
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Silva"
                        required
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                    <Field label="CPF">
                      <Input
                        id="cpf"
                        value={cpf}
                        onChange={e => setCpf(fmtCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        required
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                  </div>
                </SectionCard>
              )}

              {/* Dados do Cliente — PJ */}
              {tipo === "cnpj" && (
                <SectionCard icon={Building2} title="Dados do Cliente (Pessoa Jurídica)">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Field label="Razão Social">
                        <Input
                          id="corporateName"
                          value={corporateName}
                          onChange={e => setCorporateName(e.target.value)}
                          placeholder="Empresa Ltda."
                          required
                          className="h-9 border-zinc-200 bg-white"
                        />
                      </Field>
                    </div>
                    <Field label="Nome Fantasia (opcional)">
                      <Input
                        id="tradeName"
                        value={tradeName}
                        onChange={e => setTradeName(e.target.value)}
                        placeholder="Empresa"
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                    <Field label="CNPJ">
                      <Input
                        id="cnpj"
                        value={cnpj}
                        onChange={e => setCnpj(fmtCnpj(e.target.value))}
                        placeholder="00.000.000/0000-00"
                        required
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                    <Field label="Nome do Responsável">
                      <Input
                        id="responsavel"
                        value={responsavel}
                        onChange={e => setResponsavel(e.target.value)}
                        placeholder="Maria Oliveira"
                        required
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                    <Field label="Inscrição Estadual" hint='Digite "ISENTO" se não tiver'>
                      <Input
                        id="stateInscription"
                        value={stateInscription}
                        onChange={e => setStateInscription(e.target.value)}
                        placeholder="ISENTO"
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                  </div>
                </SectionCard>
              )}

              {/* Contato */}
              <SectionCard icon={Mail} title="Contato">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="E-mail">
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="cliente@email.com"
                        required
                        className="h-9 border-zinc-200 bg-white pl-8"
                      />
                    </div>
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <Input
                        id="telefone"
                        value={telefone}
                        onChange={e => setTelefone(fmtPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        required
                        className="h-9 border-zinc-200 bg-white pl-8"
                      />
                    </div>
                  </Field>
                </div>
              </SectionCard>

              {/* Endereço */}
              <SectionCard icon={MapPin} title="Endereço de Entrega">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="CEP" hint="Só os números, ex: 01310-100">
                    <div className="relative">
                      <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <Input
                        id="cep"
                        value={cep}
                        onChange={e => setCep(fmtCep(e.target.value))}
                        placeholder="00000-000"
                        required
                        className="h-9 border-zinc-200 bg-white pl-8"
                      />
                    </div>
                  </Field>
                  <Field label="Número">
                    <Input
                      id="addressNumber"
                      value={addressNumber}
                      onChange={e => setAddrNum(e.target.value)}
                      placeholder="123"
                      required
                      className="h-9 border-zinc-200 bg-white"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Complemento (opcional)">
                      <Input
                        id="complement"
                        value={complement}
                        onChange={e => setComplement(e.target.value)}
                        placeholder="Apto 42, Bloco B..."
                        className="h-9 border-zinc-200 bg-white"
                      />
                    </Field>
                  </div>
                </div>
              </SectionCard>

              {/* Cupom info */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-red-950 to-red-900 border border-red-800/50 rounded-xl px-4 py-3">
                <Tag size={16} className="text-red-300 shrink-0" />
                <div>
                  <p className="text-white text-sm font-semibold">Cupom FAGNER5 será aplicado automaticamente</p>
                  <p className="text-red-300 text-xs">5% de desconto · UTM source: fagner5 injetada no carrinho</p>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end pb-6">
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 px-8 text-sm font-semibold text-white gap-2.5 shadow-lg shadow-red-900/30"
                  style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626, #ef4444)" }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Gerando carrinho na VTEX...
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={16} />
                      Gerar Carrinho com FAGNER5
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
