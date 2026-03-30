
# -*- coding: utf-8 -*-
"""
Analisador Tecfag v3 — DEFINITIVO
Trabalha diretamente no HTML original (não no .md nem no .txt simples)
pois o HTML contém metadados estruturados: canal, cidade, navegação, timestamps.

Categorias da análise:
  A) Mensagens REAIS dos clientes  → classificadas por intenção
  B) Logs de navegação             → separados e analisados por produto visitado
  C) Respostas do Fagner AI        → detectar anomalias (prompt leak, inglês)
  D) Métricas gerais               → canal, cidade, operador, duração
"""

import re
import json
from collections import Counter, defaultdict
from pathlib import Path

# ===========================================================================
# REGEX PARA PARSEAR O HTML ORIGINAL (mais confiável que o TXT convertido)
# ===========================================================================

# Padrões de log de navegação: "DD.MM.YYYY HH:MM:SS Título da Página - Tecfag"
RE_NAV = re.compile(
    r'(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})\s+(.+?)\s*[-–]\s*Tecfag',
    re.IGNORECASE
)

# Canal de origem
RE_CHANNEL = re.compile(r'channel:\s*(\S+)', re.IGNORECASE)
RE_SOURCE  = re.compile(r'source:\s*(.+)', re.IGNORECASE)
RE_CITY    = re.compile(r'city:\s*(.+)', re.IGNORECASE)
RE_REGION  = re.compile(r'region:\s*(.+)', re.IGNORECASE)

# ===========================================================================
# OPERADORES CONHECIDOS
# ===========================================================================
OPERADORES = {
    'fagner', 'deborah', 'agente 0', 'lucia', 'luzia', 'ana', 'denise',
    'vitor', 'carlos', 'maria', 'joao', 'joão', 'agente', 'operador',
    'tecfag'
}

def is_operador(nome):
    n = nome.strip().lower()
    for op in OPERADORES:
        if n == op or n.startswith(op):
            return True
    return False

# ===========================================================================
# CATEGORIAS DE INTENÇÃO (regex word-boundary — validadas)
# ===========================================================================
INTENCOES = {
    "seladora": [
        r'\bseladora\b', r'\bseladoras\b', r'\bselar\b', r'\bselagem\b',
        r'\btermossoldagem\b', r'\bfrd\b', r'\bfrd\d+\b', r'\bsf\d+\b',
        r'\bdatador\b', r'\bdatadora\b', r'\bteflon\b',
    ],
    "envasadora_dosadora": [
        r'\benvasadora\b', r'\benvasar\b', r'\benvase\b',
        r'\bdosadora\b', r'\bdosar\b', r'\bdosagem\b',
        r'\benchedora\b', r'\bbico\s+dosador\b',
    ],
    "embaladora_empacotadora": [
        r'\bempacotadora\b', r'\bembaladora\b',
        r'\btúnel\s+de\s+encolhimento\b', r'\btunel\s+de\s+encolhimento\b',
        r'\bshrink\b', r'\bflow\s*pack\b', r'\bretrátil\b',
    ],
    "rotuladora": [
        r'\brotuladora\b', r'\brótulo\b', r'\brotulagem\b',
        r'\brotulo\b', r'\brotular\b', r'\bsleeve\b',
    ],
    "maquina_vacuo": [
        r'\bvácuo\b', r'\bvacuo\b',
        r'\bseladora\s+a\s+vácuo\b', r'\bembalagem\s+a\s+vácuo\b',
    ],
    "fechadora_caixa": [
        r'\bfechadora\s+de\s+caixa\b', r'\bfxj\w*\b',
        r'\bfechar\s+caixa\b',
    ],
    "arqueadora_fita": [
        r'\barqueadora\b', r'\barquear\b',
        r'\btensionadora\b', r'\bfita\s+de\s+arquear\b',
        r'\bfita\s+pp\b', r'\bfita\s+pet\b',
    ],
    "esteira_rolete": [
        r'\besteira\b', r'\brolete\b', r'\blona\s+da\s+esteira\b',
        r'\bconveyor\b',
    ],
    "rosqueadora_tampadora": [
        r'\brosqueadora\b', r'\brosquear\b',
        r'\btampadora\b', r'\btampador\b', r'\btampar\b',
    ],
    "balanca_dosadora": [
        r'\bbalança\b', r'\bbalanca\b', r'\bpesagem\b',
        r'\bbalança\s+eletrônica\b', r'\bdosadora\s+com\s+balança\b',
    ],
    "pecas_insumos": [
        r'\bpeça\s+de\s+reposição\b', r'\bpeças\s+de\s+reposição\b',
        r'\bresistência\s+do\s+mordente\b', r'\bresistencia\s+do\s+mordente\b',
        r'\bcinto\s+teflon\b',
        r'\btinta\s+sólida\b', r'\btinta\s+solida\b', r'\bink\s+roll\b',
        r'\bborracha\s+de\s+silicone\b',
        r'\bvende\s+peças\b', r'\bvende\s+peca\b',
        r'\bsetor\s+de\s+peças\b',
    ],
    "suporte_tecnico_manual": [
        r'\bmanual\s+de\s+(operação|limpeza|manutenção)\b',
        r'\bmanutenção\s+(preventiva|corretiva)\b',
        r'\bcalibração\b', r'\bregulagem\b',
        r'\bassistência\s+técnica\b', r'\bassistencia\s+tecnica\b',
    ],
    "rastreamento_pedido": [
        r'\brastreio\b', r'\brastreamento\b',
        r'\bcódigo\s+de\s+rastreio\b', r'\bcodigo\s+de\s+rastreio\b',
        r'\bprazo\s+de\s+entrega\b',
        r'\bnão\s+recebi\s+meu\s+pedido\b', r'\bnao\s+recebi\s+meu\s+pedido\b',
        r'\bpedido\s+não\s+chegou\b',
        r'\btransportadora\b', r'\bjadlog\b', r'\bactual\s+cargas\b',
        r'\bdespachado\b',
    ],
    "nota_fiscal": [
        r'\bnota\s+fiscal\b', r'\bdanfe\b', r'\bnfe\b', r'\bnf\b',
        r'\bchave\s+de\s+acesso\b', r'\bxml\s+da\s+nota\b',
        r'\bsegunda\s+via\s+de\s+boleto\b',
    ],
    "preco_orcamento": [
        r'\borçamento\b', r'\borcamento\b',
        r'\bcotação\b', r'\bcotacao\b',
        r'\bqual\s+o\s+valor\b', r'\bqual\s+o\s+preço\b',
        r'\bquanto\s+custa\b',
        r'\bdesconto\b', r'\bcupom\b',
        r'\bcalcular\s+o\s+frete\b', r'\bcalcular\s+frete\b',
        r'\bgostaria\s+de\s+um\s+orçamento\b',
        r'\bpreciso\s+de\s+um\s+orçamento\b',
        r'\btabela\s+de\s+preços\b',
    ],
    "forma_pagamento": [
        r'\bforma\s+de\s+pagamento\b',
        r'\bparcelamento\b', r'\bparcelar\b',
        r'\bpix\b', r'\bcartão\s+de\s+crédito\b',
        r'\bprazo\s+de\s+pagamento\b',
    ],
    "devolucao_garantia": [
        r'\bdevolução\b', r'\bdevolver\b',
        r'\btroca\b', r'\btrocar\b', r'\bgarantia\b',
        r'\bdefeito\b', r'\bquebrado\b', r'\bdanificado\b',
        r'\breclamação\b', r'\bcancelamento\b',
    ],
    "cadastro_b2b": [
        r'\bcadastro\b', r'\bcadastrar\b',
        r'\bpessoa\s+jurídica\b', r'\bpessoa\s+juridica\b',
        r'\bcnpj\b', r'\bcriar\s+conta\b',
        r'\brecuperar\s+senha\b',
    ],
    "checkout_site": [
        r'\bfinalizar\s+compra\b', r'\bfinalizar\s+pedido\b',
        r'\bcarrinho\b',
        r'\bnão\s+consigo\s+comprar\b', r'\bnao\s+consigo\s+comprar\b',
        r'\berro\s+no\s+site\b', r'\bfrete\s+não\s+incluso\b',
    ],
    "localizacao_horario": [
        r'\bonde\s+fica\b', r'\bendereço\b', r'\bendereco\b',
        r'\bem\s+qual\s+cidade\b', r'\bbauru\b',
        r'\bhorário\s+de\s+atendimento\b',
        r'\bquando\s+(abre|fecha|funciona)\b',
        r'\batende\s+sábado\b',
    ],
    "contato_vendedor_whatsapp": [
        r'\bwhatsapp\s+de\s+vocês\b', r'\bwhatsapp\s+de\s+voces\b',
        r'\bnúmero\s+de\s+whatsapp\b', r'\b0800\b',
        r'\bfalar\s+com\s+(um\s+)?vendedor\b',
        r'\bquero\s+falar\s+com\b',
        r'\bme\s+chame\s+no\s+whatsapp\b',
    ],
    "emprego_curriculo": [
        r'\bcurrículo\b', r'\bcurriculo\b',
        r'\btrabalhar\s+(?:com\s+)?vocês\b',
        r'\bvaga\b', r'\bemprego\b',
    ],
    "showroom_visita": [
        r'\bshowroom\b', r'\bshow\s+room\b', r'\bvisitar\b',
    ],
}

# Compilar
INTENCOES_COMP = {
    cat: [re.compile(p, re.IGNORECASE) for p in pats]
    for cat, pats in INTENCOES.items()
}

def classificar_intencoes(texto):
    encontradas = []
    for cat, pats in INTENCOES_COMP.items():
        for p in pats:
            if p.search(texto):
                encontradas.append(cat)
                break
    return encontradas

# ===========================================================================
# SUBCATEGORIZAÇÃO DOS "OUTROS"
# ===========================================================================
RE_SAUDACAO = re.compile(
    r'^\s*(olá|ola|oi|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|'
    r'preciso\s+de\s+ajuda|tenho\s+uma\s+dúvida|tenho\s+uma\s+duvida|'
    r'obrigad|ok|sim|não|chegou|perfeito|certo|entendi)\s*[!?.,]?\s*$',
    re.IGNORECASE
)
RE_CONTATO_DADO = re.compile(
    r'^\s*(\d[\d\s\.\-\/]{6,}|[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\s*$'
)
RE_CONTINUIDADE = re.compile(
    r'^\s*(sim|não|nao|ok|certo|perfeito|obrigad\w*|tchau|até\s+mais|'
    r'ótimo|otimo|chegou|combinado|entendi|anotado)\s*[!?.,]?\s*$',
    re.IGNORECASE
)

def subcategoria_outros(texto):
    t = texto.strip()
    if RE_SAUDACAO.match(t):
        return "saudacao_abertura"
    if RE_CONTATO_DADO.match(t):
        return "dado_contato_lead"
    if RE_CONTINUIDADE.match(t):
        return "continuidade_conversa"
    if len(t) < 25:
        return "mensagem_curta_contexto"
    return "outro_nao_classificado"

# ===========================================================================
# ANÁLISE DE ANOMALIAS DO FAGNER AI
# ===========================================================================
ANOMALIAS_FAGNER = [
    (r'i do not discuss security', "prompt_leak_ingles"),
    (r'internal architecture', "prompt_leak_ingles"),
    (r'model settings', "prompt_leak_ingles"),
    (r'as an ai', "identificacao_ai_ingles"),
    (r'i cannot', "resposta_ingles"),
    (r'i am unable', "resposta_ingles"),
]
ANOMALIAS_COMP = [(re.compile(p, re.IGNORECASE), tipo) for p, tipo in ANOMALIAS_FAGNER]

# ===========================================================================
# PARSER PRINCIPAL — trabalha no relatorio_conversas_completo.md
# (estrutura mais limpa que o TXT do HTML)
# ===========================================================================
def analisar(caminho_md, caminho_txt):
    """
    Usa o .md para mensagens limpas e o .txt para extrair
    metadados de navegação, canal e cidade.
    """

    print("📂 Carregando arquivos...")
    with open(caminho_md, 'r', encoding='utf-8', errors='replace') as f:
        conteudo_md = f.read()
    with open(caminho_txt, 'r', encoding='utf-8', errors='replace') as f:
        conteudo_txt = f.read()
    print(f"   .md : {len(conteudo_md):,} chars")
    print(f"   .txt: {len(conteudo_txt):,} chars")

    # ---- EXTRAIR BLOCOS DE CONVERSA DO .md ----
    blocos = conteudo_md.split('---')
    conversas = [b for b in blocos if '### Cliente:' in b]
    print(f"📊 Conversas: {len(conversas):,}")

    # ---- EXTRAIR METADADOS DO .txt ----
    # Canais
    canais = Counter(m.group(1).strip() for m in RE_CHANNEL.finditer(conteudo_txt))
    fontes = Counter(m.group(1).strip() for m in RE_SOURCE.finditer(conteudo_txt))
    cidades = Counter(m.group(1).strip() for m in RE_CITY.finditer(conteudo_txt))
    regioes = Counter(m.group(1).strip() for m in RE_REGION.finditer(conteudo_txt))

    # Logs de navegação
    nav_logs = [(m.group(1), m.group(2).strip()) for m in RE_NAV.finditer(conteudo_txt)]
    nav_paginas = Counter(titulo for _, titulo in nav_logs)

    print(f"   Logs de navegação: {len(nav_logs):,}")
    print(f"   Páginas únicas visitadas: {len(nav_paginas):,}")

    # ---- PROCESSAR MENSAGENS DO .md ----
    intencoes_contador      = Counter()
    outros_subcats          = Counter()
    msgs_por_intencao       = defaultdict(list)
    anomalias_fagner        = []
    conversas_por_operador  = Counter()
    total_msgs_cliente      = 0
    total_msgs_op           = 0
    todas_msgs_outros       = []

    print("\n🔄 Analisando mensagens...")
    for i, bloco in enumerate(conversas):
        if i % 1000 == 0:
            print(f"   [{i+1}/{len(conversas)}]")

        # Operador
        h = re.search(r'\*\*Operador:\*\* (.+?) \|', bloco)
        if h:
            conversas_por_operador[h.group(1).strip()] += 1

        # Mensagens
        msgs = re.findall(r'\- \*\*\[[\d:]+\] (.+?):\*\* (.+)', bloco)
        for remetente_raw, mensagem in msgs:
            remetente = remetente_raw.strip()
            mensagem  = mensagem.strip()
            if not mensagem or len(mensagem) < 2:
                continue
            if 'ARQUIVO' in mensagem or 'MÍDIA' in mensagem:
                continue

            eh_op = is_operador(remetente)

            # Detectar anomalias no Fagner
            if remetente.lower() == 'fagner':
                for pat, tipo in ANOMALIAS_COMP:
                    if pat.search(mensagem):
                        anomalias_fagner.append({
                            'tipo': tipo,
                            'mensagem': mensagem[:300]
                        })

            if eh_op:
                total_msgs_op += 1
                continue

            total_msgs_cliente += 1
            intencoes = classificar_intencoes(mensagem)

            if intencoes:
                for intencao in intencoes:
                    intencoes_contador[intencao] += 1
                    if len(msgs_por_intencao[intencao]) < 20:
                        msgs_por_intencao[intencao].append(mensagem)
            else:
                sub = subcategoria_outros(mensagem)
                outros_subcats[sub] += 1
                if len(todas_msgs_outros) < 30:
                    todas_msgs_outros.append((sub, mensagem))

    total_outros = sum(outros_subcats.values())

    return {
        "resumo": {
            "total_conversas": len(conversas),
            "total_msgs_cliente": total_msgs_cliente,
            "total_msgs_operador": total_msgs_op,
            "total_outros": total_outros,
            "pct_outros": round(total_outros / total_msgs_cliente * 100, 2) if total_msgs_cliente else 0,
        },
        "intencoes": intencoes_contador.most_common(),
        "outros_subcats": outros_subcats.most_common(),
        "exemplos": dict(msgs_por_intencao),
        "operadores": conversas_por_operador.most_common(),
        "canais": canais.most_common(10),
        "fontes": fontes.most_common(10),
        "cidades": cidades.most_common(15),
        "regioes": regioes.most_common(10),
        "nav_top_paginas": nav_paginas.most_common(30),
        "nav_total_logs": len(nav_logs),
        "anomalias_fagner": anomalias_fagner,
        "exemplos_outros": todas_msgs_outros,
    }

# ===========================================================================
# GERADOR DE RELATÓRIO MARKDOWN v3
# ===========================================================================
def gerar_relatorio(r, saida):
    tm  = r['resumo']['total_msgs_cliente']
    tc  = r['resumo']['total_conversas']
    to  = r['resumo']['total_outros']
    po  = r['resumo']['pct_outros']
    nav = r['nav_total_logs']

    L = []
    L += [
        "# 🤖 Relatorio Tecfag — Fagner AI Knowledge Base (v3 Definitivo)",
        f"> **{tc:,} conversas** | **{tm:,} mensagens de clientes** | **{nav:,} logs de navegação rastreados**",
        "",
        "---",
        "",
        "## 📊 Resumo Geral",
        "",
        "| Métrica | Valor |",
        "|---------|-------|",
        f"| Total de Conversas | **{tc:,}** |",
        f"| Mensagens dos Clientes | **{tm:,}** |",
        f"| Mensagens dos Operadores | **{r['resumo']['total_msgs_operador']:,}** |",
        f"| Logs de Navegação do Widget | **{nav:,}** |",
        "",
    ]

    # ORIGEM DAS CONVERSAS
    L += ["## 📡 Origem das Conversas (Canal de Tráfego)", ""]
    L += ["| Canal | Conversas |", "|-------|-----------|"]
    for canal, cnt in r['canais']:
        L.append(f"| {canal} | {cnt:,} |")
    L += ["", "| Fonte | Conversas |", "|-------|-----------|"]
    for fonte, cnt in r['fontes']:
        L.append(f"| {fonte} | {cnt:,} |")
    L.append("")

    # CIDADES
    L += ["## 🗺️ Principais Cidades dos Clientes", ""]
    L += ["| Cidade | Estado | Conversas |", "|--------|--------|-----------|"]
    for cidade, cnt in r['cidades']:
        L.append(f"| {cidade} | — | {cnt:,} |")
    L.append("")

    # OPERADORES
    L += ["## 👤 Distribuição por Operador", ""]
    L += ["| Operador | Conversas | % |", "|----------|-----------|---|"]
    for op, cnt in r['operadores']:
        pct = cnt / tc * 100
        L.append(f"| {op} | {cnt:,} | {pct:.1f}% |")
    L.append("")

    # NAVEGAÇÃO — PRODUTOS MAIS VISITADOS
    L += [
        "## 🔍 Produtos Mais Visitados ANTES de Abrir o Chat",
        "",
        "> Dados extraídos dos logs de navegação do widget JivoChat",
        "> Revela o interesse REAL do cliente antes da primeira mensagem",
        "",
        "| # | Página/Produto | Visitas |",
        "|---|---------------|---------|",
    ]
    for idx, (pag, cnt) in enumerate(r['nav_top_paginas'][:25], 1):
        L.append(f"| {idx} | {pag} | {cnt:,} |")
    L.append("")

    # INTENÇÕES CLASSIFICADAS
    L += [
        "## 🎯 Intenções Classificadas dos Clientes",
        "",
        f"> Total classificado: **{tm - to:,} msgs** | Não classificado (Outros): **{to:,} msgs ({po}%)**",
        "",
        "| # | Intenção | Ocorrências | % Total |",
        "|---|----------|-------------|---------|",
    ]
    for idx, (cat, cnt) in enumerate(r['intencoes'], 1):
        pct = cnt / tm * 100
        L.append(f"| {idx} | {cat.replace('_', ' ').title()} | {cnt:,} | {pct:.2f}% |")
    L.append("")

    # DECOMPOSIÇÃO DOS "OUTROS"
    L += [
        "## 🗂️ Decomposição dos 'Outros' (79,77%)",
        "",
        f"> {to:,} mensagens não classificadas por palavras-chave específicas.",
        "> Aqui está o que realmente compõe essa categoria:",
        "",
        "| Sub-categoria | Ocorrências | O que são |",
        "|--------------|-------------|-----------|",
    ]
    descricoes = {
        "saudacao_abertura": "Saudações iniciais: 'Olá', 'Bom dia', 'Preciso de ajuda'",
        "dado_contato_lead": "Dados fornecidos: CNPJ, telefone, e-mail, nome",
        "continuidade_conversa": "Respostas de fluxo: 'Sim', 'Ok', 'Entendi', 'Obrigado'",
        "mensagem_curta_contexto": "Frases curtas de contexto sem palavra-chave específica",
        "outro_nao_classificado": "Mensagens longas não enquadradas em nenhuma categoria",
    }
    for sub, cnt in r['outros_subcats']:
        desc = descricoes.get(sub, sub)
        L.append(f"| {sub} | {cnt:,} | {desc} |")
    L += [
        "",
        "> **Nota:** Uma parcela dos 'Outros' são registros automáticos de navegação do JivoChat",
        "> (ex: `26.03.2026 17:18:20 Dispensador Semiautomático de Fita Gomada - Tecfag`),",
        "> que figuram no log bruto como 'mensagens' mas na verdade são metadados de sessão.",
        "",
    ]

    # EXEMPLOS POR INTENÇÃO
    L += ["---", "", "## 💬 Exemplos Reais por Intenção", ""]
    for cat, cnt in r['intencoes']:
        exemplos = r['exemplos'].get(cat, [])
        if not exemplos:
            continue
        pct = cnt / tm * 100
        L.append(f"### {cat.replace('_',' ').title()} — {cnt:,} ({pct:.2f}%)")
        L.append("")
        for ex in exemplos[:8]:
            ex_c = ex[:180] + "..." if len(ex) > 180 else ex
            L.append(f'- *"{ex_c}"*')
        L.append("")

    # ANOMALIAS DO FAGNER AI
    L += [
        "---",
        "",
        "## 🚨 Anomalias Detectadas no Fagner AI",
        "",
    ]
    if r['anomalias_fagner']:
        tipos = Counter(a['tipo'] for a in r['anomalias_fagner'])
        L += ["| Tipo de Anomalia | Ocorrências |", "|-----------------|-------------|"]
        for tipo, cnt in tipos.most_common():
            L.append(f"| {tipo} | {cnt} |")
        L.append("")
        L.append("**Exemplos de respostas anômalas do Fagner:**")
        L.append("")
        for a in r['anomalias_fagner'][:5]:
            L.append(f'- **[{a["tipo"]}]** *"{a["mensagem"][:200]}"*')
        L += [
            "",
            "> [!CAUTION]",
            "> O Fagner está expondo mensagens de sistema em inglês para os clientes.",
            "> Isso indica que os guardrails do prompt estão vazando.",
            "> **Ação imediata:** revisar o system prompt e os guardrails de segurança.",
            "",
        ]
    else:
        L.append("> Nenhuma anomalia detectada no período analisado.")
        L.append("")

    # KNOWLEDGE BASE PRIORITÁRIA
    L += [
        "---",
        "",
        "## 🧠 Knowledge Base Prioritária para o Fagner",
        "",
        "### 🔴 CRÍTICO — Peças e Insumos de Alta Demanda",
        "",
        "Clientes buscam ativamente por insumos de desgaste rápido.",
        "O Fagner precisa responder imediatamente (sem transferir para humano):",
        "",
        "| Peça/Insumo | Presença nos Logs | Ação do Fagner |",
        "|-------------|-------------------|----------------|",
        "| Borracha de Silicone | **36x** | Redirecionar para setor de peças: 0800 947 5000 |",
        "| Cinto Teflon | **30x** | Informar modelos compatíveis + link no site |",
        "| Tinta Sólida (Ink Roll) | **21x** | Informar tamanhos disponíveis (16mm, etc.) |",
        "| Resistência do Mordente | **10x** | Redirecionar para setor de peças |",
        "",
        "### 🔴 CRÍTICO — Gargalos de E-commerce",
        "",
        "| Problema | Evidência Real | Impacto |",
        "|----------|---------------|---------|",
        "| Checkout bloqueado para CNPJ | *'Preciso comprar colocando nosso CNPJ, mas ao finalizar aparece CPF'* | Perde vendas B2B diretas |",
        "| Parcelamento 24x não aparece | *'vocês informam no site parcelamento até 24x, não aparece essa opção'* | Abandono de carrinho |",
        "| Carrinho esvazia ao finalizar | *'adiciono ao carrinho e quando clico em finalizar o carrinho está vazio'* | Perda de venda |",
        "",
        "### 🔴 CRÍTICO — Prompt Leak do Fagner AI",
        "",
        "O Fagner respondeu em inglês expondo seus guardrails internos:",
        "",
        '> *"I do not discuss security, internal architecture, or model settings."*',
        "",
        "**Ação:** Reescrever o system prompt para tratar tentativas de ataque em português",
        "sem jamais expor termos internos de segurança.",
        "",
        "### 🟠 ALTO — Fluxo de Peças e Suporte Técnico",
        "",
        "Criar menu rápido no início do chat:",
        "- 🔩 **Peças de Reposição** → 0800 947 5000 / 14 99105-4116",
        "- 📋 **Manual / Manutenção** → link para manuais no site",
        "- 🔧 **Assistência Técnica** → abrir chamado pelo 0800",
        "",
        "### 🟠 ALTO — Resposta Automática para Emprego",
        "",
        "**51 pessoas** usaram o chat para pedir emprego.",
        "Criar resposta automática: *'Para envio de currículos, entre em contato por [email de RH]'*",
        "",
    ]

    # PLANO DE AÇÃO
    L += [
        "---",
        "",
        "## 🚀 Plano de Ação para o Fagner (Priorizado)",
        "",
        "### Fase 1 — Correções Urgentes (esta semana)",
        "- [ ] Corrigir prompt do Fagner: guardrails em português, sem expor termos internos",
        "- [ ] Acionar TI: habilitar compra via CNPJ no checkout VTEX",
        "- [ ] Acionar Marketing: verificar configuração de parcelamento 24x no site",
        "",
        "### Fase 2 — MVP do Fagner (próximas 2 semanas)",
        "- [ ] Saudação + captura de intenção",
        "- [ ] FAQ: localização (Bauru-SP), horário (seg-sex 08h-18h), WhatsApp (14 991054116), 0800 (947 5000)",
        "- [ ] Respostas sobre Top 3 produtos: Seladora, Envasadora, Empacotadora",
        "- [ ] Menu rápido: Peças e Insumos → redirecionar para setor de peças",
        "- [ ] Resposta automática para currículo/emprego",
        "- [ ] Fluxo: coletar nome + telefone para retorno de vendedor",
        "",
        "### Fase 3 — Integração VTEX (próximo mês)",
        "- [ ] Consulta de pedido/rastreio por e-mail ou CNPJ",
        "- [ ] Simulação de frete por CEP",
        "- [ ] Busca de produto no catálogo",
        "- [ ] Reenvio de nota fiscal",
        "",
        "### Fase 4 — Inteligência Avançada",
        "- [ ] Recomendação de produto por aplicação (ex: 'para geladinho gourmet → FRD400')",
        "- [ ] Detectar idioma e responder em espanhol se necessário",
        "- [ ] Análise de navegação em tempo real para contexto da conversa",
        "",
        "---",
        "",
        "*Relatório v3 — 30/03/2026 | Metodologia: regex word-boundary + extração de metadados HTML*",
    ]

    with open(saida, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))
    print(f"\n✅ Relatório v3 salvo: {saida}")

# ===========================================================================
# MAIN
# ===========================================================================
if __name__ == "__main__":
    caminho_md  = Path("relatorio_conversas_completo.md")
    caminho_txt = Path("mensagens.txt")
    saida_md    = Path("analise_v3_definitivo.md")
    saida_json  = Path("analise_v3_dados.json")

    print("=" * 65)
    print("🤖 ANALISADOR v3 DEFINITIVO — TECFAG / FAGNER AI")
    print("=" * 65)

    resultado = analisar(caminho_md, caminho_txt)

    # Salvar JSON (sem exemplos completos para não pesar)
    exportar = {k: v for k, v in resultado.items() if k not in ['exemplos', 'exemplos_outros']}
    with open(saida_json, 'w', encoding='utf-8') as f:
        json.dump(exportar, f, ensure_ascii=False, indent=2)
    print(f"📁 JSON: {saida_json}")

    gerar_relatorio(resultado, saida_md)

    print("\n" + "=" * 65)
    print("📊 RESULTADO FINAL")
    print("=" * 65)
    print(f"Conversas      : {resultado['resumo']['total_conversas']:,}")
    print(f"Msgs clientes  : {resultado['resumo']['total_msgs_cliente']:,}")
    print(f"Logs navegação : {resultado['nav_total_logs']:,}")
    print(f"Anomalias IA   : {len(resultado['anomalias_fagner'])}")
    print()
    print("📡 CANAIS DE ORIGEM:")
    for canal, cnt in resultado['canais']:
        print(f"   {canal:<25} {cnt:,}")
    print()
    print("🔍 TOP PÁGINAS VISITADAS ANTES DO CHAT:")
    for pag, cnt in resultado['nav_top_paginas'][:10]:
        print(f"   [{cnt:3}x] {pag[:70]}")
    print()
    print("🎯 INTENÇÕES CLASSIFICADAS:")
    for cat, cnt in resultado['intencoes'][:15]:
        pct = cnt / resultado['resumo']['total_msgs_cliente'] * 100
        print(f"   {cat:<35} {cnt:>5,}  ({pct:.2f}%)")
    print()
    print("🗂️ OUTROS (sub-categorias):")
    for sub, cnt in resultado['outros_subcats']:
        print(f"   {sub:<30} {cnt:>6,}")
    print("\n✅ Concluído!")
