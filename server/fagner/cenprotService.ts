// server/fagner/cenprotService.ts
// Consulta de protestos CENPROT — MOCK até credenciais disponíveis

export interface CenprotResult {
  cnpj: string;
  hasProtests: boolean;
  protestCount: number;
  totalValue: number;
  details: string;
  isMock: boolean;
}

/**
 * STUB / MOCK — Substitua pelo client real da API CENPROT quando as credenciais
 * estiverem disponíveis. Atualmente retorna sempre "sem protestos".
 */
export async function checkProtests(cnpjOrCpf: string): Promise<CenprotResult> {
  const digits = cnpjOrCpf.replace(/\D/g, "");

  console.log(`[CENPROT] MOCK — consultando ${digits} (sem credenciais reais)`);

  // Simula latência de rede
  await new Promise((r) => setTimeout(r, 300));

  return {
    cnpj: digits,
    hasProtests: false,
    protestCount: 0,
    totalValue: 0,
    details: "Nenhum protesto encontrado (resultado simulado — API CENPROT não configurada).",
    isMock: true,
  };
}

/**
 * Quando credenciais estiverem disponíveis, implemente aqui:
 *
 * export async function checkProtests(cnpjOrCpf: string): Promise<CenprotResult> {
 *   const res = await fetch(`https://api.cenprot.org.br/v1/consulta/${digits}`, {
 *     headers: { Authorization: `Bearer ${process.env.CENPROT_API_KEY}` },
 *   });
 *   const data = await res.json();
 *   return normalize(data);
 * }
 */
