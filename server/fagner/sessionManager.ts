// server/fagner/sessionManager.ts
// Gerenciamento de sessões isoladas por contato (in-memory)

import { v4 as uuidv4 } from "uuid";
import { pickMood } from "./systemPrompt.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FlowType = 1 | 2 | 3 | 4 | 5 | null;
export type SubFlowType =
  | "PECAS" | "MAQUINAS" | "PERSONNALITE"    // Fluxo 1
  | "2A_BOLETO" | "2B_NF" | "2C_OUTROS"     // Fluxo 2
  | "3_AT"                                   // Fluxo 3
  | "4A_RASTREAR" | "4B_NF"                 // Fluxo 4
  | "5A_CLIENTE" | "5B_CURRICULO"           // Fluxo 5
  | null;

export interface MediaRecord {
  type: "audio" | "image";
  url?: string;
  transcription?: string;
  analysis?: string;
  detectedCnpj?: string;
  detectedProduct?: string;
}

export interface FlowData {
  // Dados gerais
  clientName?: string;
  clientPhone?: string;
  clientCnpj?: string;
  clientCpf?: string;
  companyName?: string;
  // Fluxo 1
  isNewClient?: boolean;
  productType?: string;
  productCategory?: string;
  productProcess?: string;
  productVolume?: string;
  // Fluxo 2
  boletoData?: string;
  nfData?: string;
  // Fluxo 3
  problemDescription?: string;
  machineSerialPhoto?: string;
  supportType?: "remote" | "onsite" | "doubt";
  // Fluxo 4
  orderNumber?: string;
  // Crédito (Fluxo 1)
  creditEligible?: boolean;
  hasProtests?: boolean;
  paymentMode?: "normal" | "avista";
  // Extra
  notes?: string;
  interestLevel?: "Quente" | "Morno" | "Frio";
}

export interface ContactSession {
  contactId: string;
  sessionDbId: string;
  chatSession: any;           // instância Gemini startChat
  contactPhone: string | null;
  cnpjApiData: Record<string, any> | null;
  validatedCnpjs: Set<string>;
  sessionMood: string;
  messageHistory: string[];   // últimas 30 mensagens do cliente
  isFirstMessage: boolean;
  isProcessing: boolean;      // mutex anti-duplo
  followUpCount: number;
  isPaused: boolean;
  isCompleted: boolean;
  lastMessageAt: Date;
  followUpSentAt: Date | null;
  // Fluxo
  currentFlow: FlowType;
  currentSubFlow: SubFlowType;
  flowStep: number;           // etapa atual dentro do fluxo
  assignedOperator: string | null;
  flowData: FlowData;
  // Mídia
  mediaMemory: MediaRecord[];
  // Buffer / debounce
  messageBuffer: string[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  // Misc
  productNotes: string[];     // códigos/nomes de produto mencionados
  messageCount: number;       // total de mensagens recebidas
  createdAt: Date;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const sessions = new Map<string, ContactSession>();

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSession(contactId: string): ContactSession {
  const session: ContactSession = {
    contactId,
    sessionDbId: uuidv4(),
    chatSession: null,         // preenchido pelo geminiService ao inicializar
    contactPhone: null,
    cnpjApiData: null,
    validatedCnpjs: new Set(),
    sessionMood: pickMood(),
    messageHistory: [],
    isFirstMessage: true,
    isProcessing: false,
    followUpCount: 0,
    isPaused: false,
    isCompleted: false,
    lastMessageAt: new Date(),
    followUpSentAt: null,
    currentFlow: null,
    currentSubFlow: null,
    flowStep: 0,
    assignedOperator: null,
    flowData: {},
    mediaMemory: [],
    messageBuffer: [],
    debounceTimer: null,
    productNotes: [],
    messageCount: 0,
    createdAt: new Date(),
  };
  sessions.set(contactId, session);
  return session;
}

export function getSession(contactId: string): ContactSession | null {
  return sessions.get(contactId) ?? null;
}

export function getOrCreateSession(contactId: string): ContactSession {
  return getSession(contactId) ?? createSession(contactId);
}

export function deleteSession(contactId: string) {
  sessions.delete(contactId);
}

export function getAllSessions(): ContactSession[] {
  return Array.from(sessions.values());
}

export function getActiveSessions(): ContactSession[] {
  return Array.from(sessions.values()).filter((s) => !s.isCompleted);
}

// ─── Resumo da sessão (injetado ao detectar frustração) ───────────────────────

export function buildSessionSummary(session: ContactSession): string {
  const lines: string[] = [];
  const fd = session.flowData;

  if (fd.clientName) lines.push(`Nome do cliente: ${fd.clientName}`);
  if (fd.clientCnpj) lines.push(`CNPJ: ${fd.clientCnpj}`);
  if (fd.clientCpf) lines.push(`CPF: ${fd.clientCpf}`);
  if (fd.companyName) lines.push(`Empresa: ${fd.companyName}`);
  if (fd.clientPhone) lines.push(`Telefone: ${fd.clientPhone}`);
  if (session.currentFlow) lines.push(`Fluxo atual: ${session.currentFlow} (${session.currentSubFlow ?? "não definido"})`);
  if (fd.productType) lines.push(`Produto: ${fd.productType}`);
  if (fd.problemDescription) lines.push(`Problema relatado: ${fd.problemDescription}`);
  if (fd.orderNumber) lines.push(`Pedido: ${fd.orderNumber}`);
  if (fd.notes) lines.push(`Observações: ${fd.notes}`);
  if (session.productNotes.length > 0) lines.push(`Produtos/códigos mencionados: ${session.productNotes.join(", ")}`);

  return lines.length > 0
    ? lines.join("\n")
    : "Nenhuma informação coletada ainda.";
}

// ─── Atualização de histórico de mensagens ────────────────────────────────────

export function addToHistory(session: ContactSession, message: string) {
  session.messageHistory.push(message);
  if (session.messageHistory.length > 30) {
    session.messageHistory.shift();
  }
  session.lastMessageAt = new Date();
}

// ─── Serialização para dashboard ─────────────────────────────────────────────

export function serializeSession(session: ContactSession) {
  return {
    contactId: session.contactId,
    sessionDbId: session.sessionDbId,
    contactPhone: session.contactPhone,
    sessionMood: session.sessionMood,
    currentFlow: session.currentFlow,
    currentSubFlow: session.currentSubFlow,
    flowStep: session.flowStep,
    assignedOperator: session.assignedOperator,
    isProcessing: session.isProcessing,
    isPaused: session.isPaused,
    isCompleted: session.isCompleted,
    followUpCount: session.followUpCount,
    lastMessageAt: session.lastMessageAt,
    createdAt: session.createdAt,
    flowData: session.flowData,
    mediaMemoryCount: session.mediaMemory.length,
    productNotesCount: session.productNotes.length,
    hasCnpjData: !!session.cnpjApiData,
    messageCount: session.messageCount,
  };
}

// ─── Cleanup de sessões antigas ───────────────────────────────────────────────

export function cleanupOldSessions(maxAgeHours = 4) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let removed = 0;
  const toDelete: string[] = [];
  for (const [id, session] of Array.from(sessions.entries())) {
    if (session.lastMessageAt < cutoff && session.isCompleted) {
      toDelete.push(id);
    }
  }
  for (const id of toDelete) {
    sessions.delete(id);
    removed++;
  }
  return removed;
}

// Inicia limpeza periódica (a cada 30 minutos)
setInterval(() => {
  const removed = cleanupOldSessions(4);
  if (removed > 0) {
    console.log(`[Fagner] Cleanup: ${removed} sessões antigas removidas.`);
  }
}, 30 * 60 * 1000);
