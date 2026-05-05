/**
 * server/livechat/vtexCheckoutService.ts
 *
 * Serviço de criação de carrinho (orderForm) na VTEX para pedidos via Fagner.
 * Monta o carrinho completo com produto, dados do cliente (CPF ou CNPJ) e
 * endereço de entrega, retornando um link de checkout pré-preenchido.
 *
 * Fluxo:
 *   buildCart(orderData) →
 *     1. lookupCep          — endereço completo via ViaCEP
 *     2. createOrderForm    — cria cart vazio
 *     3. addItem            — adiciona produto pelo skuId
 *     4. setClientProfile   — preenche CPF ou CNPJ do cliente
 *     5. setShippingAddress — preenche endereço de entrega
 *     6. selectShipping     — usa simulação existente, seleciona melhor frete
 *   ← { orderFormId, checkoutLink, total, freteInfo }
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const VTEX_ACCOUNT  = process.env.VTEX_ACCOUNT_NAME || "tecfag";
const VTEX_API_BASE = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;
const VTEX_STORE_URL = "https://www.tecfag.com.br";

function vtexHeaders(): Record<string, string> {
  return {
    "Content-Type":        "application/json",
    "Accept":              "application/json",
    "X-VTEX-API-AppKey":   process.env.VTEX_APP_KEY   || "",
    "X-VTEX-API-AppToken": process.env.VTEX_APP_TOKEN  || "",
  };
}

/**
 * Headers para a Checkout PUBLIC API — sem credenciais de admin.
 * A VTEX Checkout /pub/ não aceita AppKey/Token e pode rejeitar autenticadas.
 * Usadas em: createOrderForm, addItem, setClientProfile, setShippingAddress, applyCoupon.
 */
function vtexPublicHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };
}

// ─── Tipos Públicos ───────────────────────────────────────────────────────────

export interface OrderDataPF {
  tipo:          "cpf";
  skuId:         string;
  quantidade:    number;
  produto:       string;
  preco:         number;           // centavos
  firstName:     string;
  lastName:      string;
  cpf:           string;
  email:         string;
  telefone:      string;
  cep:           string;
  addressNumber: string;
  complement?:   string;
  couponCode?:   string;           // código do cupom a aplicar (ex: FAGNER5)
}

export interface OrderDataPJ {
  tipo:              "cnpj";
  skuId:             string;
  quantidade:        number;
  produto:           string;
  preco:             number;         // centavos
  corporateName:     string;         // Razão Social
  tradeName?:        string;         // Nome Fantasia
  cnpj:              string;
  stateInscription:  string;         // número ou "ISENTO"
  responsavel:       string;         // nome do responsável
  email:             string;
  telefone:          string;
  cep:               string;
  addressNumber:     string;
  complement?:       string;
  couponCode?:       string;         // código do cupom a aplicar (ex: FAGNER5)
}

export type VtexOrderData = OrderDataPF | OrderDataPJ;

export interface BuildCartResult {
  orderFormId:   string;
  checkoutLink:  string;
  total:         string;            // preço formatado "R$ X.XXX,00"
  couponApplied: boolean;           // true se o cupom foi aplicado com sucesso
  freteInfo: {
    carrier:      string;
    deliveryDays: number;
    priceFormatted: string;
  };
}

// ─── CepResult ────────────────────────────────────────────────────────────────

interface CepResult {
  logradouro: string;
  bairro:     string;
  localidade: string;
  uf:         string;
}

// ─── Funções internas ─────────────────────────────────────────────────────────

/** Consulta ViaCEP — endereço completo pelo CEP */
async function lookupCep(cep: string): Promise<CepResult> {
  const clean = cep.replace(/\D/g, "");
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`ViaCEP HTTP ${res.status} para CEP ${clean}`);
  const data = await res.json() as any;
  if (data.erro) throw new Error(`CEP ${clean} não encontrado`);
  return {
    logradouro: data.logradouro || "",
    bairro:     data.bairro     || "",
    localidade: data.localidade || "",
    uf:         data.uf         || "",
  };
}

/** Cria orderForm vazio na VTEX e retorna o orderFormId */
async function createOrderForm(): Promise<string> {
  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForm`;
  const res = await fetch(url, {
    method: "POST",
    headers: vtexPublicHeaders(),  // Checkout PUBLIC API: sem credenciais admin
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`createOrderForm HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  const id: string = data.orderFormId;
  if (!id) throw new Error("createOrderForm: orderFormId ausente na resposta");
  console.log(`[VTEX Checkout] 🛒 OrderForm criado: ${id}`);
  return id;
}

/** Adiciona produto ao carrinho */
async function addItem(orderFormId: string, skuId: string, qty: number): Promise<void> {
  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForm/${orderFormId}/items`;
  const res = await fetch(url, {
    method:  "POST",
    headers: vtexPublicHeaders(),   // PUBLIC API
    body: JSON.stringify({
      orderItems: [{ id: skuId, quantity: qty, seller: "1" }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`addItem HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  console.log(`[VTEX Checkout] ✅ Item adicionado: SKU ${skuId} x${qty}`);
}

/** Preenche o perfil do cliente no orderForm (CPF ou CNPJ) */
async function setClientProfile(orderFormId: string, data: VtexOrderData): Promise<void> {
  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForm/${orderFormId}/attachments/clientProfileData`;

  let payload: Record<string, any>;

  if (data.tipo === "cpf") {
    payload = {
      email:        data.email,
      firstName:    data.firstName,
      lastName:     data.lastName,
      document:     data.cpf.replace(/\D/g, ""),
      documentType: "cpf",
      phone:        data.telefone.replace(/\D/g, ""),
      isCorporate:  false,
    };
  } else {
    // CNPJ — separa nome do responsável em firstName/lastName
    const [first, ...rest] = data.responsavel.trim().split(" ");
    payload = {
      email:             data.email,
      firstName:         first || data.responsavel,
      lastName:          rest.join(" ") || "",
      document:          data.cnpj.replace(/\D/g, ""),
      documentType:      "cnpj",
      phone:             data.telefone.replace(/\D/g, ""),
      isCorporate:       true,
      corporateName:     data.corporateName,
      tradeName:         data.tradeName || data.corporateName,
      corporateDocument: data.cnpj.replace(/\D/g, ""),
      stateInscription:  data.stateInscription || "ISENTO",
    };
  }

  const res = await fetch(url, {
    method:  "POST",
    headers: vtexPublicHeaders(),   // PUBLIC API
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`setClientProfile HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  console.log(`[VTEX Checkout] ✅ Perfil cliente definido (${data.tipo.toUpperCase()})`);
}

/** Preenche o endereço de entrega no orderForm */
async function setShippingAddress(
  orderFormId: string,
  data: VtexOrderData,
  cepData: CepResult
): Promise<void> {
  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForm/${orderFormId}/attachments/shippingData`;

  const payload = {
    address: {
      addressType:    "residential",
      receiverName:   data.tipo === "cpf"
        ? `${data.firstName} ${data.lastName}`.trim()
        : data.responsavel,
      postalCode:     data.cep.replace(/\D/g, ""),
      country:        "BRA",
      state:          cepData.uf,
      city:           cepData.localidade,
      neighborhood:   cepData.bairro,
      street:         cepData.logradouro,
      number:         data.addressNumber,
      complement:     data.complement || "",
    },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: vtexPublicHeaders(),   // PUBLIC API
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`setShippingAddress HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  console.log(`[VTEX Checkout] ✅ Endereço definido: CEP ${data.cep}, nº ${data.addressNumber}`);
}

/** Simula frete e seleciona a melhor opção (mais barata com prazo ≤ 15 dias) */
async function selectBestShipping(
  skuId: string,
  cep: string,
  qty: number
): Promise<{ carrier: string; deliveryDays: number; priceFormatted: string }> {
  // Reutiliza a simulation sem chaves de API para obter preços como cliente comum
  const cleanCep = cep.replace(/\D/g, "");
  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForms/simulation`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
      ...vtexHeaders(),
    },
    body: JSON.stringify({
      items:      [{ id: skuId, quantity: qty, seller: "1" }],
      postalCode: cleanCep,
      country:    "BRA",
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.warn(`[VTEX Checkout] Simulação frete HTTP ${res.status} — usando sem frete`);
    return { carrier: "A combinar", deliveryDays: 0, priceFormatted: "A combinar" };
  }

  const data = await res.json() as any;
  const slas: any[] = data?.logisticsInfo?.[0]?.slas ?? [];

  // Filtra opções com preço definido, ordena por preço
  const options = slas
    .filter((s: any) => s.price !== undefined && s.price >= 0)
    .map((s: any) => ({
      carrier:        s.name || s.id || "Transportadora",
      deliveryDays:   s.shippingEstimate
        ? parseInt(s.shippingEstimate.replace(/\D/g, ""), 10) || 0
        : 0,
      price:          (s.price ?? 0) / 100,
      priceFormatted: ((s.price ?? 0) / 100).toLocaleString("pt-BR", {
        style: "currency", currency: "BRL",
      }),
    }))
    .sort((a, b) => a.price - b.price);

  // Seleciona a mais barata com prazo razoável (≤ 15 dias úteis)
  const best = options.find(o => o.deliveryDays <= 15 && o.price > 0)
    ?? options[0]
    ?? { carrier: "A combinar", deliveryDays: 0, priceFormatted: "A combinar" };

  console.log(`[VTEX Checkout] ✅ Frete selecionado: ${best.carrier} — ${best.priceFormatted} (${best.deliveryDays} dias úteis)`);
  return { carrier: best.carrier, deliveryDays: best.deliveryDays, priceFormatted: best.priceFormatted };
}

/** Formata preço a partir de centavos */
function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Aplica cupom de desconto ao carrinho VTEX.
 * @returns true se aplicado com sucesso, false em caso de erro (não bloqueia o fluxo)
 */
async function applyCoupon(orderFormId: string, couponCode: string): Promise<boolean> {
  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForm/${orderFormId}/coupons`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: vtexPublicHeaders(),
      body:    JSON.stringify({ text: couponCode }),
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[VTEX Checkout] ⚠️ Cupom ${couponCode} não aplicado (HTTP ${res.status}): ${body.slice(0, 200)}`);
      return false;
    }
    console.log(`[VTEX Checkout] 🎫 Cupom ${couponCode} aplicado com sucesso!`);
    return true;
  } catch (err: any) {
    console.warn(`[VTEX Checkout] ⚠️ Falha ao aplicar cupom ${couponCode}:`, err.message);
    return false;
  }
}

// ─── Função Principal ─────────────────────────────────────────────────────────

/**
 * Monta o carrinho VTEX completo e retorna o link de checkout pré-preenchido.
 * Chamada pelo handler [VTEX_ORDER_DADOS] no livechatWs.ts.
 */
export async function buildCart(orderData: VtexOrderData): Promise<BuildCartResult> {
  const { skuId, quantidade, preco } = orderData;

  // 1. Lookup de endereço pelo CEP
  console.log(`[VTEX Checkout] 🔎 Buscando CEP ${orderData.cep}...`);
  const cepData = await lookupCep(orderData.cep);

  // 2. Cria cart vazio
  const orderFormId = await createOrderForm();

  // 3. Adiciona produto (delay entre requisições — VTEX exige sequencial)
  await new Promise(r => setTimeout(r, 300));
  await addItem(orderFormId, skuId, quantidade);

  // 4. Define perfil do cliente
  await new Promise(r => setTimeout(r, 300));
  await setClientProfile(orderFormId, orderData);

  // 5. Define endereço de entrega
  await new Promise(r => setTimeout(r, 300));
  await setShippingAddress(orderFormId, orderData, cepData);

  // 6. Seleciona melhor frete
  await new Promise(r => setTimeout(r, 300));
  const freteInfo = await selectBestShipping(skuId, orderData.cep, quantidade);

  // 7. Aplica cupom se fornecido (não-bloqueante — falha não impede o checkout)
  let couponApplied = false;
  const couponCode = (orderData as any).couponCode as string | undefined;
  if (couponCode) {
    await new Promise(r => setTimeout(r, 300));
    couponApplied = await applyCoupon(orderFormId, couponCode);
  }

  // 8. Monta result
  const checkoutLink = `${VTEX_STORE_URL}/checkout/#/orderform/${orderFormId}`;
  const total = formatPrice(preco * quantidade);

  console.log(`[VTEX Checkout] 🎉 Cart completo! Link: ${checkoutLink}`);

  return { orderFormId, checkoutLink, total, couponApplied, freteInfo };
}
