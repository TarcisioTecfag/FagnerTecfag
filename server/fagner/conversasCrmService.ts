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
