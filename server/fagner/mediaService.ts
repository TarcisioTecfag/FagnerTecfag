// server/fagner/mediaService.ts
// Download, transcrição de áudio e análise de imagens via Gemini multimodal

import { MediaRecord } from "./sessionManager.js";
import { detectCnpj } from "./cnpjService.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AudioAnalysis {
  transcription: string;
  sentiment: string;
  mainNeed: string;
  detectedCnpj?: string;
  detectedProduct?: string;
}

export interface ImageAnalysis {
  description: string;
  ocrText: string;
  imageType: string;
  detectedCnpj?: string;
  detectedProduct?: string;
  structuredData?: Record<string, any>;
}

// ─── Download de arquivo ──────────────────────────────────────────────────────

async function downloadAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Download falhou: ${res.status} ${url}`);

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return { base64, mimeType };
}

// ─── Transcrição de áudio ─────────────────────────────────────────────────────

export async function transcribeAudio(
  audioUrl: string,
  apiKey: string
): Promise<AudioAnalysis> {
  let base64: string;
  let mimeType: string;

  try {
    ({ base64, mimeType } = await downloadAsBase64(audioUrl));
  } catch (e) {
    console.error("[Media] Erro ao baixar áudio:", e);
    return { transcription: "(não foi possível baixar o áudio)", sentiment: "neutro", mainNeed: "" };
  }

  const prompt = `Você é um analista de atendimento ao cliente da Tecfag.
Analise este áudio enviado por um cliente e responda em JSON:
{
  "transcription": "<transcrição fiel do áudio>",
  "sentiment": "<positivo|neutro|negativo|frustrado>",
  "mainNeed": "<necessidade principal identificada>",
  "detectedCnpj": "<CNPJ detectado no áudio ou null>",
  "detectedProduct": "<produto/peça mencionado ou null>"
}
Responda APENAS o JSON, sem markdown.`;

  try {
    const model = "gemini-3.1-pro-preview";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    const data: any = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      transcription: parsed.transcription ?? "",
      sentiment: parsed.sentiment ?? "neutro",
      mainNeed: parsed.mainNeed ?? "",
      detectedCnpj: parsed.detectedCnpj ?? undefined,
      detectedProduct: parsed.detectedProduct ?? undefined,
    };
  } catch (e) {
    console.error("[Media] Erro na transcrição de áudio:", e);
    return { transcription: "(erro na transcrição)", sentiment: "neutro", mainNeed: "" };
  }
}

// ─── Análise de imagem ────────────────────────────────────────────────────────

export async function analyzeImage(
  imageUrl: string,
  apiKey: string
): Promise<ImageAnalysis> {
  let base64: string;
  let mimeType: string;

  try {
    ({ base64, mimeType } = await downloadAsBase64(imageUrl));
  } catch (e) {
    console.error("[Media] Erro ao baixar imagem:", e);
    return { description: "(não foi possível baixar a imagem)", ocrText: "", imageType: "desconhecido" };
  }

  const prompt = `Você é um analista de atendimento ao cliente da Tecfag.
Analise esta imagem enviada por um cliente e responda em JSON:
{
  "description": "<descrição clara da imagem>",
  "ocrText": "<todo texto legível encontrado na imagem>",
  "imageType": "<tipo da imagem: etiqueta_maquina|nota_fiscal|produto|documento|outra>",
  "detectedCnpj": "<CNPJ encontrado na imagem ou null>",
  "detectedProduct": "<código/nome de produto ou peça encontrado ou null>",
  "structuredData": {
    "<campo1>": "<valor1>"
  }
}
Se for etiqueta de máquina, extraia número de série, modelo e marca em structuredData.
Se for nota fiscal, extraia número da nota, data e valor em structuredData.
Responda APENAS o JSON, sem markdown.`;

  try {
    const model = "gemini-3.1-pro-preview";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    const data: any = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      description: parsed.description ?? "",
      ocrText: parsed.ocrText ?? "",
      imageType: parsed.imageType ?? "desconhecido",
      detectedCnpj: parsed.detectedCnpj ?? undefined,
      detectedProduct: parsed.detectedProduct ?? undefined,
      structuredData: parsed.structuredData ?? undefined,
    };
  } catch (e) {
    console.error("[Media] Erro na análise de imagem:", e);
    return { description: "(erro na análise)", ocrText: "", imageType: "desconhecido" };
  }
}

// ─── Formatadores para injeção no contexto do Gemini ─────────────────────────

export function formatAudioContext(analysis: AudioAnalysis): string {
  return `[ÁUDIO DO CLIENTE]
Transcrição: ${analysis.transcription}
Sentimento: ${analysis.sentiment}
Necessidade identificada: ${analysis.mainNeed}${analysis.detectedCnpj ? `\nCNPJ detectado: ${analysis.detectedCnpj}` : ""}${analysis.detectedProduct ? `\nProduto mencionado: ${analysis.detectedProduct}` : ""}`;
}

export function formatImageContext(analysis: ImageAnalysis): string {
  let ctx = `[IMAGEM DO CLIENTE — tipo: ${analysis.imageType}]
Descrição: ${analysis.description}`;
  if (analysis.ocrText) ctx += `\nTexto extraído (OCR): ${analysis.ocrText}`;
  if (analysis.detectedCnpj) ctx += `\nCNPJ detectado: ${analysis.detectedCnpj}`;
  if (analysis.detectedProduct) ctx += `\nProduto/código detectado: ${analysis.detectedProduct}`;
  if (analysis.structuredData && Object.keys(analysis.structuredData).length > 0) {
    ctx += `\nDados estruturados: ${JSON.stringify(analysis.structuredData)}`;
  }
  return ctx;
}

// ─── Criação de MediaRecord para salvar na sessão ─────────────────────────────

export function makeAudioRecord(url: string, analysis: AudioAnalysis): MediaRecord {
  return {
    type: "audio",
    url,
    transcription: analysis.transcription,
    analysis: `Sentimento: ${analysis.sentiment} | Necessidade: ${analysis.mainNeed}`,
    detectedCnpj: analysis.detectedCnpj,
    detectedProduct: analysis.detectedProduct,
  };
}

export function makeImageRecord(url: string, analysis: ImageAnalysis): MediaRecord {
  return {
    type: "image",
    url,
    analysis: `${analysis.imageType} | ${analysis.description}`,
    detectedCnpj: analysis.detectedCnpj,
    detectedProduct: analysis.detectedProduct,
  };
}
