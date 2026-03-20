// server/fagner/serasaService.ts
// Consulta de elegibilidade a crédito/parcelamento SERASA — MOCK até credenciais disponíveis

export interface SerasaResult {
  cnpjOrCpf: string;
  eligible: boolean;             // true = pode parcelar; false = apenas à vista
  score?: number;
  riskLevel?: "BAIXO" | "MEDIO" | "ALTO";
  recommendation?: string;
  isMock: boolean;
}

/**
 * STUB / MOCK — Substitua pelo client real da API SERASA Experian quando as credenciais
 * estiverem disponíveis. Atualmente retorna sempre "elegível para parcelamento".
 */
export async function checkCreditEligibility(cnpjOrCpf: string): Promise<SerasaResult> {
  const digits = cnpjOrCpf.replace(/\D/g, "");

  console.log(`[SERASA] MOCK — consultando ${digits} (sem credenciais reais)`);

  // Simula latência de rede
  await new Promise((r) => setTimeout(r, 300));

  return {
    cnpjOrCpf: digits,
    eligible: true,
    score: 800,
    riskLevel: "BAIXO",
    recommendation: "Cliente elegível para parcelamento conforme política comercial da Tecfag.",
    isMock: true,
  };
}

/**
 * Quando credenciais estiverem disponíveis:
 *
 * export async function checkCreditEligibility(cnpjOrCpf: string): Promise<SerasaResult> {
 *   const res = await fetch(`https://api.serasaexperian.com.br/credit-report/v1/${digits}`, {
 *     headers: { Authorization: `Bearer ${process.env.SERASA_API_KEY}` },
 *   });
 *   const data = await res.json();
 *   return { eligible: data.score >= THRESHOLD, score: data.score, ... };
 * }
 */
