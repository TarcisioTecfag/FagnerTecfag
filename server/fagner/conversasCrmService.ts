import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FcCard {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  cnpjCpf?: string;
  tipoEmpresa?: string;
  city?: string;
  segment?: string;
  channel: string;
  columnId: string;
  note?: string;
  aiStatus: string;
  progress: number;
  rdContactId?: string;
  rdDealId?: string;
  createdAt: string;
  updatedAt: string;
  funnel: Record<string, string>;
  score?: FcScore | null;
}

export interface FcScore {
  necessidade?: number | null;
  urgencia?: number | null;
  decisor?: number | null;
  engajamento?: number | null;
  avanco?: number | null;
  rating?: number | null;
  evaluatedAt?: string | null;
  evaluatedBy?: string | null;
}

export interface FcHistoryEvent {
  id: string;
  cardId: string;
  type: string;
  label: string;
  detail?: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  author: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcRating(resps: Record<string, number | null | undefined>): number {
  const vals = [resps.necessidade, resps.urgencia, resps.decisor, resps.engajamento, resps.avanco];
  const answered = vals.filter((v) => v != null && v >= 1 && v <= 5) as number[];
  if (answered.length < 5) return 0;
  const total = answered.reduce((a, b) => a + b, 0);
  return total <= 9 ? 1 : total <= 14 ? 2 : total <= 18 ? 3 : total <= 22 ? 4 : 5;
}

function rowToCard(row: any, funnelRows: any[] = [], scoreRow: any = null): FcCard {
  const funnel: Record<string, string> = {};
  for (const f of funnelRows) funnel[f.field_id] = f.value ?? "";
  return {
    id: row.id,
    name: row.name,
    company: row.company ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    cnpjCpf: row.cnpj_cpf ?? undefined,
    tipoEmpresa: row.tipo_empresa ?? undefined,
    city: row.city ?? undefined,
    segment: row.segment ?? undefined,
    channel: row.channel,
    columnId: row.column_id,
    note: row.note ?? undefined,
    aiStatus: row.ai_status,
    progress: row.progress,
    rdContactId: row.rd_contact_id ?? undefined,
    rdDealId: row.rd_deal_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    funnel,
    score: scoreRow
      ? {
          necessidade: scoreRow.necessidade,
          urgencia: scoreRow.urgencia,
          decisor: scoreRow.decisor,
          engajamento: scoreRow.engajamento,
          avanco: scoreRow.avanco,
          rating: scoreRow.rating,
          evaluatedAt: scoreRow.evaluated_at,
          evaluatedBy: scoreRow.evaluated_by,
        }
      : null,
  };
}

// ─── History helper ───────────────────────────────────────────────────────────

export async function addHistory(
  cardId: string,
  type: string,
  label: string,
  detail: string,
  author: string,
  extra?: { fieldName?: string; oldValue?: string; newValue?: string }
): Promise<void> {
  await pool.query(
    `INSERT INTO fc_history (id, card_id, type, label, detail, field_name, old_value, new_value, author)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      uuidv4(),
      cardId,
      type,
      label,
      detail,
      extra?.fieldName ?? null,
      extra?.oldValue ?? null,
      extra?.newValue ?? null,
      author,
    ]
  );
}

// ─── CRUD Cards ───────────────────────────────────────────────────────────────

export async function listCards(): Promise<FcCard[]> {
  const { rows: cards } = await pool.query(
    `SELECT * FROM fc_cards ORDER BY created_at DESC`
  );
  if (cards.length === 0) return [];

  const ids = cards.map((c: any) => c.id);
  const { rows: funnels } = await pool.query(
    `SELECT * FROM fc_funnel_data WHERE card_id = ANY($1)`,
    [ids]
  );
  const { rows: scores } = await pool.query(
    `SELECT * FROM fc_score WHERE card_id = ANY($1)`,
    [ids]
  );

  return cards.map((row: any) => {
    const funnelRows = funnels.filter((f: any) => f.card_id === row.id);
    const scoreRow = scores.find((s: any) => s.card_id === row.id) ?? null;
    return rowToCard(row, funnelRows, scoreRow);
  });
}

export async function getCard(id: string): Promise<FcCard | null> {
  const { rows } = await pool.query(`SELECT * FROM fc_cards WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const { rows: funnels } = await pool.query(
    `SELECT * FROM fc_funnel_data WHERE card_id = $1`,
    [id]
  );
  const { rows: scores } = await pool.query(
    `SELECT * FROM fc_score WHERE card_id = $1`,
    [id]
  );
  return rowToCard(rows[0], funnels, scores[0] ?? null);
}

export async function createCard(
  data: Partial<FcCard> & { name: string },
  author: string
): Promise<FcCard> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO fc_cards
      (id, name, company, phone, email, cnpj_cpf, tipo_empresa, city, segment,
       channel, column_id, note, ai_status, progress, rd_contact_id, rd_deal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      data.name,
      data.company ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.cnpjCpf ?? null,
      data.tipoEmpresa ?? null,
      data.city ?? null,
      data.segment ?? null,
      data.channel ?? "WhatsApp",
      data.columnId ?? "pos-venda",
      data.note ?? null,
      data.aiStatus ?? "analyzing",
      data.progress ?? 0,
      data.rdContactId ?? null,
      data.rdDealId ?? null,
    ]
  );
  await addHistory(id, "entry", "Card criado", `Criado por ${author}`, author);
  return (await getCard(id))!;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nome", company: "Empresa", phone: "Telefone", email: "E-mail",
  cnpjCpf: "CPF/CNPJ", tipoEmpresa: "Tipo de empresa", city: "Cidade",
  segment: "Segmento", channel: "Canal", note: "Observação",
  columnId: "Funil", aiStatus: "Status", progress: "Progresso",
};

export async function updateCard(
  id: string,
  data: Partial<FcCard>,
  author: string
): Promise<FcCard | null> {
  const existing = await getCard(id);
  if (!existing) return null;

  const colMap: Record<string, string> = {
    name: "name", company: "company", phone: "phone", email: "email",
    cnpjCpf: "cnpj_cpf", tipoEmpresa: "tipo_empresa", city: "city",
    segment: "segment", channel: "channel", columnId: "column_id",
    note: "note", aiStatus: "ai_status", progress: "progress",
    rdContactId: "rd_contact_id", rdDealId: "rd_deal_id",
  };

  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in data) {
      sets.push(`"${col}" = $${idx++}`);
      vals.push((data as any)[key] ?? null);
    }
  }
  if (sets.length === 0) return existing;

  sets.push(`updated_at = now()`);
  vals.push(id);
  await pool.query(
    `UPDATE fc_cards SET ${sets.join(", ")} WHERE id = $${idx}`,
    vals
  );

  // Registra cada campo alterado no histórico
  for (const [key] of Object.entries(colMap)) {
    if (!(key in data)) continue;
    const oldVal = String((existing as any)[key] ?? "");
    const newVal = String((data as any)[key] ?? "");
    if (oldVal === newVal) continue;

    const fieldLabel = FIELD_LABELS[key] ?? key;
    const isColumnMove = key === "columnId";
    await addHistory(
      id,
      isColumnMove ? "stage" : "edit",
      isColumnMove ? `Movido para ${newVal}` : `Campo editado: ${fieldLabel}`,
      isColumnMove
        ? `de "${oldVal}" → "${newVal}"`
        : `"${oldVal}" → "${newVal}"`,
      author,
      { fieldName: key, oldValue: oldVal, newValue: newVal }
    );
  }

  return await getCard(id);
}

export async function deleteCard(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM fc_cards WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ─── Funnel data ──────────────────────────────────────────────────────────────

export async function upsertFunnelField(
  cardId: string,
  fieldId: string,
  value: string,
  author: string
): Promise<void> {
  // Lê valor anterior para histórico
  const { rows } = await pool.query(
    `SELECT value FROM fc_funnel_data WHERE card_id=$1 AND field_id=$2`,
    [cardId, fieldId]
  );
  const oldValue = rows[0]?.value ?? "";

  await pool.query(
    `INSERT INTO fc_funnel_data (id, card_id, field_id, value, updated_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (card_id, field_id) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [uuidv4(), cardId, fieldId, value]
  );

  if (oldValue !== value) {
    await addHistory(
      cardId, "edit",
      `Funil editado: ${fieldId}`,
      `"${oldValue}" → "${value}"`,
      author,
      { fieldName: `funil.${fieldId}`, oldValue, newValue: value }
    );
  }
}

export async function upsertFunnelBatch(
  cardId: string,
  fields: Record<string, string>,
  author: string
): Promise<void> {
  for (const [fieldId, value] of Object.entries(fields)) {
    await upsertFunnelField(cardId, fieldId, value, author);
  }
}

// ─── Score ────────────────────────────────────────────────────────────────────

export async function upsertScore(
  cardId: string,
  resps: Record<string, number | null>,
  author: string
): Promise<FcScore> {
  const rating = calcRating(resps);

  await pool.query(
    `INSERT INTO fc_score (id, card_id, necessidade, urgencia, decisor, engajamento, avanco, rating, evaluated_at, evaluated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)
     ON CONFLICT (card_id) DO UPDATE SET
       necessidade=EXCLUDED.necessidade, urgencia=EXCLUDED.urgencia,
       decisor=EXCLUDED.decisor, engajamento=EXCLUDED.engajamento,
       avanco=EXCLUDED.avanco, rating=EXCLUDED.rating,
       evaluated_at=now(), evaluated_by=EXCLUDED.evaluated_by`,
    [
      uuidv4(), cardId,
      resps.necessidade ?? null, resps.urgencia ?? null,
      resps.decisor ?? null, resps.engajamento ?? null,
      resps.avanco ?? null, rating, author,
    ]
  );

  await addHistory(
    cardId, "score",
    `Score atualizado — P${rating || "?"}`,
    `Necessidade:${resps.necessidade ?? "?"} Urgência:${resps.urgencia ?? "?"} Decisor:${resps.decisor ?? "?"} Engajamento:${resps.engajamento ?? "?"} Avanço:${resps.avanco ?? "?"}`,
    author
  );

  const { rows } = await pool.query(`SELECT * FROM fc_score WHERE card_id=$1`, [cardId]);
  const s = rows[0];
  return {
    necessidade: s.necessidade, urgencia: s.urgencia, decisor: s.decisor,
    engajamento: s.engajamento, avanco: s.avanco, rating: s.rating,
    evaluatedAt: s.evaluated_at, evaluatedBy: s.evaluated_by,
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function listHistory(cardId: string): Promise<FcHistoryEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM fc_history WHERE card_id=$1 ORDER BY created_at ASC`,
    [cardId]
  );
  return rows.map((r: any) => ({
    id: r.id,
    cardId: r.card_id,
    type: r.type,
    label: r.label,
    detail: r.detail ?? undefined,
    fieldName: r.field_name ?? undefined,
    oldValue: r.old_value ?? undefined,
    newValue: r.new_value ?? undefined,
    author: r.author,
    createdAt: r.created_at,
  }));
}

// ─── Seed demo data ───────────────────────────────────────────────────────────

interface SeedCard {
  name: string; company?: string; phone?: string; email?: string;
  cnpjCpf?: string; tipoEmpresa?: string; city?: string; segment?: string;
  channel: string; columnId: string; note: string;
  aiStatus: string; progress: number;
  funnel: Record<string, string>;
}

const DEMO_CARDS: SeedCard[] = [
  { name:"Cleber Sousa", channel:"WhatsApp", aiStatus:"done", progress:100, note:"Cliente recorrente, ticket aberto.", columnId:"pos-venda", phone:"+55 11 99201-4433", email:"cleber@sousa.com", city:"São Paulo – SP", segment:"Varejo",
    funnel:{motivo:"Pedido não entregue",pedido:"#4821",satisfacao:"2",resolucao:"Acionamento da transportadora",prazo:"2 horas",escalacao:"Não"} },
  { name:"Sandra Vilela", channel:"Instagram", aiStatus:"analyzing", progress:62, note:"Pesquisa de satisfação enviada.", columnId:"pos-venda", phone:"+55 21 98877-2211", email:"sandra@vilela.net", city:"Rio de Janeiro – RJ", segment:"Serviços",
    funnel:{motivo:"Reclamação de prazo",pedido:"—",satisfacao:"3",resolucao:"Cupom de desconto 10%",prazo:"Imediato",escalacao:"Não"} },
  { name:"Tancio Andrade", channel:"WhatsApp", aiStatus:"done", progress:100, note:"Interessado em pastor industrial.", columnId:"maquinas", phone:"+55 31 97766-5500", email:"tancio@andrade.ind", city:"Belo Horizonte – MG", segment:"Indústria",
    funnel:{tipo:"Pastor industrial",modelo:"PI-Series 400",voltagem:"380V",quantidade:"1",aplicacao:"Linha de produção 80m",urgencia:"Alta"} },
  { name:"Marina Lopes", channel:"Site", aiStatus:"processing", progress:74, note:"Cotizando modelos de bancas.", columnId:"maquinas", phone:"+55 11 94433-8800", email:"marina@lopes.me", city:"Campinas – SP", segment:"Comércio",
    funnel:{tipo:"Banca dobrável",modelo:"BD-90",voltagem:"—",quantidade:"15",aplicacao:"Feiras ao ar livre",urgencia:"Média"} },
  { name:"Hugo Bastos", company:"Geraldo's HB", channel:"WhatsApp", aiStatus:"analyzing", progress:43, note:"Quer 2 unidades, NEC.", columnId:"maquinas", phone:"+55 11 96655-1122", email:"hugo@geraldoshb.com.br", city:"Guarulhos – SP", segment:"Indústria",
    funnel:{tipo:"NEC industrial",modelo:"NEC-5000",voltagem:"380V",quantidade:"2",aplicacao:"Uso industrial geral",urgencia:"Alta"} },
  { name:"Aline Ferras", company:"Doçaria Bem Done", channel:"Instagram", aiStatus:"done", progress:100, note:"Pedido de catálogo personalizado.", columnId:"personalite", phone:"+55 19 98811-3344", email:"aline@bemdone.com.br", city:"Ribeirão Preto – SP", segment:"Alimentação",
    funnel:{produto:"Catálogo para doçaria",estilo:"Colorido e aconchegante",orcamento:"R$ 890,00",prazo:"15 dias",briefing:"Sim",responsavel:"—"} },
  { name:"Estudio VárFice", channel:"Site", aiStatus:"processing", progress:78, note:"Busca de identidade visual.", columnId:"personalite", phone:"+55 11 95544-2233", email:"contato@varfice.com", city:"São Paulo – SP", segment:"Design",
    funnel:{produto:"Rebranding completo",estilo:"Luxury minimal — preto e dourado",orcamento:"A definir",prazo:"30 dias",briefing:"Parcial",responsavel:"Diretora de arte"} },
  { name:"Ricardo Mota", company:"Moto Atacado", channel:"Ligação", aiStatus:"done", progress:100, note:"Negociação de boleto em atraso.", columnId:"financeiro", phone:"+55 11 93322-7788", email:"ricardo@motoatacado.com", city:"Santo André – SP", segment:"Atacado",
    funnel:{valor:"R$ 3.420,00",vencimento:"05/05/2026",modalidade:"3x",aceite:"Sim",desconto:"—",novo_venc:"15/05 · 15/06 · 15/07"} },
  { name:"Otávio Nunes", company:"Virapipe CPA", channel:"Ligação", aiStatus:"analyzing", progress:54, note:"Parcelamento em 6x.", columnId:"financeiro", phone:"+55 11 97700-9988", email:"otavio@virapipe.com.br", city:"Osasco – SP", segment:"Construção",
    funnel:{valor:"R$ 8.700,00",vencimento:"Em aberto",modalidade:"6x",aceite:"Em análise",desconto:"—",novo_venc:"Aguardando aprovação"} },
  { name:"Juliana Reis", company:"Grupo 3", channel:"Site", aiStatus:"done", progress:100, note:"Reposição: faca rasadora 50cm.", columnId:"pecas", phone:"+55 11 96611-4422", email:"juliana@grupo3.ind", city:"Mauá – SP", segment:"Indústria",
    funnel:{referencia:"FR-500",quantidade:"1",urgencia:"Alta",compatibilidade:"Sim",estoque:"Disponível",prazo:"2 dias úteis"} },
  { name:"Felipe Câmara", company:"Macrobol Pro Vela", channel:"WhatsApp", aiStatus:"processing", progress:66, note:"Peças confirmadas.", columnId:"pecas", phone:"+55 41 98833-6677", email:"felipe@macrobol.com.br", city:"Curitiba – PR", segment:"Náutico",
    funnel:{referencia:"SB-22, cabo 6mm, manete Johnson",quantidade:"4 · 2 · 1",urgencia:"Crítica",compatibilidade:"Sim",estoque:"Verificado",prazo:"Expresso até 16/05"} },
  { name:"Patrícia Lemos", channel:"WhatsApp", aiStatus:"done", progress:100, note:"Suporte geral sobre marca.", columnId:"outros", phone:"+55 11 93355-8811", email:"patricia@lemos.adv", city:"São Paulo – SP", segment:"Jurídico",
    funnel:{categoria:"Interesse comercial",encaminham:"Equipe comercial",depto:"Comercial",prioridade:"Média",proxima:"Contato em 1 dia útil",obs:"Kit institucional enviado"} },
];

export async function seedDemoCards(): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*) FROM fc_cards`);
  const count = parseInt(rows[0].count, 10);
  if (count > 0) return 0; // já tem dados, não faz nada

  for (const demo of DEMO_CARDS) {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO fc_cards (id, name, company, phone, email, cnpj_cpf, tipo_empresa, city, segment, channel, column_id, note, ai_status, progress)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, demo.name, demo.company??null, demo.phone??null, demo.email??null, null, null, demo.city??null, demo.segment??null, demo.channel, demo.columnId, demo.note, demo.aiStatus, demo.progress]
    );
    // Funil
    for (const [fieldId, value] of Object.entries(demo.funnel)) {
      await pool.query(
        `INSERT INTO fc_funnel_data (id, card_id, field_id, value) VALUES ($1,$2,$3,$4)`,
        [uuidv4(), id, fieldId, value]
      );
    }
    // Histórico inicial
    await pool.query(
      `INSERT INTO fc_history (id, card_id, type, label, detail, author) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuidv4(), id, "entry", "Lead capturado via " + demo.channel, "Card de demonstração criado automaticamente", "Fagner"]
    );
  }
  console.log(`[FC] ✅ ${DEMO_CARDS.length} cards de demonstração inseridos`);
  return DEMO_CARDS.length;
}

