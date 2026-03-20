// server/fagner/cnpjService.ts
// Detecção multi-camada, validação matemática e consulta à Receita Federal
// CPF detection + CNPJ detection, validation and lookup

export interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  situacao?: string;
  porte?: string;
  natureza_juridica?: string;
  capital_social?: number | string;
  simples?: boolean | null;
  mei?: boolean | null;
  cnae_principal?: { codigo: string; descricao: string };
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  socios?: { nome: string; qualificacao: string }[];
  raw?: Record<string, any>;
}

// ─── Rate-limit ───────────────────────────────────────────────────────────────

let lastCnpjCallAt = 0;
const CNPJ_COOLDOWN_MS = 6_000; // 6 segundos entre chamadas

async function respectRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCnpjCallAt;
  if (elapsed < CNPJ_COOLDOWN_MS) {
    await sleep(CNPJ_COOLDOWN_MS - elapsed);
  }
  lastCnpjCallAt = Date.now();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Detecção de CPF ──────────────────────────────────────────────────────────

const CPF_REGEX = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;

export function detectCpf(text: string): string | null {
  const cleaned = text.replace(/\s+/g, " ");
  const match = CPF_REGEX.exec(cleaned);
  CPF_REGEX.lastIndex = 0;
  if (!match) return null;
  return match[1].replace(/\D/g, "");
}

// ─── Detecção de CNPJ ────────────────────────────────────────────────────────

const CNPJ_PATTERNS = [
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,              // XX.XXX.XXX/XXXX-XX
  /\bcnpj[:\s]*(\d{14})\b/gi,                             // "cnpj 12345678000195"
  /\b(\d{14})\b/g,                                        // 14 dígitos contíguos
];

export function detectCnpj(text: string): string | null {
  for (const pattern of CNPJ_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const raw = match[1] ?? match[0];
      const digits = raw.replace(/\D/g, "");
      if (digits.length === 14 && validateCnpjMath(digits)) {
        return digits;
      }
    }
  }
  return null;
}

// ─── Validação matemática do CNPJ (módulo 11) ────────────────────────────────

export function validateCnpjMath(digits: string): boolean {
  if (digits.length !== 14) return false;
  // Rejeita sequências repetidas (ex: 00000000000000)
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (d: string, factors: number[]): number => {
    let sum = 0;
    for (let i = 0; i < factors.length; i++) {
      sum += parseInt(d[i]) * factors[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const f1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const f2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(digits, f1);
  const d2 = calc(digits, f2);

  return d1 === parseInt(digits[12]) && d2 === parseInt(digits[13]);
}

// ─── Normalização de dados da Receita Federal ─────────────────────────────────

function normalizeBrasilApi(data: any): CnpjData {
  return {
    cnpj: data.cnpj?.replace(/\D/g, "") ?? "",
    razao_social: data.razao_social ?? data.nome ?? "",
    nome_fantasia: data.nome_fantasia ?? "",
    situacao: data.descricao_situacao_cadastral ?? data.situacao ?? "",
    porte: data.descricao_porte ?? data.porte ?? "",
    natureza_juridica: data.descricao_natureza_juridica ?? data.natureza_juridica ?? "",
    capital_social: data.capital_social,
    simples: data.opcao_pelo_simples,
    mei: data.opcao_pelo_mei,
    cnae_principal: data.cnae_fiscal_descricao
      ? { codigo: String(data.cnae_fiscal ?? ""), descricao: data.cnae_fiscal_descricao }
      : undefined,
    logradouro: data.logradouro,
    numero: data.numero,
    complemento: data.complemento,
    bairro: data.bairro,
    municipio: data.municipio,
    uf: data.uf,
    cep: data.cep?.replace(/\D/g, ""),
    telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1}) ${data.telefone_1}` : undefined,
    email: data.email,
    socios: data.qsa?.map((s: any) => ({ nome: s.nome_socio ?? s.nome, qualificacao: s.qualificacao_socio })) ?? [],
    raw: data,
  };
}

function normalizeCnpjWs(data: any): CnpjData {
  return {
    cnpj: data.estabelecimento?.cnpj?.replace(/\D/g, "") ?? data.cnpj?.replace(/\D/g, "") ?? "",
    razao_social: data.razao_social ?? "",
    nome_fantasia: data.estabelecimento?.nome_fantasia ?? data.nome_fantasia ?? "",
    situacao: data.estabelecimento?.situacao_cadastral ?? "",
    porte: data.porte?.descricao ?? "",
    natureza_juridica: data.natureza_juridica?.descricao ?? "",
    capital_social: data.capital_social,
    simples: data.simples?.optante,
    mei: data.simples?.mei,
    cnae_principal: data.estabelecimento?.atividade_principal
      ? {
          codigo: data.estabelecimento.atividade_principal.subclasse,
          descricao: data.estabelecimento.atividade_principal.descricao,
        }
      : undefined,
    logradouro: data.estabelecimento?.logradouro,
    numero: data.estabelecimento?.numero,
    complemento: data.estabelecimento?.complemento,
    bairro: data.estabelecimento?.bairro,
    municipio: data.estabelecimento?.cidade?.nome,
    uf: data.estabelecimento?.estado?.sigla,
    cep: data.estabelecimento?.cep?.replace(/\D/g, ""),
    telefone: data.estabelecimento?.telefone1,
    email: data.estabelecimento?.email,
    socios: data.socios?.map((s: any) => ({ nome: s.nome, qualificacao: s.qualificacao?.descricao ?? "" })) ?? [],
    raw: data,
  };
}

// ─── Consulta à Receita Federal ───────────────────────────────────────────────

export async function lookupCnpj(cnpj: string): Promise<CnpjData | null> {
  await respectRateLimit();

  const digits = cnpj.replace(/\D/g, "");

  // Tentativa 1: BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      return normalizeBrasilApi(data);
    }
  } catch (e) {
    console.warn("[CNPJ] BrasilAPI falhou, tentando fallback...", e);
  }

  // Tentativa 2: publica.cnpj.ws
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      return normalizeCnpjWs(data);
    }
  } catch (e) {
    console.warn("[CNPJ] publica.cnpj.ws falhou:", e);
  }

  return null;
}

// ─── Formatter para uso no system prompt ─────────────────────────────────────

export function formatCnpjDataForPrompt(data: CnpjData): string {
  const lines = [
    `Razão Social: ${data.razao_social}`,
    data.nome_fantasia ? `Nome Fantasia: ${data.nome_fantasia}` : null,
    data.situacao ? `Situação: ${data.situacao}` : null,
    data.porte ? `Porte: ${data.porte}` : null,
    data.natureza_juridica ? `Natureza Jurídica: ${data.natureza_juridica}` : null,
    data.capital_social !== undefined ? `Capital Social: R$ ${Number(data.capital_social).toLocaleString("pt-BR")}` : null,
    data.simples !== null && data.simples !== undefined ? `Simples Nacional: ${data.simples ? "Sim" : "Não"}` : null,
    data.mei !== null && data.mei !== undefined ? `MEI: ${data.mei ? "Sim" : "Não"}` : null,
    data.cnae_principal ? `CNAE: ${data.cnae_principal.codigo} — ${data.cnae_principal.descricao}` : null,
    [data.logradouro, data.numero, data.bairro, data.municipio, data.uf, data.cep].filter(Boolean).join(", ") || null,
    data.telefone ? `Telefone empresa: ${data.telefone}` : null,
    data.email ? `E-mail empresa: ${data.email}` : null,
    data.socios && data.socios.length > 0 ? `Sócios: ${data.socios.map((s) => s.nome).join(", ")}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}
