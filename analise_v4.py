
# -*- coding: utf-8 -*-
"""
Analisador Tecfag v4 - REGRAS ESTRITAS DO ESPECIALISTA
Regra 1: Filtrar lixo de sistema e navegacao
Regra 2: Reclassificar Outros em categorias reais (meta Outros < 5%)
Regra 3: Detectar anomalias de prompt leak da IA
"""

import re
import json
from collections import Counter, defaultdict
from pathlib import Path

# =============================================================================
# REGRA 1 - FILTROS DE LIXO DE SISTEMA
# =============================================================================
FILTROS_SISTEMA = [
    re.compile(r'.+\s*[-]\s*Tecfag(\s+Personnalité)?\s*$', re.IGNORECASE),
    re.compile(r'^\s*Pedido confirmado\s*$', re.IGNORECASE),
    re.compile(r'^\s*Nova mensagem!\s*$', re.IGNORECASE),
    re.compile(r'Você pesquisou por', re.IGNORECASE),
    re.compile(r'busca\s*[-]\s*Tecfag', re.IGNORECASE),
    re.compile(r'^\s*https?://\S+\s*$', re.IGNORECASE),
    re.compile(r'^\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}\s*$'),
    re.compile(r'^\s*\d{1,6}\s*$'),
]

def eh_lixo_sistema(texto):
    t = texto.strip()
    if not t:
        return True
    for pat in FILTROS_SISTEMA:
        if pat.search(t):
            return True
    return False

# =============================================================================
# OPERADORES
# =============================================================================
OPERADORES = {
    'fagner', 'deborah', 'agente 0', 'lucia', 'luzia', 'ana', 'denise',
    'vitor', 'carlos', 'maria', 'joao', 'joao', 'agente', 'operador', 'tecfag'
}

def is_operador(nome):
    n = nome.strip().lower()
    return any(n == op or n.startswith(op) for op in OPERADORES)

# =============================================================================
# REGRA 3 - ANOMALIAS DE IA
# =============================================================================
ANOMALIA_PATTERNS = [
    re.compile(r'i do not discuss security', re.IGNORECASE),
    re.compile(r'internal architecture', re.IGNORECASE),
    re.compile(r'model settings', re.IGNORECASE),
    re.compile(r'as an ai\b', re.IGNORECASE),
    re.compile(r'i cannot help with', re.IGNORECASE),
    re.compile(r'i am unable to', re.IGNORECASE),
]

def eh_anomalia_ia(remetente, texto):
    if remetente.strip().lower() == 'fagner':
        return any(p.search(texto) for p in ANOMALIA_PATTERNS)
    return False

# =============================================================================
# REGRA 2 - CATEGORIAS DE PRODUTO
# =============================================================================
PRODUTOS = {
    "seladora": [
        r'\bseladora\b', r'\bseladoras\b', r'\bselar\b', r'\bselagem\b',
        r'\bfrd\b', r'\bfrd\d+\b', r'\bsf\d+\b',
        r'\bdatador\b', r'\bdatadora\b', r'\bteflon\b',
        r'\bresistência\s+do\s+mordente\b', r'\bresistencia\s+do\s+mordente\b',
    ],
    "envasadora_dosadora": [
        r'\benvasadora\b', r'\benvasar\b', r'\benvase\b',
        r'\bdosadora\b', r'\bdosar\b', r'\bdosagem\b',
        r'\benchedora\b', r'\bbico\s+dosador\b',
    ],
    "embaladora_empacotadora": [
        r'\bempacotadora\b', r'\bembaladora\b',
        r'\btunel\s+de\s+encolhimento\b', r'\btúnel\s+de\s+encolhimento\b',
        r'\bshrink\b', r'\bflow\s*pack\b', r'\bretratil\b',
    ],
    "rotuladora": [
        r'\brotuladora\b', r'\brotulo\b', r'\brotulagem\b', r'\brotular\b', r'\bsleeve\b',
    ],
    "maquina_vacuo": [
        r'\bvácuo\b', r'\bvacuo\b',
        r'\bseladora\s+a\s+vacuo\b', r'\bembalagem\s+a\s+vacuo\b', r'\bdz\d+\b',
    ],
    "fechadora_caixa": [
        r'\bfechadora\s+de\s+caixa\b', r'\bfxj\w*\b', r'\bfechar\s+caixa\b',
    ],
    "arqueadora_fita": [
        r'\barqueadora\b', r'\barquear\b', r'\btensionadora\b',
        r'\bfita\s+de\s+arquear\b', r'\bfita\s+pp\b', r'\bfita\s+pet\b',
    ],
    "esteira_rolete": [
        r'\besteira\b', r'\brolete\b', r'\blona\s+da\s+esteira\b',
    ],
    "rosqueadora_tampadora": [
        r'\brosqueadora\b', r'\brosquear\b', r'\btampadora\b', r'\btampador\b', r'\btampar\b',
    ],
    "balanca_dosadora": [
        r'\bbalança\b', r'\bbalanca\b', r'\bpesagem\b', r'\bdosadora\s+com\s+balança\b',
    ],
    "pecas_insumos": [
        r'\bpeca\s+de\s+reposicao\b', r'\bpeça\s+de\s+reposição\b',
        r'\bpeças\s+de\s+reposição\b', r'\bpecas\s+de\s+reposicao\b',
        r'\bcinto\s+teflon\b', r'\btinta\s+solida\b', r'\btinta\s+sólida\b',
        r'\bink\s+roll\b', r'\bborracha\s+de\s+silicone\b',
        r'\bvende\s+pecas\b', r'\bvende\s+peças\b', r'\bsetor\s+de\s+pecas\b',
        r'\bresistência\b', r'\bresistencia\b',
    ],
}

# =============================================================================
# REGRA 2 - CATEGORIAS TRANSACIONAIS
# =============================================================================
TRANSACIONAIS = {
    "preco_orcamento": [
        r'\borcamento\b', r'\borçamento\b', r'\bcotacao\b', r'\bcotação\b',
        r'\bqual\s+o\s+valor\b', r'\bqual\s+o\s+preco\b', r'\bqual\s+o\s+preço\b',
        r'\bquanto\s+custa\b', r'\bdesconto\b', r'\bcupom\b',
        r'\bcalcular\s+(o\s+)?frete\b',
        r'\bgostaria\s+de\s+um\s+orcamento\b', r'\bgostaria\s+de\s+um\s+orçamento\b',
        r'\bpreciso\s+de\s+um\s+orcamento\b', r'\btabela\s+de\s+precos\b',
        r'\bmenor\s+valor\b', r'\bpreço\s+de\b', r'\bvalor\s+de\b',
    ],
    "forma_pagamento": [
        r'\bforma\s+de\s+pagamento\b', r'\bparcelamento\b', r'\bparcelar\b',
        r'\bcartao\s+de\s+credito\b', r'\bprazo\s+de\s+pagamento\b',
        r'\bboleto\b', r'\bpix\b',
    ],
    "rastreio_entrega": [
        r'\brastreio\b', r'\brastreamento\b', r'\bcodigo\s+de\s+rastreio\b',
        r'\bprazo\s+de\s+entrega\b',
        r'\bnao\s+recebi\s+meu\s+pedido\b', r'\bnão\s+recebi\s+meu\s+pedido\b',
        r'\bpedido\s+nao\s+chegou\b', r'\btransportadora\b',
        r'\bjadlog\b', r'\bactual\s+cargas\b', r'\bdespachado\b',
    ],
    "nota_fiscal_documento": [
        r'\bnota\s+fiscal\b', r'\bdanfe\b', r'\bnfe\b', r'\bnf\b',
        r'\bchave\s+de\s+acesso\b', r'\bxml\s+da\s+nota\b',
        r'\bsegunda\s+via\s+de\s+boleto\b',
    ],
    "devolucao_garantia_assistencia": [
        r'\bdevolucao\b', r'\bdevolução\b', r'\bdevolver\b',
        r'\btroca\b', r'\btrocar\b', r'\bgarantia\b',
        r'\bdefeito\b', r'\bquebrado\b', r'\bdanificado\b',
        r'\breclamacao\b', r'\bcancelamento\b',
        r'\bassistencia\s+tecnica\b', r'\bassistência\s+técnica\b',
    ],
    "cadastro_conta_b2b": [
        r'\bcadastro\b', r'\bcadastrar\b',
        r'\bpessoa\s+juridica\b', r'\bpessoa\s+jurídica\b',
        r'\bcnpj\b', r'\bcriar\s+conta\b', r'\brecuperar\s+senha\b',
    ],
    "gargalo_ecommerce": [
        r'\bfinalizar\s+compra\b', r'\bfinalizar\s+pedido\b', r'\bcarrinho\b',
        r'\bnao\s+consigo\s+comprar\b', r'\bnão\s+consigo\s+comprar\b',
        r'\berro\s+no\s+site\b', r'\bcarrinho\s+esta\s+vazio\b',
        r'\bcarrinho\s+está\s+vazio\b', r'\bnao\s+estou\s+conseguindo\s+fazer\s+o\s+pedido\b',
    ],
    "localizacao_horario": [
        r'\bonde\s+fica\b', r'\bendereco\b', r'\bendereço\b',
        r'\bem\s+qual\s+cidade\b', r'\bbauru\b',
        r'\bhorario\s+de\s+atendimento\b', r'\bhorário\s+de\s+atendimento\b',
        r'\bquando\s+(abre|fecha|funciona)\b',
    ],
    "contato_whatsapp_vendedor": [
        r'\bwhatsapp\s+de\s+voces\b', r'\bwhatsapp\s+de\s+vocês\b',
        r'\bnumero\s+de\s+whatsapp\b', r'\b0800\b',
        r'\bfalar\s+com\s+(um\s+)?vendedor\b', r'\bquero\s+falar\s+com\b',
        r'\bme\s+ligue\b', r'\bretorno\s+por\s+telefone\b',
        r'\bme\s+chamar\s+no\s+whatsapp\b',
        r'\baonde\s+fica\s+a\s+empresa\b', r'\bonde\s+fica\s+a\s+empresa\b',
        r'\bteve\s+algum\s+telefone\s+(fixo|que)\b',
        r'\bvcs?\s+tem\s+(um\s+)?telefone\b',
    ],
    "suporte_tecnico_manual": [
        r'\bmanual\s+de\s+(operacao|limpeza|manutencao|operação|limpeza|manutenção)\b',
        r'\bmanutencao\s+(preventiva|corretiva)\b', r'\bcalibracao\b', r'\bregulagem\b',
    ],
    "showroom_visita": [
        r'\bshowroom\b', r'\bshow\s+room\b', r'\bvisitar\b',
    ],
}

# =============================================================================
# REGRA 2 - CATEGORIAS COMPORTAMENTAIS (reclassificacao dos Outros)
# =============================================================================

RE_SAUDACAO = re.compile(
    r'^\s*(olá|ola|oi+|oie|oii|bom\s+dia|boa\s+tarde|boa\s+noite|'
    r'tudo\s+(bem|certo|otimo|bom)|bom\s+dia[!.]*|'
    r'preciso\s+de\s+ajuda|tenho\s+uma\s+d.vida|'
    r'como\s+vai|boa|bom|hello|hi|'
    r'olá\s+bom\s+dia|olá\s+boa\s+tarde|'
    r'bom\s+dia\s+debor\w*|boa\s+tarde\s+debor\w*|'
    r'boa\s+tarde\s+fagner|bom\s+dia\s+fagner|'
    r'olá!\s*$)\s*[!?.,]*\s*$',
    re.IGNORECASE
)

RE_CONTINUIDADE = re.compile(
    r'^\s*(sim|nao|não|ok|okay|certo|perfeito|obrigad\w*|muito\s+obrigad\w*|'
    r'mto\s+obg|tchau|ate\s+mais|otimo|chegou|combinado|entendi|'
    r'anotado|claro|pode\s+ser|vou\s+tentar|aguardo|no\s+aguardo|'
    r'vou\s+verificar|blz|beleza|entendido|tranquilo|'
    r'certo!|perfeito!|concordo|tenha\s+um\s+.otimo|tenha\s+um\s+bom|'
    r'muito\s+obrigad[ao]!?)\s*[!?.,]*\s*$',
    re.IGNORECASE
)

RE_EMAIL    = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
RE_CNPJ     = re.compile(r'\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}')
RE_CPF      = re.compile(r'\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}')
RE_TELEFONE = re.compile(r'(?:\+55\s?)?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}')
RE_TEL_PURO = re.compile(r'^\s*\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}\s*$')
RE_NUM_CEP  = re.compile(r'^\s*\d{5,8}\s*$')
RE_NOME_PR  = re.compile(
    r'^\s*[A-Z\xC0-\xDF][a-z\xe0-\xff]{2,}(\s+[A-Z\xC0-\xDF][a-z\xe0-\xff]{2,}){0,3}\s*$'
)

def eh_dado_lead(texto):
    t = texto.strip()
    if RE_TEL_PURO.match(t): return True
    if RE_NUM_CEP.match(t): return True
    if len(t) < 80:
        if RE_EMAIL.search(t) or RE_CNPJ.search(t) or RE_TELEFONE.search(t) or RE_CPF.search(t):
            return True
    return False

RE_EMPREGO = re.compile(
    r'\b(curriculo|currículo|vaga\b|emprego|trabalhar\s+com\s+voc|menor\s+aprendiz|cuidadora)\b',
    re.IGNORECASE
)

RE_B2B = re.compile(
    r'(transportes?\b|logistica|fornecedor|parceria|representan\w+|distribui\w+|'
    r'global\s+transportes|maintech|kautra|terceiriza|departamento\s+de\s+compras)',
    re.IGNORECASE
)

RE_POS_VENDA = re.compile(
    r'\b(nao\s+tive\s+retorno|ninguem\s+me\s+responde|ninguem\s+atende|'
    r'ainda\s+nao\s+fui\s+atendid|estou\s+esperando\s+resposta|'
    r'nao\s+recebo\s+retorno|estou\s+espetando|sem\s+retorno\s+no\s+whatsapp|'
    r'ninguem\s+responde)\b',
    re.IGNORECASE
)

RE_APLICACAO = re.compile(
    r'\b(para\s+(embalar|selar|envasar|produzir|pizza|sache|geladinho|cosmetico|'
    r'sabonete|comprimido|carne|po\b|mel\b|alimento|medicamento|acougue|frigorifico)|'
    r'serve\s+para|gostaria\s+de\s+(mais\s+)?informac|'
    r'preciso\s+para\s+envasar|estou\s+pensando\s+em\s+adquirir|'
    r'quero\s+esclarecer)\b',
    re.IGNORECASE
)

RE_DISPONIB = re.compile(
    r'\b(tem\s+pronta\s+entrega|pronta\s+entrega|disponivel|disponível|'
    r'tem\s+em\s+estoque|vende\s+para\s+consumidor\s+final|'
    r'nao\s+esta\s+disponivel\s+para\s+entregar)\b',
    re.IGNORECASE
)

# Compilar
PRODUTOS_COMP = {
    cat: [re.compile(p, re.IGNORECASE) for p in pats]
    for cat, pats in PRODUTOS.items()
}
TRANSAC_COMP = {
    cat: [re.compile(p, re.IGNORECASE) for p in pats]
    for cat, pats in TRANSACIONAIS.items()
}

def classificar(texto):
    cats = []
    for cat, pats in PRODUTOS_COMP.items():
        for p in pats:
            if p.search(texto):
                cats.append(cat)
                break
    for cat, pats in TRANSAC_COMP.items():
        for p in pats:
            if p.search(texto):
                cats.append(cat)
                break
    if cats:
        return cats

    if RE_SAUDACAO.match(texto):
        return ['saudacao_abertura']
    if eh_dado_lead(texto):
        return ['captura_lead_dados']
    if RE_NOME_PR.match(texto) and len(texto.strip()) < 30:
        return ['captura_lead_dados']
    if RE_CONTINUIDADE.match(texto):
        return ['continuidade_conversa']
    if RE_EMPREGO.search(texto):
        return ['emprego_curriculo']
    if RE_B2B.search(texto):
        return ['intencao_b2b_parceria']
    if RE_POS_VENDA.search(texto):
        return ['pos_venda_suporte_vago']
    if RE_APLICACAO.search(texto):
        return ['contexto_aplicacao_produto']
    if RE_DISPONIB.search(texto):
        return ['consulta_disponibilidade']

    return ['outros_residual']

# =============================================================================
# ANALISE PRINCIPAL
# =============================================================================
def analisar(caminho_md):
    print(f"Lendo: {caminho_md}")
    with open(caminho_md, 'r', encoding='utf-8', errors='replace') as f:
        conteudo = f.read()

    blocos    = conteudo.split('---')
    conversas = [b for b in blocos if '### Cliente:' in b]
    print(f"Conversas: {len(conversas):,}")

    contador      = Counter()
    exemplos      = defaultdict(list)
    anomalias_ia  = []
    lixo_filtrado = 0
    total_bruto   = 0
    total_valido  = 0
    ops_count     = Counter()

    print("Processando...")
    for i, bloco in enumerate(conversas):
        if i % 1000 == 0:
            print(f"  [{i+1}/{len(conversas)}]")

        h = re.search(r'\*\*Operador:\*\* (.+?) \|', bloco)
        if h:
            ops_count[h.group(1).strip()] += 1

        msgs = re.findall(r'\- \*\*\[[\d:]+\] (.+?):\*\* (.+)', bloco)
        for rem_raw, mensagem in msgs:
            rem = rem_raw.strip()
            msg = mensagem.strip()
            if not msg or len(msg) < 2:
                continue

            if eh_anomalia_ia(rem, msg):
                anomalias_ia.append(msg[:300])

            if is_operador(rem):
                continue

            total_bruto += 1

            if eh_lixo_sistema(msg) or 'ARQUIVO' in msg or 'MÍDIA' in msg:
                lixo_filtrado += 1
                continue

            total_valido += 1
            cats = classificar(msg)
            for cat in cats:
                contador[cat] += 1
                if len(exemplos[cat]) < 15:
                    exemplos[cat].append(msg)

    return {
        "total_bruto": total_bruto,
        "lixo_filtrado": lixo_filtrado,
        "total_valido": total_valido,
        "total_conversas": len(conversas),
        "contador": contador.most_common(),
        "exemplos": dict(exemplos),
        "anomalias_ia": anomalias_ia,
        "operadores": ops_count.most_common(),
    }

# =============================================================================
# RELATORIO
# =============================================================================
LABELS = {
    "seladora":                     "Seladora",
    "envasadora_dosadora":          "Envasadora / Dosadora",
    "preco_orcamento":              "Preco / Orcamento",
    "embaladora_empacotadora":      "Embaladora / Empacotadora",
    "rotuladora":                   "Rotuladora",
    "maquina_vacuo":                "Maquina a Vacuo",
    "esteira_rolete":               "Esteira / Rolete",
    "rosqueadora_tampadora":        "Rosqueadora / Tampadora",
    "pecas_insumos":                "Pecas e Insumos",
    "balanca_dosadora":             "Balanca / Dosadora com Balanca",
    "fechadora_caixa":              "Fechadora de Caixa",
    "arqueadora_fita":              "Arqueadora / Fita",
    "cadastro_conta_b2b":           "Cadastro / CNPJ / B2B",
    "devolucao_garantia_assistencia": "Devolucao / Garantia / Assistencia",
    "rastreio_entrega":             "Rastreio / Entrega",
    "nota_fiscal_documento":        "Nota Fiscal / Documento",
    "forma_pagamento":              "Forma de Pagamento",
    "gargalo_ecommerce":            "Gargalo E-commerce (Carrinho/Site)",
    "localizacao_horario":          "Localizacao / Horario",
    "contato_whatsapp_vendedor":    "Contato / WhatsApp / Vendedor",
    "suporte_tecnico_manual":       "Suporte Tecnico / Manual",
    "showroom_visita":              "Showroom / Visita",
    "saudacao_abertura":            "Saudacoes e Aberturas",
    "captura_lead_dados":           "Captura de Lead / Dados (CNPJ, email, tel)",
    "continuidade_conversa":        "Continuidade de Conversa (Sim, Ok, Obrigado)",
    "emprego_curriculo":            "Emprego / Curriculo",
    "intencao_b2b_parceria":        "Intencao B2B / Parceria",
    "pos_venda_suporte_vago":       "Pos-Venda / Suporte Vago",
    "contexto_aplicacao_produto":   "Contexto de Aplicacao (o que vai fazer)",
    "consulta_disponibilidade":     "Consulta de Disponibilidade / Estoque",
    "outros_residual":              "Outros (residual)",
}

def gerar_relatorio(r, saida):
    tv   = r['total_valido']
    tb   = r['total_bruto']
    lixo = r['lixo_filtrado']
    tc   = r['total_conversas']

    L = []
    L.append("# Relatorio Tecfag v4 - Classificacao Completa")
    L.append(f"> {tc:,} conversas | Regra 1+2+3 aplicadas")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## REGRA 1 - Lixo de Sistema Filtrado")
    L.append("")
    L.append("| Metrica | Valor |")
    L.append("|---------|-------|")
    L.append(f"| Mensagens brutas dos clientes | **{tb:,}** |")
    L.append(f"| Logs de sistema/navegacao removidos | **{lixo:,}** ({lixo/tb*100:.1f}%) |")
    L.append(f"| Mensagens reais apos filtragem | **{tv:,}** |")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## REGRA 2 - Tabela Principal de Intencoes")
    L.append("")
    L.append(f"> Base: **{tv:,} mensagens reais** | Meta: Outros < 5%")
    L.append("")
    L.append("| # | Categoria | Qtd | % |")
    L.append("|---|-----------|-----|---|")

    for idx, (cat, cnt) in enumerate(r['contador'], 1):
        pct   = cnt / tv * 100 if tv else 0
        label = LABELS.get(cat, cat)
        L.append(f"| {idx} | {label} | {cnt:,} | {pct:.2f}% |")

    outros_cnt = dict(r['contador']).get('outros_residual', 0)
    outros_pct = outros_cnt / tv * 100 if tv else 0
    status     = "ABAIXO" if outros_pct < 5 else "ACIMA"
    L.append("")
    L.append(f"> Outros residual: **{outros_cnt:,} ({outros_pct:.2f}%)** -- {status} da meta de 5%")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## REGRA 3 - Anomalias do Fagner AI (Prompt Leak)")
    L.append("")

    if r['anomalias_ia']:
        L.append(f"| Tipo | Ocorrencias |")
        L.append(f"|------|-------------|")
        L.append(f"| Prompt leak em ingles | **{len(r['anomalias_ia'])}** |")
        L.append("")
        L.append("**Exemplos detectados:**")
        L.append("")
        for msg in r['anomalias_ia']:
            L.append(f'- *"{msg[:250]}"*')
        L.append("")
        L.append("> ACAO OBRIGATORIA: Reescrever guardrails do system prompt em portugues.")
        L.append("")
    else:
        L.append("> Nenhuma anomalia de prompt leak detectada.")
        L.append("")

    L.append("---")
    L.append("")
    L.append("## Exemplos por Categoria")
    L.append("")
    for cat, cnt in r['contador']:
        exs = r['exemplos'].get(cat, [])
        if not exs:
            continue
        label = LABELS.get(cat, cat)
        pct   = cnt / tv * 100 if tv else 0
        L.append(f"### {label} - {cnt:,} ({pct:.2f}%)")
        L.append("")
        for ex in exs[:8]:
            ex_c = ex[:180] + "..." if len(ex) > 180 else ex
            L.append(f'- *"{ex_c}"*')
        L.append("")

    L.append("---")
    L.append("*Relatorio v4 - 30/03/2026*")

    with open(saida, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))
    print(f"Relatorio salvo: {saida}")

# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    caminho_md = Path("relatorio_conversas_completo.md")
    saida_md   = Path("analise_v4_sem_outros.md")
    saida_json = Path("analise_v4_dados.json")

    print("=" * 60)
    print("ANALISADOR v4 - SEM OUTROS | TECFAG / FAGNER AI")
    print("=" * 60)

    r = analisar(caminho_md)

    with open(saida_json, 'w', encoding='utf-8') as f:
        exportar = {k: v for k, v in r.items() if k != 'exemplos'}
        json.dump(exportar, f, ensure_ascii=False, indent=2)

    gerar_relatorio(r, saida_md)

    tv = r['total_valido']
    print(f"\n{'='*60}")
    print(f"RESULTADO FINAL")
    print(f"{'='*60}")
    print(f"Msgs brutas  : {r['total_bruto']:,}")
    print(f"Lixo removido: {r['lixo_filtrado']:,}")
    print(f"Msgs validas : {tv:,}")
    print(f"Anomalias IA : {len(r['anomalias_ia'])}")
    print()
    print("TABELA DE INTENCOES:")
    for cat, cnt in r['contador']:
        pct = cnt / tv * 100
        bar = chr(9608) * min(int(pct), 50)
        label = LABELS.get(cat, cat)[:38]
        print(f"  {label:<40} {cnt:>5,}  {pct:5.2f}%  {bar}")
    print()
    outros = dict(r['contador']).get('outros_residual', 0)
    print(f"Outros residual: {outros:,} ({outros/tv*100:.2f}%) -- meta < 5%")
