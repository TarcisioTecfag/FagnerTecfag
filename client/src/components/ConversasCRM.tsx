import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { WS_URL } from "@/lib/api";

/* ─── Brand ──────────────────────────────────────────────────────── */
const RED       = "#E5232A";
const RED_LIGHT = "rgba(229,35,42,0.08)";
const RED_BORDER= "rgba(229,35,42,0.2)";
const SK_MS     = 1600;

/* ─── Columns ────────────────────────────────────────────────────── */
const COLUMNS = [
  { id:"triagem",    label:"Triagem",     accent:"#f59e0b", iconPath:"M22 3H2l8 9.46V19l4 2v-8.54L22 3z" },
  { id:"pos-venda",   label:"Pós Venda",   accent:"#8b5cf6", iconPath:"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id:"maquinas",    label:"Máquinas",    accent:"#ea580c", iconPath:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  { id:"personalite", label:"Personalite", accent:"#3b82f6", iconPath:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" },
  { id:"financeiro",  label:"Financeiro",  accent:"#22c55e", iconPath:"M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { id:"pecas",       label:"Peças",       accent:"#d97706", iconPath:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" },
  { id:"outros",      label:"Outros",      accent:"#64748b", iconPath:"M5 12h14M12 5l7 7-7 7" },
];

/* ─── Funnel fields per column ───────────────────────────────────── */
type FType = "text"|"select";
interface FField { id:string; label:string; type:FType; options?:string[]; }

const FUNNEL_FIELDS: Record<string, FField[]> = {

  /* ── Triagem (funil de entrada) ──────────────────────────────────── */
  "triagem": [
    {id:"assunto",       label:"O que o cliente busca?",          type:"text"},
    {id:"funil_provavel",label:"Funil provável",                  type:"select",
      options:[
        "Máquinas",
        "Personalitté",
        "Peças",
        "Financeiro",
        "Pós Venda",
        "Outros",
        "Ainda não identificado",
      ]},
    {id:"obs_triagem",   label:"Observação para direcionamento",  type:"text"},
  ],

  "pos-venda": [
    {id:"resumo", label:"Resumo da tratativa de pós-venda", type:"text"},
  ],

  /* ── Máquinas ──────────────────────────────────────────────────── */
  "maquinas": [
    {id:"cliente_novo",    label:"Cliente é novo?",         type:"select",
      options:["Sim","Não"]},
    {id:"qualif_sdr",      label:"Qualificado por SDR",     type:"select",
      options:[
        "Recompra – Novo Maquinário",
        "Cliente Novo, Começando a Pesquisar",
        "Contato Ativo",
        "Revenda",
        "Troca de Máquina (Já tem o processo e quer renovar)",
        "Peças para Reposição",
        "Curioso / Estudante (Sem intenção de compra)",
        "Fora de Portfólio (Produto não fabricado pela Tecfag)",
        "Sumiu / Sem Contato (Não atendeu ou não retornou)",
      ]},
    {id:"produto_fabricado", label:"Qual o produto fabricado?", type:"text"},
    {id:"volume",            label:"Volume de produção",        type:"select",
      options:["Baixo Volume","Médio Volume","Alto Volume"]},
  ],

  /* ── Personalitté (mesmos campos de Máquinas) ───────────────────── */
  "personalite": [
    {id:"cliente_novo",    label:"Cliente é novo?",         type:"select",
      options:["Sim","Não"]},
    {id:"qualif_sdr",      label:"Qualificado por SDR",     type:"select",
      options:[
        "Recompra – Novo Maquinário",
        "Cliente Novo, Começando a Pesquisar",
        "Contato Ativo",
        "Revenda",
        "Troca de Máquina (Já tem o processo e quer renovar)",
        "Peças para Reposição",
        "Curioso / Estudante (Sem intenção de compra)",
        "Fora de Portfólio (Produto não fabricado pela Tecfag)",
        "Sumiu / Sem Contato (Não atendeu ou não retornou)",
      ]},
    {id:"produto_fabricado", label:"Qual o produto fabricado?", type:"text"},
    {id:"volume",            label:"Volume de produção",        type:"select",
      options:["Baixo Volume","Médio Volume","Alto Volume"]},
  ],

  /* ── Financeiro ────────────────────────────────────────────────── */
  "financeiro": [
    {id:"proposito", label:"Qual o propósito?", type:"select",
      options:["2ª Via Boleto","2ª Via Nota","Outros"]},
  ],

  /* ── Peças ─────────────────────────────────────────────────────── */
  "pecas": [
    {id:"cliente_tecfag", label:"Cliente Tecfag?",          type:"select", options:["Sim","Não"]},
    {id:"maquina",        label:"Peça de qual máquina?",    type:"text"},
    {id:"peca_especifica",label:"Qual peça em específico?", type:"text"},
  ],

  /* ── Outros ────────────────────────────────────────────────────── */
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
interface FagnerNote { id:string; text:string; ts:string; msgRange:string; }
interface CompanyData { nome?:string; cnpj?:string; cidade?:string; bairro?:string; estado?:string; emailEmpresa?:string; tipo?:"Semi"|"Personalitté"|""; credito?:"Sim"|"Não"|""; }
interface ScoreAxis { id:string; label:string; color:string; questions:{id:string;label:string;options:string[]}[]; }
interface Card {
  id:string; name:string; company?:string; channel:Channel;
  aiStatus:AIStatus; progress:number; timeAgo:string; note:string; columnId:string;
  phone?:string; email?:string; cnpjCpf?:string; tipoEmpresa?:string; city?:string; segment?:string;
  aiPausedCard?:boolean;
  companyData?:CompanyData;
  fagnerNotes?:FagnerNote[];
  conversation:WaMsg[];
  funnel: Record<string,string>;
  history: HistoryEvent[];
  scoreData?:{ respostas:Record<string,string>; temperatura:string; pontoTotal:number; engagementScore:number; intentScore:number; avaliadoEm?:string; };
  updatedAt?:string;
}
interface FeedEvent { id:string; ts:string; icon:string; color:string; text:string; sub:string; }
interface Toast { id:string; cardId:string; name:string; company?:string; funnel:string; accent:string; ts:string; }
interface Filters { channels:string[]; statuses:string[]; segments:string[]; }

/* ─── Fagner Notes Seed ──────────────────────────────────────────── */
const SEED_NOTES:Record<string,FagnerNote[]>={
"c1":[{id:"n1",text:"Cliente confirma pedido #4821 não entregue. Tom frustrado mas cooperativo. Ticket aberto, prazo de 2h aceito.",ts:"09:14",msgRange:"msgs 1–6"}],
"c2":[{id:"n1",text:"Insatisfação com atraso de 2 dias. Cupom SANDRA10 aceito com positividade. NPS enviado — aguarda resposta.",ts:"09:21",msgRange:"msgs 1–6"}],
"c3":[{id:"n1",text:"Interesse real em pastor industrial PI-Series 400 para linha 80m. Alta urgência. Consultor Marcos notificado.",ts:"08:59",msgRange:"msgs 1–4"}],
"c4":[{id:"n1",text:"Cotação de 15 bancas BD-90 para feiras ao ar livre. Orçamento R$4.305 gerado. Aguardando frete Campinas.",ts:"09:21",msgRange:"msgs 1–6"}],
"c5":[{id:"n1",text:"Hugo quer 2x NEC-5000 380V trifásico. Urgência alta. Estoque verificado, preço em análise.",ts:"09:19",msgRange:"msgs 1–4"}],
"c6":[{id:"n1",text:"Catálogo combo digital+A5 para doçaria. Estilo colorido. Briefing enviado. Designer notificado para retorno em 24h.",ts:"09:11",msgRange:"msgs 1–6"}],
"c7":[{id:"n1",text:"Rebranding completo: luxury minimal preto e dourado. Briefing parcial coletado. Reunião com diretora de arte agendada.",ts:"09:20",msgRange:"msgs 1–4"}],
"c8":[{id:"n1",text:"Boleto R$3.420 venc. 05/05 renegociado. 3x sem juros aceito. 3 boletos gerados, inadimplência regularizada.",ts:"09:07",msgRange:"msgs 1–6"}],
"c9":[{id:"n1",text:"Dívida R$8.700 em aberto. Parcelamento 6x solicitado. Proposta enviada para aprovação gerencial até amanhã 18h.",ts:"09:21",msgRange:"msgs 1–5"}],
"c10":[{id:"n1",text:"Reposição urg. faca rasadora FR-500. Estoque ok. Pedido #7291 gerado, boleto enviado, entrega 14/05 Mauá-SP.",ts:"09:05",msgRange:"msgs 1–4"}],
"c11":[{id:"n1",text:"Confirmação do orç. #3301: 4x SB-22, 2x cabo 6mm, 1x manete Johnson. Frete expresso até 16/05 Curitiba.",ts:"09:06",msgRange:"msgs 1–6"}],
"c12":[{id:"n1",text:"Interesse genérico pela plataforma. Material institucional enviado. Encaminhada para equipe comercial — retorno 1 dia útil.",ts:"09:22",msgRange:"msgs 1–4"}],
"c13":[{id:"n1",text:"Cliente fala em encapsulamento, mas também mencionou 'embalagem personalizada'. Pode ser Máquinas ou Personalitté. Aguardando mais detalhes.",ts:"09:31",msgRange:"msgs 1–4"}],
"c14":[{id:"n1",text:"Solicitou 'suporte técnico' sem detalhar. Pode ser Peças (componente quebrado) ou Pós Venda (problema com pedido). Triagem em andamento.",ts:"09:38",msgRange:"msgs 1–3"}],
};

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

  { id:"c13", name:"Marcos Viana", company:"Cápsulas Prime", channel:"WhatsApp", aiStatus:"analyzing", progress:28, timeAgo:"há 3 min", note:"Possível Máquinas ou Personalitté.", columnId:"triagem", phone:"+55 11 97744-2200", email:"marcos@capsulasprime.com", city:"Campinas – SP", segment:"Indústria",
    funnel:{assunto:"Encapsulamento de suplementos com embalagem personalizada",funil_provavel:"Ainda não identificado",obs_triagem:"Cliente cita tanto máquina de encapsular quanto design da embalagem. Precisa de mais info para classificar."},
    history:[
      {time:"09:28",type:"entry",   label:"Lead capturado via WhatsApp",     detail:"Mensagem recebida, conteúdo ambíguo detectado"},
      {time:"09:28",type:"ai",      label:"Fagner iniciou triagem",      detail:"Não foi possível classificar no primeiro contato"},
      {time:"09:29",type:"stage",   label:"Entrou em Triagem",               detail:"Aguardando mais informações para direcionar ao funil correto"},
      {time:"09:31",type:"pending", label:"Classificação pendente",          detail:"Possível Máquinas ou Personalitté — triagem em andamento"},
    ],
    conversation:[
      {from:"client",text:"Olá, quero produzir cápsulas de whey com embalagem diferenciada",time:"09:28"},
      {from:"ai",text:"Olá Marcos! 👋 Para cápsulas, posso ajudar tanto com *máquinas encapsuladoras* quanto com o *design da embalagem*. Pode me dizer qual é sua prioridade principal?",time:"09:29"},
      {from:"client",text:"Os dois, na verdade. Quero uma linha completa",time:"09:30"},
      {from:"ai",text:"Entendido! Vou coletar mais detalhes para direcionar você ao especialista certo. Qual é o volume mensal de produção que você prevê?",time:"09:31"},
    ] },

  { id:"c14", name:"Renata Souza", company:"TechPack Ind.", channel:"Site", aiStatus:"analyzing", progress:18, timeAgo:"há 8 min", note:"Possível Peças ou Pós Venda.", columnId:"triagem", phone:"+55 19 98822-0033", email:"renata@techpack.ind", city:"Jundiaí – SP", segment:"Indústria",
    funnel:{assunto:"Suporte técnico urgente",funil_provavel:"Ainda não identificado",obs_triagem:"Solicitou 'suporte técnico urgente', sem especificar se é peça quebrada ou problema com pedido. Aguardando clareza."},
    history:[
      {time:"09:30",type:"entry",   label:"Lead capturado via Site",         detail:"Formulário de suporte recebido — urgência declarada"},
      {time:"09:30",type:"ai",      label:"Fagner iniciou triagem",      detail:"Contexto insuficiente para classificar automaticamente"},
      {time:"09:31",type:"stage",   label:"Entrou em Triagem",               detail:"Pode ser Peças ou Pós Venda — coletando informações"},
      {time:"09:38",type:"pending", label:"Classificação pendente",          detail:"Aguardando retorno do cliente sobre natureza do problema"},
    ],
    conversation:[
      {from:"client",text:"Preciso de suporte técnico urgente com minha máquina",time:"09:30"},
      {from:"ai",text:"Olá Renata! ⚡ Entendo a urgência. Para te direcionar ao setor certo, pode me informar: o problema é com uma *peça específica* (desgaste/quebra) ou está relacionado a um *pedido anterior* (entrega/instalação)?",time:"09:31"},
      {from:"client",text:"Não sei ao certo, parou de funcionar ontem",time:"09:37"},
      {from:"ai",text:"Compreendo! Vou acionar nossa equipe técnica enquanto verifico o histórico. Qual é o modelo da sua máquina?",time:"09:38"},
    ] },
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
function relativeTime(iso:string):string{const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"há instantes";if(m<60)return`há ${m} min`;const h=Math.floor(m/60);if(h<24)return`há ${h}h`;return`há ${Math.floor(h/24)} dias`;}
function scoreRespostasFromApi(score:any):Record<string,string>{const r:Record<string,string>={};["necessidade","urgencia","decisor","engajamento","avanco"].forEach(k=>{if(score?.[k]!=null)r[k]=String(score[k]);});return r;}
function apiCardToCard(c:any):Card{
  const respostas=scoreRespostasFromApi(c.score);
  const companyData: CompanyData = {
    nome: c.company || "",
    cnpj: c.cnpjCpf || "",
    cidade: c.city || "",
    bairro: c.bairro || "",
    estado: c.estado || "",
    emailEmpresa: c.emailEmpresa || "",
    tipo: c.tipoEmpresa || "",
    credito: c.credito || "Não",
  };
  const fagnerNotes = Array.isArray(c.fagnerNotes) && c.fagnerNotes.length > 0
    ? c.fagnerNotes.map((n: any) => ({
        id: n.id,
        text: n.text,
        ts: relativeTime(n.createdAt),
        msgRange: n.msgRange,
      }))
    : (SEED_NOTES[c.id] || []);

  return {
    id:c.id,
    name:c.name,
    company:c.company,
    channel:(c.channel as Channel)||"WhatsApp",
    aiStatus:(c.aiStatus as AIStatus)||"done",
    progress:c.progress??100,
    timeAgo:relativeTime(c.createdAt||new Date().toISOString()),
    note:c.note??"",
    columnId:c.columnId||"pos-venda",
    phone:c.phone,
    email:c.email,
    cnpjCpf:c.cnpjCpf,
    tipoEmpresa:c.tipoEmpresa,
    city:c.city,
    segment:c.segment,
    funnel:c.funnel??{},
    history:[],
    conversation:[],
    companyData,
    fagnerNotes,
    updatedAt: c.updatedAt || c.createdAt,
    scoreData:Object.keys(respostas).length>0?{
      respostas,
      temperatura:"",
      pontoTotal:Object.values(respostas).reduce((s:number,v:string)=>s+parseInt(v||"0"),0),
      engagementScore:0,
      intentScore:0
    }:undefined
  };
}

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
function isSlaViolated(card: Card): boolean {
  const columnsWithSla = ["triagem", "pos-venda", "maquinas", "personalite", "pecas"];
  if (!columnsWithSla.includes(card.columnId)) return false;
  
  const lastActive = card.updatedAt ? new Date(card.updatedAt).getTime() : 0;
  if (!lastActive) return false;

  const fourHoursMs = 4 * 60 * 60 * 1000;
  return (Date.now() - lastActive) > fourHoursMs;
}

/* ─── Kanban card ────────────────────────────────────────────────── */
function KCard({card,accent,onClick,paused,visible}:{card:Card;accent:string;onClick:()=>void;paused:boolean;visible:boolean}){
  const active=card.aiStatus!=="done";
  const slaViolated = isSlaViolated(card);
  return(
    <div
      onClick={visible?onClick:undefined}
      className="kcard"
      style={{
        background:"#fff",
        border: slaViolated
          ? `1.5px solid ${accent}`
          : active&&!paused
          ? `1.5px solid ${accent}35`
          : "1.5px solid #e2e8f0",
        borderRadius:12,padding:"12px 13px",marginBottom:visible?8:0,
        boxShadow: slaViolated
          ? `0 0 12px ${accent}30`
          : active&&!paused
          ? `0 2px 12px ${accent}12`
          : "0 1px 4px rgba(0,0,0,0.05)",
        transition:"opacity 0.3s ease,transform 0.3s cubic-bezier(0.4,0,0.2,1),max-height 0.35s ease,margin 0.3s ease,border-color 0.25s,box-shadow 0.25s",
        position:"relative",overflow:"hidden",cursor:visible?"pointer":"default",
        opacity:visible?1:0,
        transform:visible?"translateY(0) scale(1)":"translateY(-6px) scale(0.97)",
        maxHeight:visible?600:0,
        pointerEvents:visible?"auto":"none",
        animation: slaViolated ? `slaPulse-${card.id} 2s infinite ease-in-out` : undefined,
      }}
    >
      <style>{`
        @keyframes slaPulse-${card.id} {
          0% { border-color: ${accent}70; box-shadow: 0 0 4px ${accent}20; }
          50% { border-color: ${accent}; box-shadow: 0 0 14px ${accent}50; }
          100% { border-color: ${accent}70; box-shadow: 0 0 4px ${accent}20; }
        }
      `}</style>
      
      {slaViolated && <div style={{position:"absolute",top:0,left:0,right:0,height:2.5,background:accent,borderRadius:"12px 12px 0 0"}}/>}
      {!slaViolated && active&&!paused&&<div style={{position:"absolute",top:0,left:0,right:0,height:2.5,background:accent,borderRadius:"12px 12px 0 0",opacity:0.7}}/>}
      {!slaViolated && paused&&active&&<div style={{position:"absolute",top:0,left:0,right:0,height:2.5,background:"#e2e8f0",borderRadius:"12px 12px 0 0"}}/>}
      
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:8,background:`${accent}15`,border:slaViolated ? `1px solid ${accent}60` : `1px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:paused?"#94a3b8":accent,flexShrink:0,transition:"color 0.3s"}}>{initials(card.name)}</div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",lineHeight:1.2}}>{card.name}</div>
              {slaViolated && (
                <span title="Lead inativo por mais de 4 horas!" style={{fontSize:9,fontWeight:700,background:`${accent}12`,color:accent,border:`1.5px solid ${accent}40`,borderRadius:4,padding:"1px 4.5px",display:"inline-flex",alignItems:"center",gap:2,animation:"pulse 1.5s infinite"}}>
                  ⚠️ SLA
                </span>
              )}
            </div>
            {card.company&&<div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{card.company}</div>}
          </div>
        </div>
        {slaViolated ? <div style={{width:7,height:7,borderRadius:"50%",background:accent,marginTop:3,flexShrink:0,animation:"pulse 1.6s ease-in-out infinite",boxShadow:`0 0 6px ${accent}`}}/>
         : active&&!paused?<div style={{width:7,height:7,borderRadius:"50%",background:accent,marginTop:3,flexShrink:0,animation:"pulse 1.6s ease-in-out infinite",boxShadow:`0 0 6px ${accent}`}}/>
         : paused&&active?<span style={{fontSize:9,color:"#94a3b8",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:20,padding:"1px 6px",marginTop:2}}>⏸ pausado</span>:null}
      </div>

      <p style={{margin:"0 0 8px",fontSize:10.5,color:"#64748b",lineHeight:1.45}}>{card.note}</p>
      <div style={{marginBottom:8}}><ChannelTag channel={card.channel}/></div>
      <div style={{marginBottom:8}}><ProgressBar value={card.progress} color={accent} paused={paused}/></div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <StatusBadge status={card.aiStatus}/>
        <div style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:slaViolated ? accent : "#94a3b8",fontWeight:slaViolated ? 700 : 400}}>
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
function WAWindow({card,accent,onPauseCard}:{card:Card;accent:string;onPauseCard:()=>void}){
  const endRef=useRef<HTMLDivElement>(null);
  const paused=!!card.aiPausedCard;
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[card.id]);
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f0f2f5"}}>
      <div style={{background:paused?"#374151":"#075E54",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,transition:"background 0.3s"}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:`${accent}40`,border:"2px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{initials(card.name)}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1.2}}>{card.name}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:paused?"#f59e0b":"#25d366",animation:paused?"none":"pulse 1.5s ease-in-out infinite"}}/>
            {paused?"Fagner pausado neste atendimento":"online · via Fagner"}
          </div>
        </div>
        <button onClick={onPauseCard} title={paused?"Retomar Fagner":"Parar Fagner neste atendimento"}
          style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,border:paused?"1.5px solid #fbbf24":"1.5px solid rgba(255,255,255,0.25)",background:paused?"#fef3c7":"rgba(255,255,255,0.12)",cursor:"pointer",fontSize:11,fontWeight:700,color:paused?"#92400e":"#fff",transition:"all 0.2s"}}>
          {paused?(
            <><svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>Retomar</>
          ):(
            <><svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>Parar</>
          )}
        </button>
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

/* ─── History event type from API ───────────────────────────────── */
const HEV_TYPE_MAP:Record<string,HistoryEvent["type"]> = {entry:"entry",edit:"edit" as any,stage:"stage",action:"action",done:"done",score:"action",pending:"pending"};
function HistoryTab({card,accent}:{card:Card;accent:string}){
  const [events,setEvents]=useState<HistoryEvent[]>(card.history);
  const [loading,setLoading]=useState(card.history.length===0);
  useEffect(()=>{
    setLoading(true);
    fetch(`/api/fc/cards/${card.id}/history`,{credentials:"include"})
      .then(r=>r.ok?r.json():Promise.reject())
      .then((data:any[])=>{
        setEvents(data.map(e=>({time:new Date(e.createdAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),label:e.label,detail:e.detail??"",type:HEV_TYPE_MAP[e.type]??"action",author:e.author})));
        setLoading(false);
      }).catch(()=>{setEvents(card.history);setLoading(false);});
  },[card.id]);
  const lastType=events[events.length-1]?.type;
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f8fafc"}}>
      <div style={{padding:"14px 20px",borderBottom:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:9,background:`${accent}12`,border:`1.5px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Histórico de Interações</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>{loading?"Carregando...":`${events.length} eventos · auditoria completa`}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:20,background:lastType==="done"?"#dcfce7":lastType==="pending"?"#fef3c7":"#f1f5f9",color:lastType==="done"?"#059669":lastType==="pending"?"#b45309":"#64748b",border:`1px solid ${lastType==="done"?"#bbf7d0":lastType==="pending"?"#fde68a":"#e2e8f0"}`}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:lastType==="done"?"#059669":lastType==="pending"?"#f59e0b":"#94a3b8",animation:lastType==="pending"?"pulse 1.5s ease-in-out infinite":"none"}}/>
          {lastType==="done"?"Concluído":lastType==="pending"?"Em andamento":"Em triagem"}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
        {loading&&<div style={{textAlign:"center",padding:32,color:"#94a3b8",fontSize:12}}>Carregando histórico...</div>}
        {!loading&&events.length===0&&<div style={{textAlign:"center",padding:32,color:"#94a3b8",fontSize:12}}>Nenhum evento registrado ainda.</div>}
        {!loading&&<div style={{position:"relative"}}>
          <div style={{position:"absolute",left:17,top:8,bottom:8,width:1.5,background:"linear-gradient(to bottom,#e2e8f0,#e2e8f0 80%,transparent)",borderRadius:2}}/>
          {events.map((ev,i)=>{
            const cfg=HEV_CFG[ev.type]??HEV_CFG.action;
            const isLast=i===events.length-1;
            return(
              <div key={i} style={{display:"flex",gap:14,marginBottom:isLast?0:20,animation:`fieldIn 0.25s ease ${i*0.05}s both`,position:"relative"}}>
                <div style={{flexShrink:0,width:35,display:"flex",justifyContent:"center"}}>
                  <div style={{width:34,height:34,borderRadius:10,background:cfg.bg,border:`2px solid ${cfg.color}30`,display:"flex",alignItems:"center",justifyContent:"center",color:cfg.color,zIndex:1,position:"relative"}}>{cfg.icon}</div>
                </div>
                <div style={{flex:1,paddingTop:5}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#1e293b",lineHeight:1.3}}>{ev.label}</span>
                    <span style={{fontSize:10,color:"#94a3b8",flexShrink:0,marginTop:1}}>{ev.time}</span>
                  </div>
                  <p style={{margin:0,fontSize:11,color:"#64748b",lineHeight:1.5}}>{ev.detail}</p>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"1px 7px",borderRadius:20,fontSize:9.5,fontWeight:700,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}20`}}>
                      {{entry:"Entrada",ai:"Fagner",stage:"Funil",action:"Ação",done:"Concluído",pending:"Pendente",edit:"Edição",score:"Score"}[ev.type]??ev.type}
                    </span>
                    {(ev as any).author&&<span style={{fontSize:9,color:"#94a3b8"}}>por {(ev as any).author}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>}
      </div>
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

/* ─── Score questions (5 perguntas, opções 1–5) ─────────────────── */
interface ScoreQuestion { id:string; categoria:string; color:string; pergunta:string; opcoes:string[]; }
const SCORE_QUESTIONS: ScoreQuestion[] = [
  { id:"necessidade", categoria:"NECESSIDADE", color:"#E5232A",
    pergunta:"O cliente já possui aplicação, produto e capacidade desejada definidos para a máquina?",
    opcoes:[
      "Quer apenas saber preço ou cotação genérica",
      "Sabe a máquina de interesse, mas não sabe dimensionar a necessidade",
      "Tem aplicação definida, mas faltam informações técnicas importantes",
      "Tem aplicação e parâmetros principais definidos",
      "Tem escopo completo e pronto para proposta",
    ]},
  { id:"urgencia", categoria:"URGÊNCIA", color:"#d97706",
    pergunta:"Existe urgência ou prazo real para decisão?",
    opcoes:[
      "Sem prazo e sem urgência",
      "Interesse futuro, sem previsão",
      "Previsão aproximada",
      "Prazo provável de decisão",
      "Urgência real com prazo definido",
    ]},
  { id:"decisor", categoria:"DECISOR / INVESTIMENTO", color:"#2563eb",
    pergunta:"Sabemos quem participa da decisão de compra e se há capacidade ou previsão de investimento?",
    opcoes:[
      "Não sabemos quem decide, nem se há verba",
      "Existe contato, mas sem clareza sobre decisão e orçamento",
      "Parte da decisão ou investimento está mapeada",
      "Decisão bem direcionada, mesmo com contato intermediário",
      "Decisão, influência, orçamento e próximo passo estão claros",
    ]},
  { id:"engajamento", categoria:"ENGAJAMENTO", color:"#059669",
    pergunta:"O cliente está engajado com a tratativa?",
    opcoes:[
      "Não responde",
      "Baixa intenção",
      "Responde de forma irregular",
      "Boa interação e abertura",
      "Responde rápido, envia dados e avança",
    ]},
  { id:"avanco", categoria:"AVANÇO CONCRETO", color:"#7c3aed",
    pergunta:"A oportunidade teve avanço concreto recente?",
    opcoes:[
      "Parada, sem próxima ação",
      "Pouco avanço",
      "Algum movimento",
      "Avanço recente com próxima etapa definida",
      "Avanço claro, com próxima ação, data e objetivo registrados",
    ]},
];

function calcScoreRating(resps:Record<string,string>):{rating:number;total:number;answered:number}{
  let total=0,answered=0;
  SCORE_QUESTIONS.forEach(q=>{const v=parseInt(resps[q.id]??"0");if(v>=1&&v<=5){total+=v;answered++;}});
  const rating=total<=9?1:total<=14?2:total<=18?3:total<=22?4:5;
  return {rating,total,answered};
}

const RATING_CFG:{[k:number]:{label:string;emoji:string;color:string;bg:string;border:string;desc:string}} = {
  0:{label:"Sem avaliação",emoji:"⏳",color:"#94a3b8",bg:"#f8fafc",border:"#e2e8f0",desc:"Responda as perguntas para calcular o score."},
  1:{label:"P1 — Frio",   emoji:"❄️",color:"#64748b",bg:"#f8fafc",border:"#e2e8f0",desc:"Lead sem qualificação. Acompanhamento baixo."},
  2:{label:"P2 — Morno",  emoji:"🌡️",color:"#d97706",bg:"#fffbeb",border:"#fde68a",desc:"Potencial baixo. Nutrir com informações."},
  3:{label:"P3 — Ativo",  emoji:"🟠",color:"#ea580c",bg:"#fff7ed",border:"#fed7aa",desc:"Potencial médio. Requer acompanhamento ativo."},
  4:{label:"P4 — Quente", emoji:"🔥",color:"#dc2626",bg:"#fef2f2",border:"#fecaca",desc:"Alta probabilidade. Priorizar contato comercial."},
  5:{label:"P5 — Urgente",emoji:"🚀",color:"#7c3aed",bg:"#f5f3ff",border:"#ddd6fe",desc:"Decisão iminente. Ação imediata necessária."},
};

/* ─── Score Tab ──────────────────────────────────────────────────── */
function ScoreTab({card,accent,scoreRespostas,onEdit}:{card:Card;accent:string;scoreRespostas:Record<string,string>;onEdit:(qId:string,val:string)=>void}){
  const merged={...(card.scoreData?.respostas??{}),...scoreRespostas};
  const {rating,total,answered}=calcScoreRating(merged);
  const rcfg=RATING_CFG[answered===5?rating:0];
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f8fafc"}}>
      <div style={{padding:"14px 20px",borderBottom:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:10,background:`${accent}12`,border:`1.5px solid ${accent}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Score de Qualificação Comercial</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{answered}/5 respondidas · Escala P1–P5</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderRadius:20,background:rcfg.bg,border:`1.5px solid ${rcfg.border}`}}>
            <span style={{fontSize:15}}>{rcfg.emoji}</span>
            <div>
              <div style={{fontSize:11,fontWeight:800,color:rcfg.color,lineHeight:1}}>{rcfg.label}</div>
              {answered===5&&<div style={{fontSize:9,color:rcfg.color,opacity:0.7,marginTop:1}}>{total} pts</div>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:4}}>
          {SCORE_QUESTIONS.map(q=>{const v=parseInt(merged[q.id]??"0");const done=v>=1&&v<=5;return(<div key={q.id} style={{flex:1,height:4,borderRadius:99,background:done?q.color:"#e2e8f0",transition:"background 0.3s"}}/>);})}
        </div>
        {answered===5&&(
          <div style={{marginTop:10,display:"flex",gap:6}}>
            {SCORE_QUESTIONS.map(q=>{const v=parseInt(merged[q.id]??"0");return(
              <div key={q.id} style={{flex:1,background:"#f8fafc",border:"1.5px solid #e2e8f0",borderTop:`3px solid ${q.color}`,borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
                <div style={{fontSize:8,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{q.categoria.split(" ")[0]}</div>
                <div style={{fontSize:18,fontWeight:800,color:q.color,lineHeight:1}}>{v}</div>
                <div style={{fontSize:8,color:"#94a3b8"}}>/5</div>
              </div>
            );})}
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"14px 20px",display:"flex",flexDirection:"column",gap:14}}>
        {SCORE_QUESTIONS.map((q,qi)=>{
          const selNum=parseInt(merged[q.id]??"0");
          return(
            <div key={q.id} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderLeft:`3px solid ${q.color}`,borderRadius:10,overflow:"hidden",flexShrink:0}}>
              <div style={{padding:"7px 14px",background:`${q.color}08`,borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:10,fontWeight:800,color:q.color,textTransform:"uppercase",letterSpacing:"0.1em"}}>{q.categoria}</span>
                <span style={{fontSize:9,color:"#94a3b8"}}>Pergunta {qi+1} de 5</span>
              </div>
              <div style={{padding:"10px 14px 8px",borderBottom:"1px solid #f8fafc"}}>
                <p style={{margin:0,fontSize:12,fontWeight:600,color:"#0f172a",lineHeight:1.5}}>{q.pergunta}</p>
              </div>
              {q.opcoes.map((opt,oi)=>{
                const num=oi+1;const isSel=selNum===num;
                return(
                  <div key={oi} onClick={()=>onEdit(q.id,isSel?"":String(num))}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"9px 14px",borderBottom:oi<4?"1px solid #f8fafc":"none",cursor:"pointer",background:isSel?`${q.color}08`:"transparent",transition:"background 0.15s"}}
                    onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background="#f8fafc";}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isSel?`${q.color}08`:"transparent";}}>
                    <div style={{width:22,height:22,borderRadius:7,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,background:isSel?q.color:"#f1f5f9",color:isSel?"#fff":"#94a3b8",border:`1.5px solid ${isSel?q.color:"#e2e8f0"}`,transition:"all 0.18s"}}>{num}</div>
                    <span style={{fontSize:11,color:isSel?"#0f172a":"#475569",fontWeight:isSel?600:400,lineHeight:1.4,flex:1}}>{opt}</span>
                    {isSel&&<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={q.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{padding:"10px 20px",borderTop:"1.5px solid #f1f5f9",background:"#fff",flexShrink:0,display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:rcfg.color,flexShrink:0}}/>
        <span style={{fontSize:10,color:"#64748b"}}>{rcfg.desc}</span>
      </div>
    </div>
  );
}


/* ─── Company Panel ──────────────────────────────────────────────── */
function CompanyPanel({company,onClose,accent,onSave}:{company?:CompanyData;onClose:()=>void;accent:string;onSave:(data:CompanyData)=>void}){
  const [data,setData]=useState<CompanyData>(company??{});
  const update=(k:keyof CompanyData,v:string)=>setData(p=>({...p,[k]:v}));
  const fields:Array<{key:keyof CompanyData;label:string;type:"text"|"toggle";opts?:string[]}>= [
    {key:"nome",label:"Nome da empresa",type:"text"},
    {key:"cnpj",label:"CNPJ",type:"text"},
    {key:"cidade",label:"Cidade",type:"text"},
    {key:"bairro",label:"Bairro",type:"text"},
    {key:"estado",label:"Estado",type:"text"},
    {key:"emailEmpresa",label:"E-mail",type:"text"},
    {key:"tipo",label:"Tipo",type:"toggle",opts:["Semi","Personalitté"]},
    {key:"credito",label:"Crédito",type:"toggle",opts:["Sim","Não"]},
  ];
  return(
    <div style={{position:"absolute",top:0,right:0,bottom:0,width:290,background:"#fff",boxShadow:"-6px 0 32px rgba(0,0,0,0.14)",borderLeft:"1.5px solid #e2e8f0",zIndex:10,display:"flex",flexDirection:"column",animation:"slideRight 0.24s cubic-bezier(0.4,0,0.2,1)"}}>
      <div style={{padding:"13px 16px",borderBottom:"1.5px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:"linear-gradient(135deg,#1e293b,#0f172a)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:8,background:`${accent}20`,border:`1.5px solid ${accent}40`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div><div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>Dados da Empresa</div><div style={{fontSize:10,color:"#64748b"}}>Preenchido pelo Fagner</div></div>
        </div>
        <button onClick={onClose} style={{width:26,height:26,borderRadius:7,border:"1px solid #334155",background:"#1e293b",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
        </button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
        {fields.map(f=>(
          <div key={f.key}>
            <label style={{display:"block",fontSize:9.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{f.label}</label>
            {f.type==="toggle"&&f.opts?(
              <div style={{display:"flex",gap:5}}>
                {f.opts.map(opt=>(
                  <button key={opt} onClick={()=>update(f.key,data[f.key]===opt?"":opt as any)}
                    style={{flex:1,padding:"5px 0",borderRadius:8,border:`1.5px solid ${data[f.key]===opt?accent:"#e2e8f0"}`,background:data[f.key]===opt?`${accent}12`:"#f8fafc",fontSize:11,fontWeight:data[f.key]===opt?700:400,color:data[f.key]===opt?accent:"#64748b",cursor:"pointer",transition:"all 0.15s"}}>
                    {opt}
                  </button>
                ))}
              </div>
            ):(
              <input value={(data[f.key] as string)??""}  onChange={e=>update(f.key,e.target.value)} placeholder={f.label}
                style={{width:"100%",fontSize:12,color:"#1e293b",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 10px",background:"#f8fafc",boxSizing:"border-box",transition:"border 0.15s"}}
                onFocus={e=>(e.target.style.borderColor=accent)} onBlur={e=>(e.target.style.borderColor="#e2e8f0")}/>
            )}
          </div>
        ))}
      </div>
      <div style={{padding:"10px 16px",borderTop:"1.5px solid #f1f5f9",flexShrink:0}}>
        <button onClick={()=>{onSave(data);onClose();}} style={{width:"100%",padding:"8px",borderRadius:9,border:"none",background:accent,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Salvar dados</button>
      </div>
    </div>
  );
}

/* ─── Client Modal (with tabs) ───────────────────────────────────── */
type ModalTab = "conversa"|"funil"|"historico"|"score";

function ClientModal({card,accent,onClose,funnelData,onFunnelEdit,onAIFill,onContactEdit,onScoreSave,onPauseCard,onCompanySave}:{
  card:Card; accent:string; onClose:()=>void;
  funnelData:Record<string,string>;
  onFunnelEdit:(fieldId:string,val:string)=>void;
  onAIFill:()=>void;
  onContactEdit:(field:string,val:string)=>void;
  onScoreSave:(respostas:Record<string,string>)=>void;
  onPauseCard:()=>void;
  onCompanySave:(data:CompanyData)=>void;
}){
  const [tab, setTab] = useState<ModalTab>("conversa");
  const [scoreRespostas, setScoreRespostas] = useState<Record<string,string>>({});
  const seg=SEG_COL[card.segment??""]??{bg:"#f1f5f9",text:"#475569"};
  const fields=FUNNEL_FIELDS[card.columnId]??[];
  const filled=fields.filter(f=>{const v=funnelData[f.id]??"";return v&&v!=="—";}).length;

  // Init score respostas from card
  useEffect(()=>{ setTab("conversa"); setScoreRespostas({...(card.scoreData?.respostas??{})}); },[card.id]);

  const onCloseRef = useRef(onClose);
  useEffect(()=>{ onCloseRef.current=onClose; });
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key==="Escape")onCloseRef.current();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  // Inline edit state for sidebar contact fields
  const [editingField,setEditingField]=useState<string|null>(null);
  const [editDraft,setEditDraft]=useState("");
  const [companyOpen,setCompanyOpen]=useState(false);
  const startFieldEdit=(field:string,cur:string)=>{setEditingField(field);setEditDraft(cur);};
  const commitFieldEdit=()=>{if(editingField){onContactEdit(editingField,editDraft);setEditingField(null);}};

  const scoreAnswered=SCORE_QUESTIONS.filter(q=>{const v=parseInt(scoreRespostas[q.id]??"0");return v>=1&&v<=5;}).length;
  const prevScoreAnswered=useRef(scoreAnswered);
  useEffect(()=>{if(scoreAnswered===5&&prevScoreAnswered.current<5){onScoreSave(scoreRespostas);}prevScoreAnswered.current=scoreAnswered;},[scoreAnswered]);


  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 20px",animation:"fadeIn 0.18s ease"}}>
      
      {/* Botão aba: colado na parede esquerda do modal, sobrepondo-a */}
      <button onClick={()=>setCompanyOpen(o=>!o)} title="Dados da empresa"
        style={{position:"fixed",top:"50%",right:`calc(50% + min(540px, 50vw - 20px) - 6px)`,transform:"translateY(-50%)",zIndex:10001,width:34,height:88,borderRadius:"10px 0 0 10px",border:`1.5px solid ${companyOpen?accent+"80":"rgba(255,255,255,0.22)"}`,borderRight:"none",background:companyOpen?accent:"rgba(20,30,50,0.72)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:companyOpen?"#fff":"rgba(200,210,230,0.85)",transition:"all 0.22s cubic-bezier(0.4,0,0.2,1)",boxShadow:companyOpen?`-4px 0 24px ${accent}55`:"-2px 0 14px rgba(0,0,0,0.28)"}}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span style={{fontSize:8,fontWeight:700,letterSpacing:"0.04em",writingMode:"vertical-lr",transform:"rotate(180deg)",textTransform:"uppercase",opacity:0.85}}>Empresa</span>
      </button>

      {companyOpen&&(
        <div style={{position:"fixed",top:"2vh",height:"96vh",width:290,right:"calc(50% + 552px)",zIndex:10000,animation:"panelSwoop 0.38s cubic-bezier(0.22,1,0.36,1)",display:"flex",flexDirection:"column",borderRadius:16,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
          <CompanyPanel company={card.companyData} onClose={()=>setCompanyOpen(false)} accent={accent} onSave={onCompanySave}/>
        </div>
      )}

      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:1080,height:"96vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 28px 80px rgba(0,0,0,0.24)",animation:"slideUp 0.24s cubic-bezier(0.4,0,0.2,1)",position:"relative"}}>

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
            {(card.columnId === "triagem" || card.aiStatus !== "done") ? (
              <div 
                title="Bloqueado: O card no CRM será criado após a conclusão da triagem!"
                style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#f1f5f9",fontSize:11,fontWeight:600,color:"#94a3b8",cursor:"not-allowed",transition:"all 0.18s"}}
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={11} width={18} height={11} rx={2} ry={2}/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                CRM (Em Triagem)
              </div>
            ) : (
              <a href={`https://app.rdstation.com.br/crm`} target="_blank" rel="noreferrer"
                style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#f8fafc",fontSize:11,fontWeight:600,color:"#475569",textDecoration:"none",cursor:"pointer",transition:"all 0.18s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#f1f5f9";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#f8fafc";}}>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1={10} y1={14} x2={21} y2={3}/></svg>
                Abrir no CRM
              </a>
            )}
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
              {([
                {field:"phone",  path:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.58 4.44 2 2 0 0 1 3.55 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.61-.61a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z", label:card.phone??"—",placeholder:"Telefone"},
                {field:"email",  path:"M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", label:card.email??"—",placeholder:"E-mail"},
                {field:"cnpjCpf",path:"M9 11l3 3L22 4", label:card.cnpjCpf??"CPF/CNPJ —",placeholder:"CPF ou CNPJ"},
                {field:"tipoEmpresa",path:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", label:card.tipoEmpresa??"Tipo —",placeholder:"Tipo de empresa",isCompany:true},
                {field:"city",   path:"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z", label:card.city??"—",placeholder:"Cidade – Estado"},
              ] as {field:string;path:string;label:string;placeholder:string;isCompany?:boolean}[]).map((item)=>{
                const isEd=editingField===item.field;
                return(
                  <div key={item.field} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"#f8fafc",border:"1.5px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={item.path}/></svg>
                    </div>
                    {isEd?(
                      <input autoFocus value={editDraft} onChange={e=>setEditDraft(e.target.value)}
                        onBlur={commitFieldEdit} onKeyDown={e=>{if(e.key==="Enter")commitFieldEdit();if(e.key==="Escape")setEditingField(null);}}
                        style={{flex:1,fontSize:11,color:"#1e293b",border:`1.5px solid ${accent}60`,borderRadius:6,padding:"3px 7px",background:"#fff"}}
                        placeholder={item.placeholder}/>
                    ):(
                      <span onClick={()=>startFieldEdit(item.field,item.label==="—"?"":item.label)}
                        style={{fontSize:11,color:item.label==="—"||item.label.endsWith("—")?"#cbd5e1":"#1e293b",cursor:"pointer",flex:1,borderRadius:5,padding:"2px 4px",transition:"background 0.15s"}}
                        onMouseEnter={e=>(e.currentTarget.style.background=`${accent}08`)}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                        {item.label}
                        <svg style={{marginLeft:4,opacity:0.3,verticalAlign:"middle"}} width={8} height={8} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </span>
                    )}
                  </div>
                );
              })}
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

            {/* Fagner Notes */}
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:6,minHeight:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:18,height:18,borderRadius:5,background:"linear-gradient(135deg,#1e293b,#334155)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </div>
                  <p style={{margin:0,fontSize:10,fontWeight:700,color:"#1e293b",letterSpacing:"0.05em"}}>FAGNER NOTES</p>
                </div>
                {card.fagnerNotes&&card.fagnerNotes.length>0&&<span style={{fontSize:9,color:"#94a3b8",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:20,padding:"1px 7px"}}>{card.fagnerNotes.length} {card.fagnerNotes.length===1?"nota":"notas"}</span>}
              </div>
              {(!card.fagnerNotes||card.fagnerNotes.length===0)&&(
                <div style={{background:"#f8fafc",border:"1.5px dashed #e2e8f0",borderRadius:9,padding:"10px 12px",fontSize:10.5,color:"#94a3b8",lineHeight:1.5,fontStyle:"italic"}}>Fagner anotará resumos a cada 6 mensagens trocadas.</div>
              )}
              {card.fagnerNotes?.map((n,i)=>(
                <div key={n.id} style={{background:"linear-gradient(135deg,#1e293b 0%,#0f172a 100%)",borderRadius:10,padding:"9px 12px",animation:`fieldIn 0.25s ease ${i*0.06}s both`,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:`linear-gradient(to bottom,${accent},${accent}80)`,borderRadius:"10px 0 0 10px"}}/>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,paddingLeft:8}}>
                    <span style={{fontSize:9,fontWeight:700,color:accent,background:`${accent}18`,border:`1px solid ${accent}30`,borderRadius:20,padding:"1px 7px"}}>{n.msgRange}</span>
                    <span style={{fontSize:9,color:"#64748b"}}>{n.ts}</span>
                  </div>
                  <p style={{margin:0,paddingLeft:8,fontSize:11,color:"#e2e8f0",lineHeight:1.55}}>{n.text}</p>
                </div>
              ))}
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
                <WAWindow card={card} accent={accent} onPauseCard={onPauseCard}/>
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
/* ─── Notification tray ──────────────────────────────────────────── */
function NotificationTray({toasts,onDismiss,onSelectCard}:{toasts:Toast[];onDismiss:(id:string)=>void;onSelectCard:(cardId:string)=>void}){
  if(toasts.length===0)return null;
  return(
    <div style={{position:"fixed",bottom:24,right:24,zIndex:400,display:"flex",flexDirection:"column-reverse",gap:8,pointerEvents:"none"}}>
      {toasts.map((t,i)=>(
        <div key={t.id} 
          onClick={(e)=>{
            if((e.target as HTMLElement).closest('button')) return;
            onSelectCard(t.cardId);
            onDismiss(t.id);
          }}
          style={{
            display:"flex",alignItems:"flex-start",gap:10,
            background:"#fff",border:`1.5px solid ${t.accent}30`,
            borderLeft:`3.5px solid ${t.accent}`,
            borderRadius:12,padding:"11px 13px",
            boxShadow:"0 8px 32px rgba(0,0,0,0.13)",
            minWidth:280,maxWidth:320,pointerEvents:"auto",
            animation:"toastIn 0.32s cubic-bezier(0.34,1.56,0.64,1)",
            opacity:1,
            transform:`translateY(${i*-2}px) scale(${1-i*0.015})`,
            transition:"transform 0.2s ease, border-color 0.2s, box-shadow 0.2s",
            cursor:"pointer",
          }}
          onMouseEnter={e=>{
            e.currentTarget.style.borderColor=`${t.accent}60`;
            e.currentTarget.style.boxShadow="0 10px 36px rgba(0,0,0,0.16)";
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.borderColor=`${t.accent}30`;
            e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.13)";
          }}
        >
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
            <div style={{fontSize:10.5,color:t.accent,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:t.accent,display:"inline-block",flexShrink:0}}/>
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
    setToasts(prev=>[{id,cardId:card.id,name:card.name,company:card.company,funnel,accent,ts:nowTime()},...prev].slice(0,5));
    playChime();
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),6000);
  },[playChime]);

  useEffect(()=>{
    const loadCards=()=>fetch("/api/fc/cards",{credentials:"include"})
      .then(r=>r.ok?r.json():Promise.reject())
      .then(async(data:any[])=>{
        if(Array.isArray(data)&&data.length===0){
          // banco vazio: faz seed e recarrega
          await fetch("/api/fc/seed",{method:"POST",credentials:"include"});
          return fetch("/api/fc/cards",{credentials:"include"}).then(r=>r.ok?r.json():Promise.reject());
        }
        return data;
      });
    loadCards()
      .then((data:any[])=>{
        if(Array.isArray(data)&&data.length>0){
          const apiCards=data.map(apiCardToCard);
          const hasTriagem=apiCards.some(c=>c.columnId==="triagem");
          const merged=hasTriagem?apiCards:[...apiCards,...SEED.filter(c=>c.columnId==="triagem")];
          setCards(merged);
        } else {
          setCards(SEED);
        }
        setLoading(false);
      })
      .catch(()=>{const t=setTimeout(()=>{setCards(SEED);setLoading(false);},SK_MS);return()=>clearTimeout(t);});
  },[]);

  useEffect(()=>{
    if(!filterOpen)return;
    const h=(e:MouseEvent)=>{if(filterRef.current&&!filterRef.current.contains(e.target as Node))setFilterOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[filterOpen]);

  const pushEvent=useCallback((ev:Omit<FeedEvent,"id"|"ts">)=>{
    setEvents(prev=>[{...ev,id:String(++eventId.current),ts:nowTime()},...prev].slice(0,40));
  },[]);

  const handleSelectCardById = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (card) {
      setSelected(card);
    }
  }, [cards]);

  // WebSocket live sync para atualizações do CRM (Card e Notas)
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = WS_URL
      ? `${WS_URL}/ws/chat`
      : `${protocol}//${window.location.host}/ws/chat`;

    let socket: WebSocket | null = null;
    let reconnectTimeout: number | null = null;

    function connect() {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "CRM_CARD_UPDATED" && data.card) {
            const updatedCard = apiCardToCard(data.card);
            
            setCards(prev => prev.map(c => c.id === updatedCard.id ? { ...c, ...updatedCard } : c));
            setSelected(prev => prev?.id === updatedCard.id ? { ...prev, ...updatedCard } : prev);
            
            pushEvent({
              icon: "🔄",
              color: "#3b82f6",
              text: `Empresa atualizada: ${updatedCard.name}`,
              sub: `Os dados de ${updatedCard.name} foram sincronizados em tempo real.`
            });
          }
          
          if (data.type === "CRM_NOTE_ADDED" && data.note && data.cardId) {
            const newNote: FagnerNote = {
              id: data.note.id,
              text: data.note.text,
              ts: "Agora",
              msgRange: data.note.msgRange || "msgs 1-6"
            };

            setCards(prev => prev.map(c => {
              if (c.id === data.cardId) {
                const currentNotes = c.fagnerNotes || [];
                const alreadyExists = currentNotes.some(n => n.id === newNote.id);
                if (alreadyExists) return c;
                return { ...c, fagnerNotes: [newNote, ...currentNotes] };
              }
              return c;
            }));

            setSelected(prev => {
              if (prev?.id === data.cardId) {
                const currentNotes = prev.fagnerNotes || [];
                const alreadyExists = currentNotes.some(n => n.id === newNote.id);
                if (alreadyExists) return prev;
                return { ...prev, fagnerNotes: [newNote, ...currentNotes] };
              }
              return prev;
            });

            pushEvent({
              icon: "📝",
              color: "#10b981",
              text: `Nota do Fagner adicionada`,
              sub: `Nova análise de conversa adicionada para este lead.`
            });
          }
        } catch (e) {
          /* ignore json parsing errors */
        }
      };

      socket.onclose = () => {
        reconnectTimeout = window.setTimeout(connect, 5000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [pushEvent]);

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
          const nsDone = next >= 100;
          if(nsDone){
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
    fetch(`/api/fc/cards/${cardId}/funnel`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({[fieldId]:val})}).catch(()=>{});
  };

  const handleAIFill=(cardId:string)=>{
    const card=cards.find(c=>c.id===cardId);
    if(!card)return;
    pushEvent({icon:"🤖",color:RED,text:`IA preencheu funil: ${card.name}`,sub:`Funil ${COLUMNS.find(c=>c.id===card.columnId)?.label}`});
  };

  const handleCardFieldEdit=useCallback((cardId:string,field:string,val:string)=>{
    setCards(prev=>prev.map(c=>c.id===cardId?{...c,[field]:val}:c));
    setSelected(prev=>prev?.id===cardId?{...prev,[field]:val}:prev);
    fetch(`/api/fc/cards/${cardId}`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({[field]:val})}).catch(()=>{});
  },[]);

  const handleCompanySave=useCallback((cardId:string,companyData:CompanyData)=>{
    const backendData = {
      company: companyData.nome,
      cnpjCpf: companyData.cnpj,
      city: companyData.cidade,
      bairro: companyData.bairro,
      estado: companyData.estado,
      emailEmpresa: companyData.emailEmpresa,
      tipoEmpresa: companyData.tipo,
      credito: companyData.credito,
    };

    setCards(prev=>prev.map(c=>c.id===cardId?{...c, company: companyData.nome, cnpjCpf: companyData.cnpj, city: companyData.cidade, tipoEmpresa: companyData.tipo, companyData }:c));
    setSelected(prev=>prev?.id===cardId?{...prev, company: companyData.nome, cnpjCpf: companyData.cnpj, city: companyData.cidade, tipoEmpresa: companyData.tipo, companyData }:prev);

    fetch(`/api/fc/cards/${cardId}`,{
      method:"PATCH",
      credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(backendData)
    }).catch(()=>{});
  },[]);

  const handleScoreSave=useCallback((cardId:string,respostas:Record<string,string>)=>{
    const body:Record<string,number|null>={};
    ["necessidade","urgencia","decisor","engajamento","avanco"].forEach(k=>{body[k]=respostas[k]?parseInt(respostas[k]):null;});
    fetch(`/api/fc/cards/${cardId}/score`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(r=>r.ok?r.json():null)
      .then(score=>{if(!score)return;const r=scoreRespostasFromApi(score);const tot=Object.values(r).reduce((s:number,v:string)=>s+parseInt(v||"0"),0);const sd={respostas:r,temperatura:"",pontoTotal:tot,engagementScore:0,intentScore:0};setCards(prev=>prev.map(c=>c.id===cardId?{...c,scoreData:sd}:c));setSelected(prev=>prev?.id===cardId?{...prev,scoreData:sd}:prev);})
      .catch(()=>{});
  },[]);

  const handlePauseCard=useCallback((cardId:string)=>{
    setCards(prev=>prev.map(c=>c.id===cardId?{...c,aiPausedCard:!c.aiPausedCard}:c));
    setSelected(prev=>prev?.id===cardId?{...prev,aiPausedCard:!prev.aiPausedCard}:prev);
  },[]);

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
        @keyframes slideRight { from{opacity:0;transform:translateX(100%)} to{opacity:1;transform:translateX(0)} }
        @keyframes slideLeft  { from{opacity:0;transform:translateX(-100%)} to{opacity:1;transform:translateX(0)} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes panelRise  { from{opacity:0;transform:translateY(40px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes panelSwoop { from{opacity:0;transform:translateX(860px) translateY(50px) scale(0.88)} to{opacity:1;transform:translateX(0) translateY(0) scale(1)} }
        @keyframes panelDown  { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes skShimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes feedSlide  { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes chipIn     { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes msgIn      { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
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
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <img 
            src="/fagnerfil.jfif" 
            alt="Fagner" 
            style={{width:42,height:42,borderRadius:10,border:`1.5px solid ${paused ? "#cbd5e1" : RED}`,boxShadow:paused ? "0 2px 8px rgba(0,0,0,0.05)" : `0 2px 8px ${RED}20`,transition:"border-color 0.3s"}}
          />
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:800,letterSpacing:"-0.5px",color:"#0f172a"}}>Fagner Conversas</h1>
            <p style={{margin:"1px 0 0",fontSize:11,color:"#94a3b8"}}>Operado em tempo real pela inteligência, sem intervenção humana.</p>
          </div>
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




      {/* ── Board ── */}
      <div style={{flex:1,display:"flex",gap:10,padding:"16px 24px",overflowX:"auto",overflowY:"auto",alignItems:"flex-start",paddingRight:feedOpen?310:24,transition:"padding-right 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
        {COLUMNS.map((col,i)=>{
          const colAll=loading?[]:cards.filter(c=>c.columnId===col.id);
          const colVis=loading?[]:filteredCards.filter(c=>c.columnId===col.id);
          const skCount=loading?[...Array(i===1?3:i===0?2:1)]:[];
          return(
            <div key={col.id} style={{flex:"0 0 290px",minWidth:290,animation:`fadein 0.35s ease ${i*0.06}s both`}}>
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
      <NotificationTray toasts={toasts} onDismiss={id=>setToasts(prev=>prev.filter(t=>t.id!==id))} onSelectCard={handleSelectCardById}/>

      {selected&&(
        <ClientModal
          card={selected}
          accent={selAccent}
          onClose={()=>setSelected(null)}
          funnelData={selFunnelData}
          onFunnelEdit={(fieldId,val)=>handleFunnelEdit(selected.id,fieldId,val)}
          onAIFill={()=>handleAIFill(selected.id)}
          onContactEdit={(field,val)=>handleCardFieldEdit(selected.id,field,val)}
          onScoreSave={(respostas)=>handleScoreSave(selected.id,respostas)}
          onPauseCard={()=>handlePauseCard(selected.id)}
          onCompanySave={(companyData)=>handleCompanySave(selected.id,companyData)}
        />
      )}
    </div>
  );
}
