import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ─── Brand ──────────────────────────────────────────────────────── */
const RED       = "#E5232A";
const RED_LIGHT = "rgba(229,35,42,0.08)";
const RED_BORDER= "rgba(229,35,42,0.2)";
const SK_MS     = 1600;

/* ─── Columns ────────────────────────────────────────────────────── */
const COLUMNS = [
  { id:"pos-venda",   label:"Pós Venda",   accent:"#E5232A", iconPath:"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id:"maquinas",    label:"Máquinas",    accent:"#2563eb", iconPath:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  { id:"personalite", label:"Personalite", accent:"#7c3aed", iconPath:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" },
  { id:"financeiro",  label:"Financeiro",  accent:"#059669", iconPath:"M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { id:"pecas",       label:"Peças",       accent:"#d97706", iconPath:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" },
  { id:"outros",      label:"Outros",      accent:"#64748b", iconPath:"M5 12h14M12 5l7 7-7 7" },
];

/* ─── Funnel fields per column ───────────────────────────────────── */
type FType = "text"|"select";
interface FField { id:string; label:string; type:FType; options?:string[]; }

const FUNNEL_FIELDS: Record<string, FField[]> = {
  "pos-venda": [
    {id:"motivo",    label:"Motivo do contato",    type:"text"},
    {id:"pedido",    label:"Nº do pedido",          type:"text"},
    {id:"satisfacao",label:"Satisfação (1–5)",      type:"select", options:["1","2","3","4","5"]},
    {id:"resolucao", label:"Resolução proposta",    type:"text"},
    {id:"prazo",     label:"Prazo de resolução",    type:"text"},
    {id:"escalacao", label:"Requer escalação?",     type:"select", options:["Sim","Não"]},
  ],
  "maquinas": [
    {id:"tipo",       label:"Tipo de máquina",      type:"text"},
    {id:"modelo",     label:"Modelo / referência",  type:"text"},
    {id:"voltagem",   label:"Voltagem",             type:"select", options:["110V","220V","380V","—"]},
    {id:"quantidade", label:"Quantidade",           type:"text"},
    {id:"aplicacao",  label:"Aplicação / uso",      type:"text"},
    {id:"urgencia",   label:"Urgência",             type:"select", options:["Baixa","Média","Alta"]},
  ],
  "personalite": [
    {id:"produto",     label:"Tipo de produto",     type:"text"},
    {id:"estilo",      label:"Estilo / referência", type:"text"},
    {id:"orcamento",   label:"Orçamento estimado",  type:"text"},
    {id:"prazo",       label:"Prazo desejado",      type:"text"},
    {id:"briefing",    label:"Briefing recebido?",  type:"select", options:["Sim","Não","Parcial"]},
    {id:"responsavel", label:"Responsável criativo",type:"text"},
  ],
  "financeiro": [
    {id:"valor",      label:"Valor em aberto",      type:"text"},
    {id:"vencimento", label:"Data de vencimento",   type:"text"},
    {id:"modalidade", label:"Modalidade",           type:"select", options:["À vista","2x","3x","6x","12x"]},
    {id:"aceite",     label:"Proposta aceita?",     type:"select", options:["Sim","Não","Em análise"]},
    {id:"desconto",   label:"Desconto aplicado",    type:"text"},
    {id:"novo_venc",  label:"Novo vencimento",      type:"text"},
  ],
  "pecas": [
    {id:"referencia",      label:"Referência da peça",      type:"text"},
    {id:"quantidade",      label:"Quantidade",              type:"text"},
    {id:"urgencia",        label:"Urgência",                type:"select", options:["Baixa","Média","Alta","Crítica"]},
    {id:"compatibilidade", label:"Compatibilidade verif.?", type:"select", options:["Sim","Não","Pendente"]},
    {id:"estoque",         label:"Estoque",                 type:"text"},
    {id:"prazo",           label:"Prazo de entrega",        type:"text"},
  ],
  "outros": [
    {id:"categoria",  label:"Categoria identificada",    type:"text"},
    {id:"encaminham", label:"Encaminhamento",            type:"text"},
    {id:"depto",      label:"Departamento responsável",  type:"text"},
    {id:"prioridade", label:"Prioridade",                type:"select", options:["Baixa","Média","Alta"]},
    {id:"proxima",    label:"Próxima ação",              type:"text"},
    {id:"obs",        label:"Observações",               type:"text"},
  ],
};

/* ─── Types ──────────────────────────────────────────────────────── */
type AIStatus = "analyzing"|"processing"|"done";
type Channel  = "WhatsApp"|"Site"|"Instagram"|"Ligação"|"E-mail";
interface WaMsg { from:"ai"|"client"; text:string; time:string; }
interface HistoryEvent {
  time:string; label:string; detail:string;
  type:"entry"|"ai"|"stage"|"action"|"done"|"pending";
}
interface ScoreAxis { id:string; label:string; color:string; questions:{id:string;label:string;options:string[]}[]; }
interface Card {
  id:string; name:string; company?:string; channel:Channel;
  aiStatus:AIStatus; progress:number; timeAgo:string; note:string; columnId:string;
  phone?:string; email?:string; cnpjCpf?:string; tipoEmpresa?:string; city?:string; segment?:string;
  conversation:WaMsg[];
  funnel: Record<string,string>;
  history: HistoryEvent[];
  scoreData?:{ respostas:Record<string,string>; temperatura:string; pontoTotal:number; engagementScore:number; intentScore:number; avaliadoEm?:string; };
}
interface FeedEvent { id:string; ts:string; icon:string; color:string; text:string; sub:string; }
interface Toast { id:string; name:string; company?:string; funnel:string; accent:string; ts:string; }
interface Filters { channels:string[]; statuses:string[]; segments:string[]; }

/* ─── Seed data ──────────────────────────────────────────────────── */
const SEED: Card[] = [
  { id:"c1", name:"Cleber Sousa", channel:"WhatsApp", aiStatus:"done", progress:100, timeAgo:"há 5 min", note:"Cliente recorrente, ticket aberto.", columnId:"pos-venda", phone:"+55 11 99201-4433", email:"cleber@sousa.com", city:"São Paulo – SP", segment:"Varejo",
    funnel:{motivo:"Pedido não entregue",pedido:"#4821",satisfacao:"2",resolucao:"Acionamento da transportadora",prazo:"2 horas",escalacao:"Não"},
    history:[
      {time:"09:12",type:"entry",   label:"Lead capturado via WhatsApp",     detail:"Mensagem recebida e roteada automaticamente para Pós Venda"},
      {time:"09:12",type:"ai",      label:"Fagner iniciou triagem",      detail:"Análise semântica da mensagem iniciada"},
      {time:"09:12",type:"stage",   label:"Entrou em Pós Venda",              detail:"Funil identificado: reclamação pós-compra"},
      {time:"09:13",type:"action",  label:"Pedido #4821 identificado",        detail:"IA cruzou dados com histórico de compras do cliente"},
      {time:"09:13",type:"action",  label:"Ticket #8834 aberto",              detail:"Transportadora acionada automaticamente pela IA"},
      {time:"09:14",type:"done",    label:"Triagem concluída",                detail:"Resolução encaminhada · prazo: 2 horas"},
    ],
    conversation:[{from:"client",text:"Oi, queria saber sobre o meu pedido #4821",time:"09:12"},{from:"ai",text:"Olá, Cleber! 👋 Identificamos seu pedido #4821 como *entregue* em 08/05. Posso te ajudar?",time:"09:12"},{from:"client",text:"Entregue? Não recebi nada aqui não",time:"09:13"},{from:"ai",text:"Peço desculpas! Vou abrir um ticket de suporte e acionar a transportadora. Atualização em até 2 horas. 🔔",time:"09:13"},{from:"client",text:"Ok, aguardo",time:"09:14"},{from:"ai",text:"Ticket #8834 aberto. Qualquer novidade te aviso. ✅",time:"09:14"}] },
  { id:"c2", name:"Sandra Vilela", channel:"Instagram", aiStatus:"analyzing", progress:62, timeAgo:"há 21 min", note:"Pesquisa de satisfação enviada.", columnId:"pos-venda", phone:"+55 21 98877-2211", email:"sandra@vilela.net", city:"Rio de Janeiro – RJ", segment:"Serviços",
    funnel:{motivo:"Reclamação de prazo",pedido:"—",satisfacao:"3",resolucao:"Cupom de desconto 10%",prazo:"Imediato",escalacao:"Não"},
    history:[
      {time:"08:51",type:"entry",   label:"Lead capturado via Instagram",     detail:"DM recebida e classificada como Pós Venda"},
      {time:"08:51",type:"ai",      label:"Fagner iniciou triagem",      detail:"Sentimento negativo detectado · prioridade média"},
      {time:"08:51",type:"stage",   label:"Entrou em Pós Venda",              detail:"Funil: insatisfação com prazo de entrega"},
      {time:"09:02",type:"action",  label:"Pesquisa de satisfação enviada",   detail:"NPS automático disparado pela IA"},
      {time:"09:09",type:"action",  label:"Cupom SANDRA10 gerado e enviado", detail:"Desconto 10% · validade 30 dias"},
      {time:"09:21",type:"pending", label:"Aguardando confirmação",           detail:"IA monitorando resposta do cliente"},
    ],
    conversation:[{from:"ai",text:"Oi Sandra! Como foi sua experiência com a última compra? 😊",time:"08:51"},{from:"client",text:"Foi boa, mas o prazo atrasou 2 dias",time:"09:02"},{from:"ai",text:"Lamentamos o atraso. Vou registrar seu feedback. Posso enviar cupom de 10%?",time:"09:02"},{from:"client",text:"Seria ótimo!",time:"09:08"},{from:"ai",text:"✅ Cupom *SANDRA10* enviado. Válido por 30 dias.",time:"09:09"}] },
  { id:"c3", name:"Tancio Andrade", channel:"WhatsApp", aiStatus:"done", progress:100, timeAgo:"há 14 min", note:"Interessado em pastor industrial.", columnId:"maquinas", phone:"+55 31 97766-5500", email:"tancio@andrade.ind", city:"Belo Horizonte – MG", segment:"Indústria",
    funnel:{tipo:"Pastor industrial",modelo:"PI-Series 400",voltagem:"380V",quantidade:"1",aplicacao:"Linha de produção 80m",urgencia:"Alta"},
    history:[
      {time:"08:58",type:"entry",   label:"Lead capturado via WhatsApp",     detail:"Mensagem roteada para funil Máquinas"},
      {time:"08:58",type:"ai",      label:"Fagner iniciou triagem",     detail:"Intenção de compra detectada · urgência alta"},
      {time:"08:58",type:"stage",   label:"Entrou em Máquinas",              detail:"Produto identificado: pastor industrial"},
      {time:"08:58",type:"action",  label:"Ficha técnica PI-Series 400 enviada", detail:"PDF enviado automaticamente via WhatsApp"},
      {time:"08:59",type:"action",  label:"Consultor Marcos notificado",     detail:"Alerta enviado para equipe comercial"},
      {time:"08:59",type:"done",    label:"Triagem concluída",               detail:"Lead qualificado · aguardando contato comercial"},
    ],
    conversation:[{from:"client",text:"Preciso de um pastor industrial para linha de produção de 80m",time:"08:58"},{from:"ai",text:"Para 80m recomendo o *PI-Series 400*. Envio a ficha técnica?",time:"08:58"},{from:"client",text:"Sim, manda",time:"08:59"},{from:"ai",text:"📎 Ficha técnica enviada. Consultor Marcos entra em contato hoje. ✅",time:"08:59"}] },
  { id:"c4", name:"Marina Lopes", channel:"Site", aiStatus:"processing", progress:74, timeAgo:"há 4 min", note:"Cotizando modelos de bancas.", columnId:"maquinas", phone:"+55 11 94433-8800", email:"marina@lopes.me", city:"Campinas – SP", segment:"Comércio",
    funnel:{tipo:"Banca dobrável",modelo:"BD-90",voltagem:"—",quantidade:"15",aplicacao:"Feiras ao ar livre",urgencia:"Média"},
    history:[
      {time:"09:18",type:"entry",   label:"Lead capturado via Site",         detail:"Chat ao vivo iniciado · roteado para Máquinas"},
      {time:"09:18",type:"ai",      label:"Fagner iniciou triagem",     detail:"Necessidade de cotação em lote identificada"},
      {time:"09:18",type:"stage",   label:"Entrou em Máquinas",              detail:"Produto: bancas dobráveis para feiras"},
      {time:"09:20",type:"action",  label:"Orçamento BD-90 (15 un.) gerado", detail:"R$ 4.305,00 com frete · PDF enviado"},
      {time:"09:21",type:"pending", label:"IA processando frete regional",   detail:"Cotando transportadoras para Campinas"},
    ],
    conversation:[{from:"client",text:"Quero cotar bancas dobráveis para feira",time:"09:18"},{from:"ai",text:"Temos *BD-60*, *BD-90* e *BD-120*. Para feiras, BD-90 é o mais vendido. Quantidade?",time:"09:18"},{from:"client",text:"15 unidades",time:"09:20"},{from:"ai",text:"15 un. BD-90: R$ 4.305,00 com frete. Gero orçamento?",time:"09:20"},{from:"client",text:"Pode gerar",time:"09:21"},{from:"ai",text:"⏳ PDF enviado para o seu e-mail em instantes.",time:"09:21"}] },
  { id:"c5", name:"Hugo Bastos", company:"Geraldo's HB", channel:"WhatsApp", aiStatus:"analyzing", progress:43, timeAgo:"há 5 min", note:"Quer 2 unidades, NEC.", columnId:"maquinas", phone:"+55 11 96655-1122", email:"hugo@geraldoshb.com.br", city:"Guarulhos – SP", segment:"Indústria",
    funnel:{tipo:"NEC industrial",modelo:"NEC-5000",voltagem:"380V",quantidade:"2",aplicacao:"Uso industrial geral",urgencia:"Alta"},
    history:[
      {time:"09:17",type:"entry",   label:"Lead capturado via WhatsApp",     detail:"Mensagem roteada para Máquinas · empresa identificada"},
      {time:"09:17",type:"ai",      label:"Fagner iniciou triagem",     detail:"Histórico do cliente carregado: 3 compras anteriores"},
      {time:"09:17",type:"stage",   label:"Entrou em Máquinas",              detail:"Interesse: NEC industrial trifásico"},
      {time:"09:19",type:"pending", label:"IA verificando disponibilidade",  detail:"Consultando estoque NEC-5000 380V · 2 unidades"},
    ],
    conversation:[{from:"client",text:"Bom dia, quero 2 unidades do NEC industrial",time:"09:17"},{from:"ai",text:"Bom dia! NEC-3000 ou NEC-5000? Tensão: 220V ou 380V?",time:"09:17"},{from:"client",text:"380V trifásico",time:"09:19"},{from:"ai",text:"NEC-5000 380V em estoque. Prazo 5 dias úteis. Verificando preço... ⏳",time:"09:19"}] },
  { id:"c6", name:"Aline Ferras", company:"Doçaria Bem Done", channel:"Instagram", aiStatus:"done", progress:100, timeAgo:"há 11 min", note:"Pedido de catálogo personalizado.", columnId:"personalite", phone:"+55 19 98811-3344", email:"aline@bemdone.com.br", city:"Ribeirão Preto – SP", segment:"Alimentação",
    funnel:{produto:"Catálogo para doçaria",estilo:"Colorido e aconchegante",orcamento:"R$ 890,00",prazo:"15 dias",briefing:"Sim",responsavel:"—"},
    history:[
      {time:"09:01",type:"entry",   label:"Lead capturado via Instagram",    detail:"Mensagem identificada como interesse em Personalite"},
      {time:"09:01",type:"ai",      label:"Fagner iniciou triagem",     detail:"Segmento alimentação · necessidade criativa"},
      {time:"09:01",type:"stage",   label:"Entrou em Personalite",           detail:"Produto: catálogo personalizado para doçaria"},
      {time:"09:03",type:"action",  label:"Combo Digital + A5 cotado",       detail:"R$ 890,00 (100 unidades) apresentado à cliente"},
      {time:"09:11",type:"action",  label:"Briefing enviado por e-mail",     detail:"Formulário criativo enviado automaticamente"},
      {time:"09:11",type:"done",    label:"Triagem concluída",               detail:"Designer notificado · retorno em 24h"},
    ],
    conversation:[{from:"client",text:"Olá! Quero um catálogo personalizado pra minha doceria",time:"09:01"},{from:"ai",text:"Temos: *Digital*, *Impresso A4* e *Impresso A5*. Qual prefere?",time:"09:01"},{from:"client",text:"Digital e impresso A5 juntos",time:"09:03"},{from:"ai",text:"Combo Digital + A5 (100 un): R$ 890,00. Envio o briefing?",time:"09:03"},{from:"client",text:"Sim",time:"09:11"},{from:"ai",text:"📋 Briefing enviado! Designer entra em contato em 24h. ✅",time:"09:11"}] },
  { id:"c7", name:"Estudio VárFice", channel:"Site", aiStatus:"processing", progress:78, timeAgo:"há 4 min", note:"Busca de identidade visual.", columnId:"personalite", phone:"+55 11 95544-2233", email:"contato@varfice.com", city:"São Paulo – SP", segment:"Design",
    funnel:{produto:"Rebranding completo",estilo:"Luxury minimal — preto e dourado",orcamento:"A definir",prazo:"30 dias",briefing:"Parcial",responsavel:"Diretora de arte"},
    history:[
      {time:"09:18",type:"entry",   label:"Lead capturado via Site",         detail:"Formulário de contato preenchido · interesse em branding"},
      {time:"09:18",type:"ai",      label:"Fagner iniciou triagem",     detail:"Empresa de design · ticket de alto valor detectado"},
      {time:"09:18",type:"stage",   label:"Entrou em Personalite",           detail:"Demanda: rebranding completo"},
      {time:"09:19",type:"action",  label:"Briefing parcial coletado",       detail:"Estilo: luxury minimal, preto e dourado"},
      {time:"09:20",type:"pending", label:"Agendando reunião com diretora",  detail:"IA buscando disponibilidade na agenda criativa"},
    ],
    conversation:[{from:"client",text:"Preciso de um rebranding completo para meu estúdio",time:"09:18"},{from:"ai",text:"Rebranding inclui: logo, paleta, tipografia e manual. Referências de estilo?",time:"09:18"},{from:"client",text:"Minimalista, moderno, preto e dourado",time:"09:19"},{from:"ai",text:"Estilo *luxury minimal*. Agendando reunião com nossa diretora de arte. Disponibilidade?",time:"09:20"}] },
  { id:"c8", name:"Ricardo Mota", company:"Moto Atacado", channel:"Ligação", aiStatus:"done", progress:100, timeAgo:"há 8 min", note:"Negociação de boleto em atraso.", columnId:"financeiro", phone:"+55 11 93322-7788", email:"ricardo@motoatacado.com", city:"Santo André – SP", segment:"Atacado",
    funnel:{valor:"R$ 3.420,00",vencimento:"05/05/2026",modalidade:"3x",aceite:"Sim",desconto:"—",novo_venc:"15/05 · 15/06 · 15/07"},
    history:[
      {time:"09:04",type:"entry",   label:"Contato recebido via Ligação",    detail:"Chamada transcrita e roteada para Financeiro"},
      {time:"09:04",type:"ai",      label:"Fagner iniciou triagem",     detail:"Boleto em atraso detectado no ERP · R$ 3.420,00"},
      {time:"09:04",type:"stage",   label:"Entrou em Financeiro",            detail:"Negociação de inadimplência em curso"},
      {time:"09:06",type:"action",  label:"Proposta de parcelamento gerada", detail:"3x sem juros apresentado automaticamente"},
      {time:"09:07",type:"action",  label:"3 boletos gerados e enviados",    detail:"Vencimentos: 15/05 · 15/06 · 15/07"},
      {time:"09:07",type:"done",    label:"Triagem concluída",               detail:"Acordo aceito · inadimplência regularizada"},
    ],
    conversation:[{from:"ai",text:"Oi Ricardo, boleto de R$ 3.420,00 em aberto (venc. 05/05). Posso ajudar?",time:"09:04"},{from:"client",text:"Sim, posso parcelar?",time:"09:06"},{from:"ai",text:"3x sem juros: R$ 1.140,00/mês. Ou 1x com 5% desconto: R$ 3.249,00. Qual prefere?",time:"09:06"},{from:"client",text:"3x",time:"09:07"},{from:"ai",text:"✅ 3 boletos gerados e enviados. 👍",time:"09:07"}] },
  { id:"c9", name:"Otávio Nunes", company:"Virapipe CPA", channel:"Ligação", aiStatus:"analyzing", progress:54, timeAgo:"há 14 min", note:"Parcelamento em 6x.", columnId:"financeiro", phone:"+55 11 97700-9988", email:"otavio@virapipe.com.br", city:"Osasco – SP", segment:"Construção",
    funnel:{valor:"R$ 8.700,00",vencimento:"Em aberto",modalidade:"6x",aceite:"Em análise",desconto:"—",novo_venc:"Aguardando aprovação"},
    history:[
      {time:"08:58",type:"entry",   label:"Contato recebido via Ligação",    detail:"Chamada identificada: inadimplência R$ 8.700,00"},
      {time:"08:58",type:"ai",      label:"Fagner iniciou triagem",     detail:"Score de crédito consultado · análise de risco"},
      {time:"08:58",type:"stage",   label:"Entrou em Financeiro",            detail:"Negociação de alto valor em andamento"},
      {time:"09:04",type:"action",  label:"Proposta 6x enviada para aprovação", detail:"R$ 1.560,00/mês · 1,2% a.m. · total R$ 9.364,44"},
      {time:"09:21",type:"pending", label:"Aguardando aprovação gerencial",  detail:"Proposta em análise · prazo: amanhã 18h"},
    ],
    conversation:[{from:"ai",text:"Boa tarde Otávio! Fatura de R$ 8.700,00 em aberto. Posso ajudar com um acordo?",time:"08:58"},{from:"client",text:"Preciso de 6x, fluxo apertado",time:"09:04"},{from:"ai",text:"6x: R$ 1.560,00/mês (1,2% a.m.). Total: R$ 9.364,44. Encaminho para aprovação?",time:"09:04"},{from:"client",text:"Pode encaminhar",time:"09:08"},{from:"ai",text:"⏳ Proposta enviada. Retorno até amanhã 18h. 🔔",time:"09:09"}] },
  { id:"c10", name:"Juliana Reis", company:"Grupo 3", channel:"Site", aiStatus:"done", progress:100, timeAgo:"há 9 min", note:"Reposição: faca rasadora 50cm.", columnId:"pecas", phone:"+55 11 96611-4422", email:"juliana@grupo3.ind", city:"Mauá – SP", segment:"Indústria",
    funnel:{referencia:"FR-500",quantidade:"1",urgencia:"Alta",compatibilidade:"Sim",estoque:"Disponível",prazo:"2 dias úteis"},
    history:[
      {time:"09:03",type:"entry",   label:"Lead capturado via Site",         detail:"Solicitação de reposição urgente recebida"},
      {time:"09:03",type:"ai",      label:"Fagner iniciou triagem",     detail:"Peça identificada: faca rasadora 50cm · urgência alta"},
      {time:"09:03",type:"stage",   label:"Entrou em Peças",                 detail:"Estoque FR-500 verificado: disponível"},
      {time:"09:05",type:"action",  label:"Pedido #7291 gerado",             detail:"1x FR-500 · R$ 368,00 · boleto enviado"},
      {time:"09:05",type:"done",    label:"Triagem concluída",               detail:"Entrega programada para 14/05 · Mauá-SP"},
    ],
    conversation:[{from:"client",text:"Preciso de uma faca rasadora 50cm urgente",time:"09:03"},{from:"ai",text:"FR-500 disponível. R$ 340,00/un. Prazo 2 dias úteis para Mauá. Quantidade?",time:"09:03"},{from:"client",text:"1 unidade",time:"09:05"},{from:"ai",text:"✅ Pedido #7291: 1x FR-500 – R$ 368,00. Boleto enviado. Entrega 14/05. 📦",time:"09:05"}] },
  { id:"c11", name:"Felipe Câmara", company:"Macrobol Pro Vela", channel:"WhatsApp", aiStatus:"processing", progress:66, timeAgo:"há 16 min", note:"Peças confirmadas.", columnId:"pecas", phone:"+55 41 98833-6677", email:"felipe@macrobol.com.br", city:"Curitiba – PR", segment:"Náutico",
    funnel:{referencia:"SB-22, cabo 6mm, manete Johnson",quantidade:"4 · 2 · 1",urgencia:"Crítica",compatibilidade:"Sim",estoque:"Verificado",prazo:"Expresso até 16/05"},
    history:[
      {time:"08:56",type:"entry",   label:"Lead capturado via WhatsApp",     detail:"Confirmação de orçamento #3301 recebida"},
      {time:"08:56",type:"ai",      label:"Fagner iniciou triagem",     detail:"Orçamento anterior carregado · urgência crítica"},
      {time:"08:56",type:"stage",   label:"Entrou em Peças",                 detail:"3 itens náuticos · total R$ 1.870,00"},
      {time:"09:00",type:"action",  label:"Compatibilidade verificada",      detail:"SB-22, cabo 6mm e manete Johnson — todos compatíveis"},
      {time:"09:06",type:"action",  label:"Frete expresso cotado",           detail:"+R$ 87,00 · entrega até 16/05 em Curitiba"},
      {time:"09:06",type:"pending", label:"Aguardando confirmação do boleto", detail:"Total final: R$ 1.957,00"},
    ],
    conversation:[{from:"client",text:"Quero confirmar as peças do orçamento #3301",time:"08:56"},{from:"ai",text:"#3301: 4x SB-22, 2x cabo 6mm, 1x manete Johnson. Total R$ 1.870,00. Confirma?",time:"08:56"},{from:"client",text:"Confirma! Precisa até sexta",time:"09:00"},{from:"ai",text:"Verificando frete expresso para Curitiba até 16/05 ⏳",time:"09:00"},{from:"client",text:"Ok",time:"09:02"},{from:"ai",text:"✅ Frete expresso +R$ 87,00. Total R$ 1.957,00. Gero o boleto?",time:"09:06"}] },
  { id:"c12", name:"Patrícia Lemos", channel:"WhatsApp", aiStatus:"done", progress:100, timeAgo:"há 1 min", note:"Suporte geral sobre marca.", columnId:"outros", phone:"+55 11 93355-8811", email:"patricia@lemos.adv", city:"São Paulo – SP", segment:"Jurídico",
    funnel:{categoria:"Interesse comercial",encaminham:"Equipe comercial",depto:"Comercial",prioridade:"Média",proxima:"Contato em 1 dia útil",obs:"Kit institucional enviado"},
    history:[
      {time:"09:21",type:"entry",   label:"Lead capturado via WhatsApp",     detail:"Contato institucional recebido · não classificado"},
      {time:"09:21",type:"ai",      label:"Fagner iniciou triagem",     detail:"Interesse comercial detectado · segmento jurídico"},
      {time:"09:21",type:"stage",   label:"Entrou em Outros",                detail:"Funil: contato genérico sem produto definido"},
      {time:"09:22",type:"action",  label:"Kit institucional enviado",       detail:"Material PDF + apresentação enviados por e-mail"},
      {time:"09:22",type:"action",  label:"Lead encaminhado ao Comercial",   detail:"Alerta enviado para equipe · prioridade média"},
      {time:"09:22",type:"done",    label:"Triagem concluída",               detail:"Retorno comercial previsto em 1 dia útil"},
    ],
    conversation:[{from:"client",text:"Queria entender como funciona o sistema de vocês",time:"09:21"},{from:"ai",text:"Olá Patrícia! Nossa plataforma integra CRM + automação com IA. Demonstração ou material explicativo?",time:"09:21"},{from:"client",text:"Material por e-mail seria ótimo",time:"09:22"},{from:"ai",text:"✅ Kit institucional enviado! Comercial entra em contato em até 1 dia útil. 😊",time:"09:22"}] },
];

/* ─── Style maps ─────────────────────────────────────────────────── */
const CH_STYLE: Record<Channel,{bg:string;text:string;border:string}> = {
  WhatsApp: {bg:"#dcfce7",text:"#16a34a",border:"#bbf7d0"},
  Site:     {bg:"#dbeafe",text:"#1d4ed8",border:"#bfdbfe"},
  Instagram:{bg:"#fae8ff",text:"#9333ea",border:"#f5d0fe"},
  Ligação:  {bg:"#ffedd5",text:"#c2410c",border:"#fed7aa"},
  "E-mail": {bg:"#e0e7ff",text:"#4338ca",border:"#c7d2fe"},
};
const ST_CFG: Record<AIStatus,{label:string;color:string;bg:string;border:string}> = {
  analyzing: {label:"IA Analisando...",color:"#b45309",bg:"#fef3c7",border:"#fde68a"},
  processing:{label:"IA Processando", color:"#1d4ed8",bg:"#dbeafe",border:"#bfdbfe"},
  done:      {label:"Triagem concluída",color:"#15803d",bg:"#dcfce7",border:"#bbf7d0"},
};
const ST_LABEL: Record<AIStatus,string> = { analyzing:"Analisando", processing:"Processando", done:"Concluída" };
const SEG_COL: Record<string,{bg:string;text:string}> = {
  Varejo:{bg:"#ede9fe",text:"#6d28d9"},Serviços:{bg:"#e0f2fe",text:"#0369a1"},
  Indústria:{bg:"#fef9c3",text:"#854d0e"},Comércio:{bg:"#fce7f3",text:"#9d174d"},
  Alimentação:{bg:"#dcfce7",text:"#166534"},Design:{bg:"#f0fdf4",text:"#15803d"},
  Atacado:{bg:"#fff7ed",text:"#c2410c"},Construção:{bg:"#f1f5f9",text:"#475569"},
  Náutico:{bg:"#e0f2fe",text:"#0c4a6e"},Jurídico:{bg:"#fdf2f8",text:"#86198f"},
};
const ALL_CHANNELS = ["WhatsApp","Site","Instagram","Ligação","E-mail"] as const;
const ALL_STATUSES = ["analyzing","processing","done"] as const;
const ALL_SEGMENTS = ["Varejo","Serviços","Indústria","Comércio","Alimentação","Design","Atacado","Construção","Náutico","Jurídico"];

/* ─── Helpers ────────────────────────────────────────────────────── */
function initials(n:string){return n.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();}
function nowTime(){const d=new Date();return`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;}

/* ─── AnimNum ────────────────────────────────────────────────────── */
function AnimNum({value}:{value:number}){
  const [d,setD]=useState(0);const raf=useRef(0);
  useEffect(()=>{
    let s=d,e=value;if(s===e)return;
    const step=()=>{s+=(e-s)*0.18;if(Math.abs(e-s)<0.5){setD(e);return;}setD(Math.round(s));raf.current=requestAnimationFrame(step);};
    raf.current=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf.current);
  },[value]);
  return <>{d}</>;
}

/* ─── Skeleton ───────────────────────────────────────────────────── */
function Sk({w,h,r=6}:{w:string|number;h:number;r?:number}){
  return <div style={{width:w,height:h,borderRadius:r,background:"linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)",backgroundSize:"400% 100%",animation:"skShimmer 1.5s ease infinite"}}/>;
}
function SkCard(){
  return(
    <div style={{background:"#fff",border:"1.5px solid #f1f5f9",borderRadius:12,padding:"12px 13px",marginBottom:8}}>
      <div style={{display:"flex",gap:8,marginBottom:10}}><Sk w={30} h={30} r={8}/><div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}><Sk w="60%" h={10}/><Sk w="38%" h={8}/></div></div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}><Sk w="100%" h={9}/><Sk w="75%" h={9}/><Sk w={64} h={18} r={20}/><Sk w="100%" h={5} r={99}/><div style={{display:"flex",justifyContent:"space-between"}}><Sk w={92} h={18} r={20}/><Sk w={46} h={8}/></div></div>
    </div>
  );
}

/* ─── Atoms ──────────────────────────────────────────────────────── */
function ChannelTag({channel}:{channel:Channel}){
  const s=CH_STYLE[channel];
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:s.bg,color:s.text,border:`1px solid ${s.border}`}}>{channel}</span>;
}
function StatusBadge({status}:{status:AIStatus}){
  const s=ST_CFG[status];const spin=status!=="done";
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:s.bg,color:s.color,border:`1px solid ${s.border}`,transition:"all 0.3s"}}>
      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={spin?{animation:"spin 1.4s linear infinite"}:{}}>
        {status==="done"?<polyline points="20 6 9 17 4 12"/>:<path d="M21 12a9 9 0 1 1-6.219-8.56"/>}
      </svg>{s.label}
    </span>
  );
}
function ProgressBar({value,color,paused}:{value:number;color:string;paused?:boolean}){
  const pct=Math.min(100,Math.round(value));
  return(
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{flex:1,height:5,borderRadius:99,background:"#f1f5f9",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:paused?"#cbd5e1":color,borderRadius:99,transition:"width 1.4s cubic-bezier(0.4,0,0.2,1),background 0.3s"}}/>
      </div>
      <span style={{fontSize:10,color:"#94a3b8",minWidth:26,textAlign:"right"}}>{pct}%</span>
    </div>
  );
}

/* ─── Filter chip ────────────────────────────────────────────────── */
function FilterChip({label,color,onRemove}:{label:string;color:string;onRemove:()=>void}){
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px 3px 10px",borderRadius:20,fontSize:10,fontWeight:600,background:`${color}12`,color,border:`1px solid ${color}30`,animation:"chipIn 0.2s ease"}}>
      {label}
      <button onClick={onRemove} style={{width:14,height:14,borderRadius:"50%",border:"none",background:`${color}25`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,color}}>
        <svg width={7} height={7} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1={2} y1={2} x2={8} y2={8}/><line x1={8} y1={2} x2={2} y2={8}/></svg>
      </button>
    </span>
  );
}

/* ─── Filter panel ───────────────────────────────────────────────── */
function FilterPanel({filters,setFilters,onClose}:{filters:Filters;setFilters:(f:Filters)=>void;onClose:()=>void}){
  function tog<T extends string>(arr:T[],v:T):T[]{return arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];}
  const n=filters.channels.length+filters.statuses.length+filters.segments.length;
  return(
    <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:340,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,0.12)",zIndex:300,overflow:"hidden",animation:"panelDown 0.22s cubic-bezier(0.4,0,0.2,1)"}}>
      <div style={{padding:"12px 14px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Filtros</span>
        <div style={{display:"flex",gap:6}}>
          {n>0&&<button onClick={()=>setFilters({channels:[],statuses:[],segments:[]})} style={{fontSize:10,fontWeight:600,color:RED,background:RED_LIGHT,border:`1px solid ${RED_BORDER}`,borderRadius:8,padding:"2px 8px",cursor:"pointer"}}>Limpar tudo</button>}
          <button onClick={onClose} style={{width:24,height:24,borderRadius:6,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
          </button>
        </div>
      </div>
      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:14}}>
        {[
          {title:"Canal",   items:ALL_CHANNELS, active:filters.channels, key:"channels" as keyof Filters, style:(v:string)=>{const s=CH_STYLE[v as Channel];return{border:`1.5px solid ${s.border}`,bg:s.bg,text:s.text};}},
          {title:"Status",  items:ALL_STATUSES, active:filters.statuses, key:"statuses" as keyof Filters, style:(v:string)=>{const s=ST_CFG[v as AIStatus];return{border:`1.5px solid ${s.border}`,bg:s.bg,text:s.color};}},
          {title:"Segmento",items:ALL_SEGMENTS, active:filters.segments, key:"segments" as keyof Filters, style:(v:string)=>{const s=SEG_COL[v]??{bg:"#f1f5f9",text:"#475569"};return{border:"1.5px solid #e2e8f0",bg:s.bg,text:s.text};}},
        ].map(group=>(
          <div key={group.title}>
            <p style={{margin:"0 0 7px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em"}}>{group.title}</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {group.items.map(item=>{
                const a=(group.active as string[]).includes(item);
                const s=group.style(item);
                const displayLabel = group.key==="statuses" ? ST_LABEL[item as AIStatus] : item;
                return(
                  <button key={item} onClick={()=>setFilters({...filters,[group.key]:tog(group.active as string[],item)})}
                    style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:600,cursor:"pointer",border:a?s.border.replace("1.5px","2px"):s.border,background:a?s.bg:"transparent",color:a?s.text:"#64748b",transition:"all 0.18s",transform:a?"scale(1.03)":"scale(1)"}}>
                    {displayLabel}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Kanban card ────────────────────────────────────────────────── */
function KCard({card,accent,onClick,paused,visible}:{card:Card;accent:string;onClick:()=>void;paused:boolean;visible:boolean}){
  const active=card.aiStatus!=="done";
  return(
    <div
      onClick={visible?onClick:undefined}
      className="kcard"
      style={{
        background:"#fff",
        border:active&&!paused?`1.5px solid ${accent}35`:"1.5px solid #e2e8f0",
        borderRadius:12,padding:"12px 13px",marginBottom:visible?8:0,
        boxShadow:active&&!paused?`0 2px 12px ${accent}12`:"0 1px 4px rgba(0,0,0,0.05)",
        transition:"opacity 0.3s ease,transform 0.3s cubic-bezier(0.4,0,0.2,1),max-height 0.35s ease,margin 0.3s ease,border-color 0.25s,box-shadow 0.25s",
        position:"relative",overflow:"hidden",cursor:visible?"pointer":"default",
        opacity:visible?1:0,
        transform:visible?"translateY(0) scale(1)":"translateY(-6px) scale(0.97)",
        maxHeight:visible?600:0,
        pointerEvents:visible?"auto":"none",
      }}
    >
      {active&&!paused&&<div style={{position:"absolute",top:0,left:0,right:0,height:2.5,background:accent,borderRadius:"12px 12px 0 0",opacity:0.7}}/>}
      {paused&&<div style={{position:"absolute",top:0,left:0,right:0,height:2.5,background:"#e2e8f0",borderRadius:"12px 12px 0 0"}}/>}

      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:8,background:`${accent}15`,border:`1px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:paused?"#94a3b8":accent,flexShrink:0,transition:"color 0.3s"}}>{initials(card.name)}</div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",lineHeight:1.2}}>{card.name}</div>
            {card.company&&<div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{card.company}</div>}
          </div>
        </div>
        {active&&!paused?<div style={{width:7,height:7,borderRadius:"50%",background:accent,marginTop:3,flexShrink:0,animation:"pulse 1.6s ease-in-out infinite",boxShadow:`0 0 6px ${accent}`}}/>
         :paused&&active?<span style={{fontSize:9,color:"#94a3b8",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:20,padding:"1px 6px",marginTop:2}}>⏸ pausado</span>:null}
      </div>

      <p style={{margin:"0 0 8px",fontSize:10.5,color:"#64748b",lineHeight:1.45}}>{card.note}</p>
      <div style={{marginBottom:8}}><ChannelTag channel={card.channel}/></div>
      <div style={{marginBottom:8}}><ProgressBar value={card.progress} color={accent} paused={paused}/></div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <StatusBadge status={card.aiStatus}/>
        <div style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#94a3b8"}}>
          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>
          {card.timeAgo}
        </div>
      </div>

      <div style={{marginTop:8,paddingTop:7,borderTop:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:4,fontSize:9.5,color:"#94a3b8"}}>
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={paused?"#cbd5e1":RED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{transition:"stroke 0.3s"}}><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        <span style={{color:paused?"#cbd5e1":RED,fontWeight:600,transition:"color 0.3s"}}>Fagner</span>&nbsp;·&nbsp;triagem automática
      </div>
    </div>
  );
}

/* ─── Funnel tab content ─────────────────────────────────────────── */
function FunnelTab({card,accent,funnelData,onEdit,onAIFill}:{card:Card;accent:string;funnelData:Record<string,string>;onEdit:(id:string,val:string)=>void;onAIFill:()=>void}){
  const fields = FUNNEL_FIELDS[card.columnId]??[];
  const [editingId, setEditingId]=useState<string|null>(null);
  const [draft, setDraft]=useState("");
  const inputRef=useRef<HTMLInputElement|null>(null);
  const selRef=useRef<HTMLSelectElement|null>(null);

  useEffect(()=>{
    if(editingId){
      setTimeout(()=>{inputRef.current?.focus();selRef.current?.focus();},30);
    }
  },[editingId]);

  const startEdit=(id:string)=>{setDraft(funnelData[id]??"");setEditingId(id);};
  const commit=()=>{if(editingId){onEdit(editingId,draft);setEditingId(null);}};

  const filled=fields.filter(f=>{const v=funnelData[f.id]??"";return v&&v!=="—";}).length;
  const pct=fields.length?Math.round((filled/fields.length)*100):0;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f8fafc"}}>
      {/* funnel header */}
      <div style={{padding:"14px 20px",borderBottom:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:9,background:`${accent}12`,border:`1.5px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Dados do Funil — {COLUMNS.find(c=>c.id===card.columnId)?.label}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{filled}/{fields.length} campos preenchidos</div>
            </div>
          </div>
          <button onClick={onAIFill} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:RED,background:RED_LIGHT,border:`1.5px solid ${RED_BORDER}`,borderRadius:9,padding:"6px 12px",cursor:"pointer",transition:"all 0.18s"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(229,35,42,0.14)";}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=RED_LIGHT;}}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Preencher com IA
          </button>
        </div>
        {/* progress bar */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,height:4,borderRadius:99,background:"#f1f5f9",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:accent,borderRadius:99,transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)"}}/>
          </div>
          <span style={{fontSize:10,color:accent,fontWeight:700,minWidth:32}}>{pct}%</span>
        </div>
      </div>

      {/* ai note */}
      <div style={{padding:"8px 20px",background:"#fffbeb",borderBottom:"1px solid #fde68a",display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        <span style={{fontSize:10,color:"#92400e"}}>Preenchido automaticamente pelo <strong style={{color:RED}}>Fagner</strong> — clique em qualquer campo para editar</span>
      </div>

      {/* fields grid */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,alignContent:"start"}}>
        {fields.map((field,i)=>{
          const val=funnelData[field.id]??"";
          const empty=!val||val==="—";
          const isEditing=editingId===field.id;
          return(
            <div key={field.id} style={{background:"#fff",border:`1.5px solid ${isEditing?accent+"50":"#e2e8f0"}`,borderRadius:10,padding:"10px 12px",transition:"all 0.2s ease",animation:`fieldIn 0.22s ease ${i*0.04}s both`,boxShadow:isEditing?`0 0 0 3px ${accent}15`:"none"}}>
              <div style={{fontSize:9.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                {field.label}
                {!empty&&!isEditing&&<span style={{fontSize:8,fontWeight:600,color:accent,background:`${accent}10`,border:`1px solid ${accent}20`,borderRadius:20,padding:"1px 5px",letterSpacing:0}}>IA</span>}
              </div>

              {isEditing?(
                field.type==="select"?(
                  <select ref={selRef} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}
                    style={{width:"100%",fontSize:12,fontWeight:600,color:"#1e293b",border:`1.5px solid ${accent}60`,borderRadius:7,padding:"5px 8px",background:"#fff",cursor:"pointer",boxSizing:"border-box"}}>
                    {field.options?.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                ):(
                  <input ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)}
                    onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditingId(null);}}
                    style={{width:"100%",fontSize:12,fontWeight:600,color:"#1e293b",border:`1.5px solid ${accent}60`,borderRadius:7,padding:"5px 8px",background:"#fff",boxSizing:"border-box"}}/>
                )
              ):(
                <div onClick={()=>startEdit(field.id)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,cursor:"pointer",borderRadius:6,padding:"3px 4px",transition:"background 0.15s",minHeight:24}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`${accent}08`;}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}>
                  <span style={{fontSize:12,fontWeight:empty?400:600,color:empty?"#cbd5e1":"#1e293b",fontStyle:empty?"italic":"normal",lineHeight:1.4,flex:1}}>{empty?"Não preenchido":val}</span>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.4,flexShrink:0}}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{padding:"10px 20px",borderTop:"1.5px solid #f1f5f9",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontSize:10,color:"#94a3b8"}}>Última atualização pelo Fagner · agora</span>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#10b981",animation:"pulse 1.5s ease-in-out infinite"}}/>
          Sincronizado
        </div>
      </div>
    </div>
  );
}

/* ─── WhatsApp window ────────────────────────────────────────────── */
function WAWindow({card,accent}:{card:Card;accent:string}){
  const endRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[card.id]);
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f0f2f5"}}>
      <div style={{background:"#075E54",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:`${accent}40`,border:"2px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{initials(card.name)}</div>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1.2}}>{card.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.7)",display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:"#25d366"}}/>online · via Fagner</div></div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{textAlign:"center",marginBottom:4}}><span style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"2px 10px",fontSize:10,color:"#64748b"}}>Hoje</span></div>
        {card.conversation.map((msg,i)=>{
          const ai=msg.from==="ai";
          return(
            <div key={i} style={{display:"flex",justifyContent:ai?"flex-end":"flex-start",animation:`msgIn 0.25s ease ${i*0.04}s both`}}>
              {!ai&&<div style={{width:24,height:24,borderRadius:"50%",background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#475569",flexShrink:0,marginRight:6,alignSelf:"flex-end"}}>{initials(card.name)[0]}</div>}
              <div style={{maxWidth:"72%",padding:"7px 10px 4px",borderRadius:ai?"12px 2px 12px 12px":"2px 12px 12px 12px",background:ai?"#dcf8c6":"#fff",boxShadow:"0 1px 3px rgba(0,0,0,0.1)",border:ai?"1px solid #c3f2a6":"1px solid #e8ecf0"}}>
                {ai&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}><svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg><span style={{fontSize:9,fontWeight:700,color:RED}}>Fagner</span></div>}
                <p style={{margin:0,fontSize:11.5,color:"#111827",lineHeight:1.45}} dangerouslySetInnerHTML={{__html:msg.text.replace(/\*(.*?)\*/g,"<strong>$1</strong>")}}/>
                <div style={{textAlign:"right",marginTop:3,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                  <span style={{fontSize:9,color:"#8696a0"}}>{msg.time}</span>
                  {ai&&<svg width={12} height={8} viewBox="0 0 16 11" fill="none"><path d="M1 5.5l4 4L15 1" stroke="#53bdeb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M5 5.5l4 4" stroke="#53bdeb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>
      <div style={{background:"#f0f2f5",padding:"8px 12px",display:"flex",alignItems:"center",gap:8,borderTop:"1px solid #e2e8f0",flexShrink:0}}>
        <div style={{flex:1,background:"#fff",borderRadius:24,padding:"8px 14px",fontSize:12,color:"#8696a0",border:"1px solid #e2e8f0"}}>Fagner respondendo automaticamente...</div>
        <div style={{width:36,height:36,borderRadius:"50%",background:"#075E54",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={22} y1={2} x2={11} y2={13}/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>
      </div>
    </div>
  );
}

/* ─── History tab ────────────────────────────────────────────────── */
const HEV_CFG: Record<HistoryEvent["type"],{color:string;bg:string;icon:React.ReactNode;dot:string}> = {
  entry:   {color:"#2563eb",bg:"#dbeafe",dot:"#2563eb",    icon:<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1={15} y1={12} x2={3} y2={12}/></svg>},
  ai:      {color:RED,     bg:"#fee2e2",dot:RED,            icon:<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>},
  stage:   {color:"#7c3aed",bg:"#ede9fe",dot:"#7c3aed",   icon:<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>},
  action:  {color:"#0369a1",bg:"#e0f2fe",dot:"#0369a1",   icon:<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>},
  done:    {color:"#059669",bg:"#dcfce7",dot:"#059669",   icon:<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>},
  pending: {color:"#b45309",bg:"#fef3c7",dot:"#b45309",   icon:<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>},
};

function HistoryTab({card,accent}:{card:Card;accent:string}){
  const events = card.history;
  const lastType = events[events.length-1]?.type;
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f8fafc"}}>
      {/* header */}
      <div style={{padding:"14px 20px",borderBottom:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:9,background:`${accent}12`,border:`1.5px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Histórico de Interações</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>{events.length} eventos · registrados pelo Fagner</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:20,
          background:lastType==="done"?"#dcfce7":lastType==="pending"?"#fef3c7":"#f1f5f9",
          color:lastType==="done"?"#059669":lastType==="pending"?"#b45309":"#64748b",
          border:`1px solid ${lastType==="done"?"#bbf7d0":lastType==="pending"?"#fde68a":"#e2e8f0"}`}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:lastType==="done"?"#059669":lastType==="pending"?"#f59e0b":"#94a3b8",animation:lastType==="pending"?"pulse 1.5s ease-in-out infinite":"none"}}/>
          {lastType==="done"?"Concluído":lastType==="pending"?"Em andamento":"Em triagem"}
        </div>
      </div>

      {/* timeline */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
        <div style={{position:"relative"}}>
          {/* vertical line */}
          <div style={{position:"absolute",left:17,top:8,bottom:8,width:1.5,background:"linear-gradient(to bottom,#e2e8f0,#e2e8f0 80%,transparent)",borderRadius:2}}/>

          {events.map((ev,i)=>{
            const cfg=HEV_CFG[ev.type];
            const isLast=i===events.length-1;
            return(
              <div key={i} style={{display:"flex",gap:14,marginBottom:isLast?0:20,animation:`fieldIn 0.25s ease ${i*0.05}s both`,position:"relative"}}>
                {/* dot */}
                <div style={{flexShrink:0,width:35,display:"flex",justifyContent:"center"}}>
                  <div style={{width:34,height:34,borderRadius:10,background:cfg.bg,border:`2px solid ${cfg.color}30`,display:"flex",alignItems:"center",justifyContent:"center",color:cfg.color,zIndex:1,position:"relative",boxShadow:isLast?`0 0 0 3px ${cfg.color}15`:"none"}}>
                    {cfg.icon}
                    {ev.type==="pending"&&<div style={{position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:cfg.dot,border:"2px solid #f8fafc",animation:"pulse 1.5s ease-in-out infinite"}}/>}
                    {ev.type==="done"&&<div style={{position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:cfg.dot,border:"2px solid #f8fafc"}}/>}
                  </div>
                </div>

                {/* content */}
                <div style={{flex:1,paddingTop:5}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#1e293b",lineHeight:1.3}}>{ev.label}</span>
                    <span style={{fontSize:10,color:"#94a3b8",flexShrink:0,marginTop:1,fontVariantNumeric:"tabular-nums"}}>{ev.time}</span>
                  </div>
                  <p style={{margin:0,fontSize:11,color:"#64748b",lineHeight:1.5}}>{ev.detail}</p>
                  {/* type chip */}
                  <span style={{display:"inline-flex",alignItems:"center",gap:3,marginTop:5,padding:"1px 7px",borderRadius:20,fontSize:9.5,fontWeight:700,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}20`}}>
                    {{entry:"Entrada",ai:"Fagner",stage:"Funil",action:"Ação",done:"Concluído",pending:"Pendente"}[ev.type]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* footer */}
      <div style={{padding:"10px 20px",borderTop:"1.5px solid #f1f5f9",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontSize:10,color:"#94a3b8"}}>Histórico completo · auditável</span>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          Rastreado pelo Fagner
        </div>
      </div>
    </div>
  );
}

/* ─── Score axes / questions ─────────────────────────────────────── */
const SCORE_AXES: ScoreAxis[] = [
  { id:"intencao",   label:"Intenção de Compra",        color:"#E5232A",
    questions:[
      {id:"int_1", label:"Demonstrou interesse claro em comprar?",       options:["Sim","Parcial","Não"]},
      {id:"int_2", label:"Solicitou orçamento, cotação ou catálogo?",    options:["Sim","Não"]},
      {id:"int_3", label:"Perguntou sobre pagamento ou prazo de entrega?",options:["Sim","Não"]},
    ]},
  { id:"capacidade", label:"Capacidade de Investimento", color:"#2563eb",
    questions:[
      {id:"cap_1", label:"CNPJ verificado e empresa ativa?",             options:["Sim","Não"]},
      {id:"cap_2", label:"Mencionou budget ou ticket estimado?",          options:["Sim","Não"]},
      {id:"cap_3", label:"Perfil indica capacidade financeira?",          options:["Alta","Média","Baixa"]},
    ]},
  { id:"perfil",     label:"Perfil da Empresa",          color:"#7c3aed",
    questions:[
      {id:"perf_1",label:"Segmento alinhado ao produto Fagner?",         options:["Sim","Parcial","Não"]},
      {id:"perf_2",label:"Volume de compra potencial?",                  options:["Grande","Médio","Pequeno"]},
      {id:"perf_3",label:"Histórico de compra anterior?",                options:["Sim","Não"]},
    ]},
  { id:"urgencia",   label:"Urgência de Compra",         color:"#d97706",
    questions:[
      {id:"urg_1", label:"Demonstrou urgência na compra?",               options:["Alta","Média","Baixa","Nenhuma"]},
      {id:"urg_2", label:"Informou prazo ou data limite?",               options:["Sim","Não"]},
      {id:"urg_3", label:"Necessidade imediata identificada?",           options:["Sim","Não"]},
    ]},
  { id:"engajamento",label:"Engajamento com a I.A.",     color:"#059669",
    questions:[
      {id:"eng_1", label:"Respondeu ativamente ao Fagner?",         options:["Sim","Parcial","Não"]},
      {id:"eng_2", label:"Retornou ao site ou chat mais de uma vez?",    options:["Sim","Não"]},
      {id:"eng_3", label:"Forneceu dados de contato completos?",         options:["Completo","Parcial","Não"]},
    ]},
];
const TEMP_CFG: Record<string,{label:string;emoji:string;color:string;bg:string;border:string;desc:string}> = {
  lead_hot: {label:"Lead Quente", emoji:"🔥",color:"#dc2626",bg:"#fef2f2",border:"#fecaca",desc:"Alta probabilidade de conversão. Prioridade máxima."},
  lead_warm:{label:"Lead Morno",  emoji:"🌡️",color:"#d97706",bg:"#fffbeb",border:"#fde68a",desc:"Interesse moderado. Requer acompanhamento ativo."},
  customer: {label:"Cliente",     emoji:"⭐",color:"#059669",bg:"#f0fdf4",border:"#bbf7d0",desc:"Já interagiu com Fagner. Potencial de recompra."},
  returning:{label:"Retorno",     emoji:"🔄",color:"#2563eb",bg:"#eff6ff",border:"#bfdbfe",desc:"Visitante recorrente. Nutrir com conteúdo."},
  visitor:  {label:"Visitante",   emoji:"❄️",color:"#64748b",bg:"#f8fafc",border:"#e2e8f0",desc:"Primeira interação. Potencial ainda não definido."},
  pending:  {label:"Aguardando",  emoji:"⏳",color:"#94a3b8",bg:"#f8fafc",border:"#e2e8f0",desc:"Score ainda não calculado pela I.A."},
};

/* ─── Score Tab ──────────────────────────────────────────────────── */
function ScoreTab({card,accent,scoreRespostas,onEdit}:{card:Card;accent:string;scoreRespostas:Record<string,string>;onEdit:(qId:string,val:string)=>void}){
  const temp = card.scoreData?.temperatura??"pending";
  const tcfg = TEMP_CFG[temp]??TEMP_CFG.pending;
  const pts  = card.scoreData?.pontoTotal??0;
  const eng  = card.scoreData?.engagementScore??0;
  const int_ = card.scoreData?.intentScore??0;
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f8fafc"}}>
      {/* header */}
      <div style={{padding:"14px 20px",borderBottom:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:9,background:`${accent}12`,border:`1.5px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Score de Qualificação — Fagner</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{card.aiStatus==="done"?`Avaliado ${card.scoreData?.avaliadoEm??"agora"}`:"Triagem em andamento..."}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:20,background:tcfg.bg,border:`1.5px solid ${tcfg.border}`}}>
            <span style={{fontSize:14}}>{tcfg.emoji}</span>
            <span style={{fontSize:11,fontWeight:800,color:tcfg.color}}>{tcfg.label}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {[{label:"Score Total",value:pts,max:75,color:accent},{label:"Engajamento",value:eng,max:100,color:"#2563eb"},{label:"Intenção",value:int_,max:100,color:"#059669"}].map(m=>(
            <div key={m.label} style={{flex:1,background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"8px 10px"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{m.label}</div>
              <div style={{fontSize:17,fontWeight:800,color:m.color,lineHeight:1}}>{m.value}<span style={{fontSize:10,fontWeight:400,color:"#94a3b8"}}>/{m.max}</span></div>
              <div style={{height:4,borderRadius:99,background:"#e2e8f0",overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${Math.min(100,(m.value/m.max)*100)}%`,background:m.color,borderRadius:99,transition:"width 1s ease"}}/></div>
            </div>
          ))}
        </div>
      </div>
      {!card.scoreData&&<div style={{padding:"7px 20px",background:"#fffbeb",borderBottom:"1px solid #fde68a",display:"flex",alignItems:"center",gap:7,flexShrink:0}}><svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg><span style={{fontSize:10,color:"#92400e"}}>O <strong style={{color:RED}}>Fagner</strong> ainda está analisando — respostas serão preenchidas automaticamente.</span></div>}
      <div style={{flex:1,overflowY:"auto",padding:"14px 20px",display:"flex",flexDirection:"column",gap:12}}>
        {SCORE_AXES.map(axis=>(
          <div key={axis.id} style={{background:"#fff",border:`1.5px solid ${axis.color}18`,borderLeft:`3px solid ${axis.color}`,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"8px 14px",borderBottom:"1px solid #f1f5f9",background:`${axis.color}06`,display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:axis.color}}/>
              <span style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{axis.label}</span>
            </div>
            {axis.questions.map((q,qi)=>{
              const ans=(scoreRespostas[q.id]??"") || (card.scoreData?.respostas?.[q.id]??"");
              return(
                <div key={q.id} style={{padding:"9px 14px",borderBottom:qi<axis.questions.length-1?"1px solid #f8fafc":"none",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <span style={{fontSize:11,color:"#475569",flex:1,lineHeight:1.4}}>{q.label}</span>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {q.options.map(opt=>{
                      const sel=ans===opt;
                      return(<button key={opt} onClick={()=>onEdit(q.id,sel?"":opt)} style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:sel?700:500,cursor:"pointer",border:`1.5px solid ${sel?axis.color+"60":"#e2e8f0"}`,background:sel?`${axis.color}12`:"transparent",color:sel?axis.color:"#64748b",transition:"all 0.18s"}}>{opt}</button>);
                    })}
                    {!ans&&<span style={{fontSize:10,color:"#cbd5e1",fontStyle:"italic"}}>Pendente</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{padding:"10px 20px",borderTop:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0,display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:tcfg.color,flexShrink:0}}/>
        <span style={{fontSize:10,color:"#64748b"}}>{tcfg.desc}</span>
      </div>
    </div>
  );
}

/* ─── Client Modal (with tabs) ───────────────────────────────────── */
type ModalTab = "conversa"|"funil"|"historico"|"score";

function ClientModal({card,accent,onClose,funnelData,onFunnelEdit,onAIFill}:{
  card:Card; accent:string; onClose:()=>void;
  funnelData:Record<string,string>;
  onFunnelEdit:(fieldId:string,val:string)=>void;
  onAIFill:()=>void;
}){
  const [tab, setTab] = useState<ModalTab>("conversa");
  const [scoreRespostas, setScoreRespostas] = useState<Record<string,string>>({});
  const seg=SEG_COL[card.segment??""]??{bg:"#f1f5f9",text:"#475569"};
  const fields=FUNNEL_FIELDS[card.columnId]??[];
  const filled=fields.filter(f=>{const v=funnelData[f.id]??"";return v&&v!=="—";}).length;

  useEffect(()=>{ setTab("conversa"); setScoreRespostas({}); },[card.id]);

  const onCloseRef = useRef(onClose);
  useEffect(()=>{ onCloseRef.current=onClose; });
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key==="Escape")onCloseRef.current();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.45)",backdropFilter:"blur(5px)",WebkitBackdropFilter:"blur(5px)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"fadeIn 0.18s ease"}}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:980,maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 28px 80px rgba(0,0,0,0.24)",animation:"slideUp 0.24s cubic-bezier(0.4,0,0.2,1)"}}>

        {/* ── Modal header ── */}
        <div style={{padding:"14px 20px",borderBottom:"1.5px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${accent}15`,border:`2px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:accent}}>{initials(card.name)}</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{card.name}</div>
              {card.company&&<div style={{fontSize:11,color:"#64748b"}}>{card.company}</div>}
            </div>
            <ChannelTag channel={card.channel}/>
            <span style={{display:"inline-flex",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:seg.bg,color:seg.text}}>{card.segment}</span>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:20,background:`${accent}10`,border:`1px solid ${accent}25`}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:accent}}/>
              <span style={{fontSize:10,fontWeight:700,color:accent}}>{COLUMNS.find(c=>c.id===card.columnId)?.label}</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <a href={`https://app.rdstation.com.br/crm`} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#f8fafc",fontSize:11,fontWeight:600,color:"#475569",textDecoration:"none",cursor:"pointer",transition:"all 0.18s"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#f1f5f9";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#f8fafc";}}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1={10} y1={14} x2={21} y2={3}/></svg>
              Abrir no CRM
            </a>
            <a href={`https://app.rdstation.com.br/marketing`} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:9,border:`1.5px solid ${RED_BORDER}`,background:RED_LIGHT,fontSize:11,fontWeight:700,color:RED,textDecoration:"none",cursor:"pointer",transition:"all 0.18s"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(229,35,42,0.14)";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=RED_LIGHT;}}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={16}/><line x1={8} y1={12} x2={16} y2={12}/></svg>
              Abrir no RD
            </a>
            <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",transition:"background 0.15s"}}
              onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="#f8fafc")}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>

          {/* Left sidebar */}
          <div style={{width:270,flexShrink:0,borderRight:"1.5px solid #f1f5f9",padding:18,overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
            {/* Contact */}
            <div>
              <p style={{margin:"0 0 9px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em"}}>Contato</p>
              {[
                {path:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.58 4.44 2 2 0 0 1 3.55 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.61-.61a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",label:card.phone??"—"},
                {path:"M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z",label:card.email??"—"},
                {path:"M9 11l3 3L22 4",label:card.cnpjCpf??"CPF/CNPJ —"},
                {path:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",label:card.tipoEmpresa??"Tipo —"},
                {path:"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z",label:card.city??"—"},
              ].map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <div style={{width:26,height:26,borderRadius:7,background:"#f8fafc",border:"1.5px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={item.path}/></svg></div>
                  <span style={{fontSize:11,color:"#1e293b"}}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Triage */}
            <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:11,padding:12}}>
              <p style={{margin:"0 0 9px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em"}}>Triagem</p>
              <div style={{marginBottom:9}}><StatusBadge status={card.aiStatus}/></div>
              <ProgressBar value={card.progress} color={accent}/>
              <div style={{marginTop:9,display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                <span>Por <strong style={{color:RED}}>Fagner</strong> · {card.timeAgo}</span>
              </div>
            </div>

            {/* AI note */}
            <div>
              <p style={{margin:"0 0 7px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em"}}>Observação da IA</p>
              <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:9,padding:"9px 11px",fontSize:11,color:"#78350f",lineHeight:1.5}}>{card.note}</div>
            </div>
          </div>

          {/* Right panel with tabs */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

            {/* Tab bar */}
            <div style={{borderBottom:"1.5px solid #f1f5f9",background:"#fff",padding:"0 20px",display:"flex",alignItems:"flex-end",gap:0,flexShrink:0}}>
              {([
                {id:"conversa" as ModalTab, label:"Conversa", icon:<svg width={12} height={12} viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.062.522 4.004 1.438 5.696L.057 23.999 6.5 22.629A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.007-1.37l-.357-.213-3.706.972.988-3.608-.233-.369A9.819 9.819 0 0 1 2.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>},
                {id:"funil" as ModalTab, label:"Funil", badge:`${filled}/${fields.length}`, badgeColor:accent, icon:<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>},
                {id:"historico" as ModalTab, label:"Histórico", badge:String(card.history.length), badgeColor:"#7c3aed", icon:<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>},
                {id:"score" as ModalTab, label:"Score", badgeColor:"#d97706", icon:<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>},
              ] as {id:ModalTab;label:string;icon:React.ReactNode;badge?:string;badgeColor?:string}[]).map(t=>{
                const active=tab===t.id;
                return(
                  <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"12px 16px",border:"none",borderBottom:`2.5px solid ${active?accent:"transparent"}`,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:active?700:500,color:active?accent:"#64748b",transition:"all 0.2s ease",borderRadius:"0"}}>
                    <span style={{color:active?accent:"#94a3b8",transition:"color 0.2s"}}>{t.icon}</span>
                    {t.label}
                    {t.badge&&<span style={{fontSize:9,fontWeight:700,color:active?accent:"#94a3b8",background:active?`${accent}12`:"#f1f5f9",border:`1px solid ${active?accent+"25":"#e2e8f0"}`,borderRadius:20,padding:"1px 6px",transition:"all 0.2s"}}>{t.badge}</span>}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{flex:1,overflow:"hidden",position:"relative"}}>
              {/* Conversa */}
              <div style={{position:"absolute",inset:0,transition:"opacity 0.22s ease,transform 0.22s ease",opacity:tab==="conversa"?1:0,transform:tab==="conversa"?"translateX(0)":"translateX(-12px)",pointerEvents:tab==="conversa"?"auto":"none"}}>
                <WAWindow card={card} accent={accent}/>
              </div>
              {/* Funil */}
              <div style={{position:"absolute",inset:0,transition:"opacity 0.22s ease,transform 0.22s ease",opacity:tab==="funil"?1:0,transform:tab==="funil"?"translateX(0)":tab==="conversa"?"translateX(12px)":"translateX(-12px)",pointerEvents:tab==="funil"?"auto":"none"}}>
                <FunnelTab card={card} accent={accent} funnelData={funnelData} onEdit={onFunnelEdit} onAIFill={onAIFill}/>
              </div>
              {/* Histórico */}
              <div style={{position:"absolute",inset:0,transition:"opacity 0.22s ease,transform 0.22s ease",opacity:tab==="historico"?1:0,transform:tab==="historico"?"translateX(0)":tab==="score"?"translateX(-12px)":"translateX(12px)",pointerEvents:tab==="historico"?"auto":"none"}}>
                <HistoryTab card={card} accent={accent}/>
              </div>
              {/* Score */}
              <div style={{position:"absolute",inset:0,transition:"opacity 0.22s ease,transform 0.22s ease",opacity:tab==="score"?1:0,transform:tab==="score"?"translateX(0)":"translateX(12px)",pointerEvents:tab==="score"?"auto":"none"}}>
                <ScoreTab card={card} accent={accent} scoreRespostas={scoreRespostas} onEdit={(qId,val)=>setScoreRespostas(prev=>({...prev,[qId]:val}))}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Activity Feed ──────────────────────────────────────────────── */
function ActivityFeed({events,open,onClose}:{events:FeedEvent[];open:boolean;onClose:()=>void}){
  return(
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:294,background:"#fff",boxShadow:"-4px 0 28px rgba(0,0,0,0.09)",borderLeft:"1.5px solid #e2e8f0",transform:open?"translateX(0)":"translateX(100%)",transition:"transform 0.3s cubic-bezier(0.4,0,0.2,1)",zIndex:200,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"13px 14px",borderBottom:"1.5px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:8,background:RED_LIGHT,border:`1.5px solid ${RED_BORDER}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div><div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>Feed de Atividade</div><div style={{fontSize:10,color:"#94a3b8"}}>Tempo real · Fagner</div></div>
        </div>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",transition:"background 0.15s"}} onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="#f8fafc")}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
        </button>
      </div>
      <div style={{padding:"7px 14px",borderBottom:"1px solid #f8fafc",background:"#fafbfc",display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:"#10b981",animation:"pulse 1.5s ease-in-out infinite"}}/>
        <span style={{fontSize:10,color:"#64748b",fontWeight:500}}>{events.length} eventos registrados</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
        {events.length===0&&(
          <div style={{textAlign:"center",padding:"32px 12px"}}>
            <p style={{margin:"0 0 4px",fontSize:12,fontWeight:600,color:"#94a3b8"}}>Nenhuma atividade ainda</p>
            <p style={{margin:0,fontSize:10,color:"#cbd5e1",lineHeight:1.4}}>Eventos aparecerão aqui em tempo real</p>
          </div>
        )}
        {events.map(ev=>(
          <div key={ev.id} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:10,background:"#fafbfc",border:"1px solid #f1f5f9",animation:"feedSlide 0.25s ease"}}>
            <div style={{width:26,height:26,borderRadius:8,background:`${ev.color}12`,border:`1px solid ${ev.color}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12}}>{ev.icon}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:"#1e293b",lineHeight:1.3}}>{ev.text}</div><div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{ev.sub}</div></div>
            <div style={{fontSize:9,color:"#cbd5e1",flexShrink:0,marginTop:1}}>{ev.ts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────── */
function StatCard({label,value,color,icon}:{label:string;value:number;color:string;icon:React.ReactNode}){
  return(
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,minWidth:148,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
      <div><div style={{fontSize:10,fontWeight:600,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{label}</div><div style={{fontSize:24,fontWeight:800,color:"#0f172a",lineHeight:1}}><AnimNum value={value}/></div></div>
      <div style={{width:36,height:36,borderRadius:10,background:`${color}12`,border:`1.5px solid ${color}25`,display:"flex",alignItems:"center",justifyContent:"center",color}}>{icon}</div>
    </div>
  );
}

/* ─── Empty col ──────────────────────────────────────────────────── */
function EmptyCol({accent,label,filtered}:{accent:string;label:string;filtered:boolean}){
  return(
    <div style={{border:"1.5px dashed #e2e8f0",borderRadius:12,padding:"22px 14px",textAlign:"center",background:"#fafbfc"}}>
      <div style={{width:34,height:34,borderRadius:10,background:`${accent}10`,border:`1.5px dashed ${accent}25`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 9px"}}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.55}}>
          {filtered?<><circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/></>:<><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={16}/><line x1={8} y1={12} x2={16} y2={12}/></>}
        </svg>
      </div>
      <p style={{margin:"0 0 3px",fontSize:11,fontWeight:600,color:"#94a3b8"}}>{filtered?"Sem resultados":"Nenhum cliente"}</p>
      <p style={{margin:0,fontSize:9.5,color:"#cbd5e1",lineHeight:1.45}}>{filtered?`Nenhum card em ${label} com esses filtros`:`A IA moverá clientes automaticamente`}</p>
    </div>
  );
}

/* ─── Notification tray ──────────────────────────────────────────── */
function NotificationTray({toasts,onDismiss}:{toasts:Toast[];onDismiss:(id:string)=>void}){
  if(toasts.length===0)return null;
  return(
    <div style={{position:"fixed",bottom:24,right:24,zIndex:400,display:"flex",flexDirection:"column-reverse",gap:8,pointerEvents:"none"}}>
      {toasts.map((t,i)=>(
        <div key={t.id} style={{
          display:"flex",alignItems:"flex-start",gap:10,
          background:"#fff",border:`1.5px solid ${t.accent}30`,
          borderLeft:`3.5px solid ${t.accent}`,
          borderRadius:12,padding:"11px 13px",
          boxShadow:"0 8px 32px rgba(0,0,0,0.13)",
          minWidth:280,maxWidth:320,pointerEvents:"auto",
          animation:"toastIn 0.32s cubic-bezier(0.34,1.56,0.64,1)",
          opacity:1,
          transform:`translateY(${i*-2}px) scale(${1-i*0.015})`,
          transition:"transform 0.2s ease",
        }}>
          {/* icon */}
          <div style={{width:32,height:32,borderRadius:9,background:`${t.accent}12`,border:`1.5px solid ${t.accent}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          {/* body */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              <span style={{fontSize:9.5,fontWeight:700,color:RED}}>Fagner</span>
              <span style={{fontSize:9,color:"#94a3b8",marginLeft:"auto"}}>{t.ts}</span>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",lineHeight:1.3,marginBottom:2}}>{t.name}{t.company&&<span style={{fontWeight:400,color:"#64748b"}}> · {t.company}</span>}</div>
            <div style={{fontSize:10.5,color:"#059669",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#10b981",display:"inline-block",flexShrink:0}}/>
              Triagem concluída — {t.funnel}
            </div>
          </div>
          {/* close */}
          <button onClick={()=>onDismiss(t.id)} style={{width:18,height:18,borderRadius:5,border:"none",background:"#f1f5f9",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",flexShrink:0,padding:0,pointerEvents:"auto",transition:"background 0.15s"}}
            onMouseEnter={e=>(e.currentTarget.style.background="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.background="#f1f5f9")}>
            <svg width={8} height={8} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1={2} y1={2} x2={8} y2={8}/><line x1={8} y1={2} x2={2} y2={8}/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Root ───────────────────────────────────────────────────────── */
export function CRMKanban(){
  const [loading,    setLoading]    = useState(true);
  const [cards,      setCards]      = useState<Card[]>([]);
  const [paused,     setPaused]     = useState(false);
  const [selected,   setSelected]   = useState<Card|null>(null);
  const [feedOpen,   setFeedOpen]   = useState(false);
  const [events,     setEvents]     = useState<FeedEvent[]>([]);
  const [query,      setQuery]      = useState("");
  const [filters,    setFilters]    = useState<Filters>({channels:[],statuses:[],segments:[]});
  const [filterOpen, setFilterOpen] = useState(false);
  const [funnelOverrides, setFunnelOverrides] = useState<Record<string,Record<string,string>>>({});
  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const [soundOn,    setSoundOn]    = useState(true);

  const pausedRef  = useRef(false);
  const eventId    = useRef(0);
  const toastId    = useRef(0);
  const filterRef  = useRef<HTMLDivElement>(null);
  const soundRef   = useRef(true);
  useEffect(()=>{soundRef.current=soundOn;},[soundOn]);

  const playChime = useCallback(()=>{
    if(!soundRef.current)return;
    try{
      const ctx=new (window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext)();
      const freqs=[523.25,659.25,783.99];
      freqs.forEach((f,i)=>{
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.connect(gain);gain.connect(ctx.destination);
        osc.type="sine";osc.frequency.value=f;
        gain.gain.setValueAtTime(0,ctx.currentTime+i*0.12);
        gain.gain.linearRampToValueAtTime(0.18,ctx.currentTime+i*0.12+0.02);
        gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.12+0.35);
        osc.start(ctx.currentTime+i*0.12);
        osc.stop(ctx.currentTime+i*0.12+0.4);
      });
    }catch(_){}
  },[]);

  const pushToast=useCallback((card:Card)=>{
    const accent=COLUMNS.find(c=>c.id===card.columnId)?.accent??RED;
    const funnel=COLUMNS.find(c=>c.id===card.columnId)?.label??"";
    const id=String(++toastId.current);
    setToasts(prev=>[{id,name:card.name,company:card.company,funnel,accent,ts:nowTime()},...prev].slice(0,5));
    playChime();
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),6000);
  },[playChime]);

  useEffect(()=>{const t=setTimeout(()=>{setCards(SEED);setLoading(false);},SK_MS);return()=>clearTimeout(t);},[]);

  useEffect(()=>{
    if(!filterOpen)return;
    const h=(e:MouseEvent)=>{if(filterRef.current&&!filterRef.current.contains(e.target as Node))setFilterOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[filterOpen]);

  const pushEvent=useCallback((ev:Omit<FeedEvent,"id"|"ts">)=>{
    setEvents(prev=>[{...ev,id:String(++eventId.current),ts:nowTime()},...prev].slice(0,40));
  },[]);

  useEffect(()=>{
    if(loading)return;
    const id=setInterval(()=>{
      if(pausedRef.current)return;
      setCards(prev=>prev.map(c=>{
        if(c.aiStatus==="analyzing"||c.aiStatus==="processing"){
          const next=Math.min(100,c.progress+Math.random()*5+1);
          const ns:AIStatus=next>=100?"done":c.aiStatus;
          if(Math.round(next)%25===0&&Math.round(c.progress)%25!==0)
            pushEvent({icon:"⚡",color:"#2563eb",text:`Progresso: ${c.name}`,sub:`Triagem em ${Math.round(next)}%`});
          if(ns==="done"&&c.aiStatus!=="done"){
            pushEvent({icon:"✅",color:"#059669",text:"Triagem concluída",sub:c.name+(c.company?` · ${c.company}`:"")});
            pushToast({...c,progress:next,aiStatus:ns});
          }
          return{...c,progress:next,aiStatus:ns};
        }
        return c;
      }));
    },2000);
    return()=>clearInterval(id);
  },[loading,pushEvent,pushToast]);

  const handlePause=()=>{
    const next=!paused;setPaused(next);pausedRef.current=next;
    if(next)pushEvent({icon:"⏸",color:"#64748b",text:"Triagem pausada",sub:"Fagner em standby"});
    else     pushEvent({icon:"▶️",color:RED,text:"Triagem retomada",sub:"Fagner operando normalmente"});
  };

  const handleFunnelEdit=(cardId:string,fieldId:string,val:string)=>{
    setFunnelOverrides(prev=>({...prev,[cardId]:{...(prev[cardId]??{}),[fieldId]:val}}));
    const card=cards.find(c=>c.id===cardId);
    if(card) pushEvent({icon:"✏️",color:"#7c3aed",text:`Funil editado: ${card.name}`,sub:FUNNEL_FIELDS[card.columnId]?.find(f=>f.id===fieldId)?.label??fieldId});
    if(selected?.id===cardId) setSelected(prev=>prev?{...prev,funnel:{...prev.funnel,[fieldId]:val}}:null);
  };

  const handleAIFill=(cardId:string)=>{
    const card=cards.find(c=>c.id===cardId);
    if(!card)return;
    pushEvent({icon:"🤖",color:RED,text:`IA preencheu funil: ${card.name}`,sub:`Funil ${COLUMNS.find(c=>c.id===card.columnId)?.label}`});
  };

  const afc = filters.channels.length+filters.statuses.length+filters.segments.length;
  const isFiltered = query.trim()!=""||afc>0;

  const filteredCards=useMemo(()=>cards.filter(c=>{
    const q=query.trim().toLowerCase();
    if(q&&!c.name.toLowerCase().includes(q)&&!(c.company??"").toLowerCase().includes(q))return false;
    if(filters.channels.length&&!filters.channels.includes(c.channel))return false;
    if(filters.statuses.length&&!filters.statuses.includes(c.aiStatus))return false;
    if(filters.segments.length&&!filters.segments.includes(c.segment??""))return false;
    return true;
  }),[cards,query,filters]);

  const active=cards.filter(c=>c.aiStatus!=="done").length;
  const done  =cards.filter(c=>c.aiStatus==="done").length;
  const selAccent=selected?(COLUMNS.find(c=>c.id===selected.columnId)?.accent??RED):RED;
  const clearFilters=()=>{setFilters({channels:[],statuses:[],segments:[]});setQuery("");};

  const selFunnelData = selected ? {...selected.funnel,...(funnelOverrides[selected.id]??{})} : {};

  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"#f8fafc",fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",color:"#0f172a",overflow:"hidden"}}>
      <style>{`
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes pulse     { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(0.8)} }
        @keyframes fadein    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes panelDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes skShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes feedSlide { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes chipIn    { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes msgIn     { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bannerIn  { from{opacity:0;transform:translateY(-100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes fieldIn   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes toastIn   { from{opacity:0;transform:translateY(12px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        .kcard:hover         { transform:translateY(-2px)!important; box-shadow:0 8px 24px rgba(0,0,0,0.1)!important; }
        ::-webkit-scrollbar  { width:4px;height:4px }
        ::-webkit-scrollbar-track { background:#f1f5f9;border-radius:4px }
        ::-webkit-scrollbar-thumb { background:#cbd5e1;border-radius:4px }
        input:focus,select:focus { outline:none; }
      `}</style>

      {/* ── Paused banner ── */}
      {paused&&(
        <div style={{background:"#fef9c3",borderBottom:"2px solid #fde047",padding:"8px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"bannerIn 0.25s cubic-bezier(0.4,0,0.2,1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span>⏸</span>
            <span style={{fontSize:12,fontWeight:700,color:"#854d0e"}}>Fagner pausado</span>
            <span style={{fontSize:11,color:"#a16207"}}>— Triagem automática em standby.</span>
          </div>
          <button onClick={handlePause} style={{display:"flex",alignItems:"center",gap:5,background:"#854d0e",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,color:"#fff",fontWeight:600}}>▶ Retomar agora</button>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{padding:"12px 24px",borderBottom:"1.5px solid #e2e8f0",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700,color:paused?"#64748b":RED,background:paused?"#f1f5f9":RED_LIGHT,border:`1px solid ${paused?"#e2e8f0":RED_BORDER}`,borderRadius:20,padding:"2px 8px",textTransform:"uppercase",letterSpacing:"0.06em",transition:"all 0.3s"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:paused?"#94a3b8":RED,animation:paused?"none":"pulse 1.5s ease-in-out infinite"}}/>
              CRM · {paused?"IA Pausada":"Triagem Automática"}
            </span>
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <h1 style={{margin:0,fontSize:20,fontWeight:800,letterSpacing:"-0.5px",color:"#0f172a"}}>Fagner Conversas</h1>
            <span style={{fontSize:15,fontWeight:700,color:paused?"#94a3b8":RED,transition:"color 0.3s"}}>Fagner</span>
          </div>
          <p style={{margin:"1px 0 0",fontSize:11,color:"#94a3b8"}}>Operado em tempo real pela inteligência. Sem intervenção humana.</p>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"6px 12px",width:190}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={query?"#475569":"#94a3b8"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/></svg>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente..." style={{border:"none",background:"transparent",fontSize:12,color:"#1e293b",width:"100%",caretColor:RED}}/>
            {query&&<button onClick={()=>setQuery("")} style={{border:"none",background:"none",cursor:"pointer",padding:0,color:"#94a3b8",display:"flex",alignItems:"center"}}><svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg></button>}
          </div>

          <div ref={filterRef} style={{position:"relative"}}>
            <button onClick={()=>setFilterOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:5,background:afc>0?"#eff6ff":"#f8fafc",border:afc>0?"1.5px solid #2563eb":"1.5px solid #e2e8f0",borderRadius:9,padding:"7px 12px",cursor:"pointer",fontSize:12,color:afc>0?"#1d4ed8":"#475569",fontWeight:afc>0?700:500,transition:"all 0.2s"}}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtros{afc>0&&<span style={{background:"#2563eb",color:"#fff",fontSize:9,fontWeight:700,borderRadius:20,padding:"0 5px",lineHeight:"15px"}}>{afc}</span>}
            </button>
            {filterOpen&&<FilterPanel filters={filters} setFilters={setFilters} onClose={()=>setFilterOpen(false)}/>}
          </div>

          <button onClick={()=>setFeedOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:5,background:feedOpen?"#f0fdf4":"#f8fafc",border:feedOpen?"1.5px solid #10b981":"1.5px solid #e2e8f0",borderRadius:9,padding:"7px 12px",cursor:"pointer",fontSize:12,color:feedOpen?"#059669":"#475569",fontWeight:feedOpen?700:500,transition:"all 0.2s"}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Feed{events.length>0&&<span style={{background:feedOpen?"#059669":"#e2e8f0",color:feedOpen?"#fff":"#64748b",fontSize:9,fontWeight:700,borderRadius:20,padding:"0 5px",lineHeight:"15px",transition:"all 0.25s"}}>{events.length}</span>}
          </button>

          <button onClick={handlePause} style={{display:"flex",alignItems:"center",gap:5,background:paused?"#fffbeb":"#f8fafc",border:paused?"1.5px solid #fde047":"1.5px solid #e2e8f0",borderRadius:9,padding:"7px 12px",cursor:"pointer",fontSize:12,color:paused?"#854d0e":"#475569",fontWeight:paused?700:500,transition:"all 0.2s"}}>
            {paused?<><svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Retomar</>:<><svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>Pausar IA</>}
          </button>

          {/* Sound toggle */}
          <button onClick={()=>setSoundOn(s=>!s)} title={soundOn?"Silenciar notificações":"Ativar notificações"} style={{position:"relative",display:"flex",alignItems:"center",gap:5,background:soundOn?"#f0fdf4":"#fef2f2",border:soundOn?"1.5px solid #10b981":"1.5px solid #fca5a5",borderRadius:9,padding:"7px 12px",cursor:"pointer",fontSize:12,color:soundOn?"#059669":"#dc2626",fontWeight:soundOn?600:500,transition:"all 0.2s"}}>
            {soundOn
              ?<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              :<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1={23} y1={9} x2={17} y2={15}/><line x1={17} y1={9} x2={23} y2={15}/></svg>
            }
            {soundOn?"Som On":"Mudo"}
            {toasts.length>0&&soundOn&&<span style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",background:"#10b981",border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff",animation:"pulse 1.2s ease-in-out infinite"}}>{toasts.length}</span>}
          </button>

          <button style={{display:"flex",alignItems:"center",gap:5,background:RED_LIGHT,border:`1.5px solid ${RED_BORDER}`,borderRadius:9,padding:"7px 12px",cursor:"pointer",fontSize:12,color:RED,fontWeight:600}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Fagner
          </button>
          <button style={{display:"flex",alignItems:"center",gap:5,background:RED,border:"none",borderRadius:9,padding:"7px 14px",cursor:"pointer",fontSize:12,color:"#fff",fontWeight:600,boxShadow:`0 2px 10px ${RED}40`}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {isFiltered&&(
        <div style={{padding:"7px 24px",background:"#fff",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",animation:"fadein 0.2s ease"}}>
          <span style={{fontSize:10,fontWeight:600,color:"#94a3b8",marginRight:2}}>Filtros:</span>
          {query&&<FilterChip label={`"${query}"`} color="#475569" onRemove={()=>setQuery("")}/>}
          {filters.channels.map(ch=><FilterChip key={ch} label={ch} color={CH_STYLE[ch as Channel].text} onRemove={()=>setFilters({...filters,channels:filters.channels.filter(c=>c!==ch)})}/>)}
          {filters.statuses.map(st=><FilterChip key={st} label={ST_LABEL[st as AIStatus]} color={ST_CFG[st as AIStatus].color} onRemove={()=>setFilters({...filters,statuses:filters.statuses.filter(s=>s!==st)})}/>)}
          {filters.segments.map(sg=><FilterChip key={sg} label={sg} color={SEG_COL[sg]?.text??"#475569"} onRemove={()=>setFilters({...filters,segments:filters.segments.filter(s=>s!==sg)})}/>)}
          <button onClick={clearFilters} style={{fontSize:10,fontWeight:600,color:"#94a3b8",background:"none",border:"none",cursor:"pointer",padding:"2px 6px",borderRadius:6}} onMouseEnter={e=>(e.currentTarget.style.color=RED)} onMouseLeave={e=>(e.currentTarget.style.color="#94a3b8")}>Limpar ×</button>
          <span style={{marginLeft:"auto",fontSize:10,color:"#94a3b8"}}>{filteredCards.length} de {cards.length}</span>
        </div>
      )}

      {/* ── Stats ── */}
      <div style={{padding:"11px 24px",borderBottom:"1.5px solid #e2e8f0",background:"#fff",display:"flex",gap:10}}>
        <StatCard label="Conversas Ativas" value={loading?0:cards.length} color={RED} icon={<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}/>
        <StatCard label="Sendo Triadas"    value={loading?0:active}       color="#2563eb" icon={<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}/>
        <StatCard label="Concluídas"       value={loading?0:done}         color="#059669" icon={<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}/>
        <StatCard label="Exibindo"         value={loading?0:isFiltered?filteredCards.length:cards.length} color="#7c3aed" icon={<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>}/>
      </div>

      {/* ── Board ── */}
      <div style={{flex:1,display:"flex",gap:10,padding:"16px 24px",overflowX:"auto",overflowY:"auto",alignItems:"flex-start",paddingRight:feedOpen?310:24,transition:"padding-right 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
        {COLUMNS.map((col,i)=>{
          const colAll=loading?[]:cards.filter(c=>c.columnId===col.id);
          const colVis=loading?[]:filteredCards.filter(c=>c.columnId===col.id);
          const skCount=loading?[...Array(i===1?3:i===0?2:1)]:[];
          return(
            <div key={col.id} style={{flex:"0 0 220px",minWidth:220,animation:`fadein 0.35s ease ${i*0.06}s both`}}>
              <div style={{background:"#fff",border:`1.5px solid ${col.accent}25`,borderTop:`3px solid ${paused?"#cbd5e1":col.accent}`,borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between",transition:"border-top-color 0.35s"}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:26,height:26,borderRadius:7,background:`${col.accent}12`,border:`1.5px solid ${col.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",opacity:paused?0.5:1,transition:"opacity 0.3s"}}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={col.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={col.iconPath}/></svg>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:"#1e293b",letterSpacing:"0.02em"}}>{col.label.toUpperCase()}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  {isFiltered&&colVis.length!==colAll.length&&<span style={{fontSize:9,color:"#94a3b8",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:20,padding:"1px 5px"}}>{colAll.length}</span>}
                  <span style={{fontSize:11,fontWeight:700,color:paused?"#94a3b8":col.accent,background:`${col.accent}12`,border:`1.5px solid ${col.accent}22`,borderRadius:20,padding:"1px 8px",transition:"color 0.3s",minWidth:22,textAlign:"center"}}>
                    {loading?"…":colVis.length}
                  </span>
                </div>
              </div>
              {loading&&skCount.map((_,k)=><SkCard key={k}/>)}
              {!loading&&colAll.map(card=>(
                <KCard key={card.id} card={card} accent={col.accent} paused={paused}
                  visible={colVis.some(c=>c.id===card.id)}
                  onClick={()=>setSelected(card)}/>
              ))}
              {!loading&&colVis.length===0&&<EmptyCol accent={col.accent} label={col.label} filtered={isFiltered}/>}
            </div>
          );
        })}
      </div>

      <ActivityFeed events={events} open={feedOpen} onClose={()=>setFeedOpen(false)}/>
      <NotificationTray toasts={toasts} onDismiss={id=>setToasts(prev=>prev.filter(t=>t.id!==id))}/>

      {selected&&(
        <ClientModal
          card={selected}
          accent={selAccent}
          onClose={()=>setSelected(null)}
          funnelData={selFunnelData}
          onFunnelEdit={(fieldId,val)=>handleFunnelEdit(selected.id,fieldId,val)}
          onAIFill={()=>handleAIFill(selected.id)}
        />
      )}
    </div>
  );
}
