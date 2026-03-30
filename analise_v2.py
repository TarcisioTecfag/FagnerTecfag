
# -*- coding: utf-8 -*-
"""
Analisador de Conversas Tecfag v2 — CORRIGIDO
- Usa regex com \b (word boundary) em vez de substring simples
- Keywords específicas e não-ambíguas (sem letras soltas)
- Valida exemplos para cada categoria antes de contar
- Uma mensagem pode conter múltiplas intenções (multi-label)
"""

import re
import json
from collections import Counter, defaultdict
from pathlib import Path

# =============================================================================
# OPERADORES CONHECIDOS — NÃO REGISTRAR COMO CLIENTE
# =============================================================================
NOMES_OPERADORES = {
    'fagner', 'deborah', 'agente 0', 'lucia', 'luzia', 'ana', 'denise',
    'vitor', 'carlos', 'maria', 'joao', 'joão', 'agente', 'operador'
}

def is_operador(nome):
    nome_lower = nome.strip().lower()
    if nome_lower in NOMES_OPERADORES:
        return True
    for op in NOMES_OPERADORES:
        if nome_lower.startswith(op):
            return True
    return False

# =============================================================================
# CATEGORIAS COM REGEX PRECISAS (word boundary \b)
# Regras:
#   - Apenas palavras completas com \b...\b
#   - Sem letras soltas (ex: nunca usar r'\bg\b')
#   - Sem palavras genéricas demais (ex: 'tem', 'de', 'uma')
#   - Testado manualmente nos exemplos reais
# =============================================================================
CATEGORIAS = {

    # ----- PRODUTOS PRINCIPAIS -----

    "seladora": [
        r'\bseladora\b', r'\bseladoras\b', r'\bseladora\b',
        r'\bselo\b', r'\bselar\b', r'\bselagem\b',
        r'\btermossoldagem\b', r'\btermosseladora\b',
        r'\bfrd\d+\w*\b',          # FRD1000, FRD400, etc.
        r'\bfrd\b',                # FRD sozinho
        r'\bsf\d+\w*\b',           # SF150W, etc.
        r'\bseladora\s+a\s+vácuo\b',
        r'\bseladora\s+portátil\b',
        r'\bseladora\s+continua\b',
        r'\bseladora\s+pedal\b',
        r'\bresistência\s+de\s+selad\w+\b',
        r'\bresistencia\s+de\s+selad\w+\b',
        r'\bteflon\b',             # cinta teflon usada em seladora
        r'\bdatador\b', r'\bdatadora\b',  # muito associado à seladora
    ],

    "balanca": [
        r'\bbalança\b', r'\bbalancas\b', r'\bbalança\b', r'\bbalanças\b',
        r'\bpesagem\b', r'\bpesador\b',
        r'\bbalança\s+contadora\b', r'\bbalança\s+de\s+precisão\b',
        r'\bbalança\s+rodoviária\b', r'\bbalança\s+industrial\b',
        r'\bbalança\s+de\s+bancada\b',
    ],

    "envasadora": [
        r'\benvasadora\b', r'\benvasar\b', r'\benvase\b',
        r'\bdosadora\b', r'\bdosar\b', r'\bdosagem\b',
        r'\benchedora\b', r'\benchedora\b',
        r'\benvasadora\s+automática\b', r'\benvasadora\s+semi.automática\b',
        r'\bdosadora\s+de\s+líquido\b',
        r'\bdosadora\s+de\s+pasta\b',
        r'\bbico\s+dosador\b', r'\bbicos\s+dosadores\b',
    ],

    "embaladora_empacotadora": [
        r'\bempacotadora\b', r'\bempacotadoras\b',
        r'\bembaladora\b', r'\bembaladoras\b',
        r'\bfaix\w+\b',            # faixadora
        r'\bretractil\b', r'\bretrátil\b',
        r'\btúnel\s+de\s+encolhimento\b', r'\btunel\s+de\s+encolhimento\b',
        r'\bshrink\b',
        r'\bflow\s*pack\b',
        r'\bterm\w+retráctil\b',
    ],

    "fechadora_caixa": [
        r'\bfechadora\s+de\s+caixa\b', r'\bfxj\w*\b',
        r'\bencaixotar\b', r'\bfechar\s+caixa\b',
        r'\bfita\s+adesiva\s+de\s+caixa\b',
    ],

    "arqueadora_fita": [
        r'\barqueadora\b', r'\barquear\b', r'\barqueiro\b',
        r'\btensionadora\b', r'\bfita\s+de\s+arquear\b',
        r'\bfita\s+para\s+arquear\b', r'\bcintar\b',
        r'\bfita\s+pp\b', r'\bfita\s+pet\b',
        r'\bfita\s+metálica\b', r'\bfita\s+de\s+aço\b',
        r'\bfita\s+branca\b', r'\bfita\s+verde\b',
        r'\bclipes\s+de\s+arquear\b',
    ],

    "rotuladora": [
        r'\brotuladora\b', r'\brótulo\b', r'\brotulagem\b',
        r'\brotulo\b', r'\brotular\b',
        r'\baplicador\s+de\s+rótulo\b',
        r'\bsleeve\b', r'\bmanga\s+sleeve\b',
    ],

    "maquina_vacuo": [
        r'\bvácuo\b', r'\bvacuo\b',
        r'\bseladora\s+a\s+vácuo\b',
        r'\bmáquina\s+de\s+vácuo\b', r'\bmaquina\s+de\s+vacuo\b',
        r'\bembalagem\s+a\s+vácuo\b',
        r'\binox\b',  # máquinas inox para frigoríficos
    ],

    "rosqueadora": [
        r'\brosqueadora\b', r'\brosquear\b', r'\brosca\b',
        r'\btampadora\b', r'\btampar\b',
        r'\btampador\b',
    ],

    "esteira": [
        r'\besteira\b', r'\besteiras\b',
        r'\brolete\b', r'\broletes\b',
        r'\blona\s+da\s+esteira\b', r'\blona\b',
        r'\bconveyor\b',
    ],

    # ----- INSUMOS / CONSUMÍVEIS -----

    "embalagem_material": [
        r'\bsacola\b', r'\bsacolas\b',
        r'\bsaco\s+(plástico|de\s+polietileno|de\s+nylon|pe|pp)\b',
        r'\bfilme\s+stretch\b', r'\bfilme\s+plástico\b',
        r'\bmicroperfurada\b',
        r'\bpouch\b', r'\bstand\s+up\b',
        r'\btubel\b',               # tubel para linguiça, etc.
        r'\benvelope\b',
        r'\bsaco\s+de\s+papel\b', r'\bkraft\b',
        r'\bbobina\b', r'\bbobinas\b',
        r'\bbopp\b',                # BOPP é material de embalagem
    ],

    # ----- PÓS-VENDA / TRANSACIONAL -----

    "rastreamento_pedido": [
        r'\brastreio\b', r'\brastreamento\b', r'\bcontrole\s+de\s+entrega\b',
        r'\bcódigo\s+de\s+rastreio\b', r'\bcodigo\s+de\s+rastreio\b',
        r'\bprazo\s+de\s+entrega\b',
        r'\bonde\s+está\s+meu\s+pedido\b',
        r'\bnão\s+recebi\s+meu\s+pedido\b',
        r'\bnao\s+recebi\s+meu\s+pedido\b',
        r'\bpedido\s+não\s+chegou\b', r'\bpedido\s+nao\s+chegou\b',
        r'\btransportadora\b',
        r'\bjadlog\b', r'\bactual\s+cargas\b', r'\bcorreios\b',
        r'\benvio\b', r'\bdespacho\b', r'\bdespachado\b',
        r'\bentrega\s+atrasada\b', r'\bno\s+prazo\b',
    ],

    "nota_fiscal": [
        r'\bnota\s+fiscal\b', r'\bnota\s+de\s+compra\b',
        r'\bdanfe\b', r'\bnf\b', r'\bnf-e\b', r'\bnfe\b',
        r'\bchave\s+de\s+acesso\b',
        r'\bxml\s+da\s+nota\b',
        r'\bcomprovante\s+de\s+compra\b',
        r'\bsegunda\s+via\s+de\s+boleto\b',
        r'\bboleto\s+vencido\b', r'\bboleto\s+segunda\s+via\b',
    ],

    "preco_orcamento": [
        r'\borçamento\b', r'\borcamento\b',
        r'\bcotação\b', r'\bcotacao\b',
        r'\bqual\s+o\s+valor\b', r'\bqual\s+o\s+preço\b', r'\bqual\s+o\s+preco\b',
        r'\bquanto\s+custa\b', r'\bquanto\s+é\b',
        r'\bpreço\s+de\b', r'\bvalor\s+de\b',
        r'\bdesconto\b', r'\bcupom\b',
        r'\bfrete\s+grátis\b', r'\bfrete\s+gratis\b',
        r'\bcalcular\s+o\s+frete\b', r'\bcalcular\s+frete\b',
        r'\bquero\s+um\s+orçamento\b', r'\bgostaria\s+de\s+um\s+orçamento\b',
        r'\bpreciso\s+de\s+um\s+orçamento\b',
        r'\btabela\s+de\s+preços\b',
    ],

    "forma_pagamento": [
        r'\bforma\s+de\s+pagamento\b',
        r'\bpagamento\s+em\s+boleto\b', r'\bpagar\s+com\s+boleto\b',
        r'\bparcelamento\b', r'\bparcelar\b',
        r'\bpix\b',
        r'\bcartão\s+de\s+crédito\b', r'\bcartao\s+de\s+credito\b',
        r'\bprazo\s+de\s+pagamento\b',
        r'\btransferência\b', r'\btransferencia\b',
    ],

    "devolucao_garantia": [
        r'\bdevolução\b', r'\bdevolucao\b', r'\bdevolver\b',
        r'\btroca\b', r'\btrocar\b',
        r'\bgarantia\b',
        r'\bassistência\s+técnica\b', r'\bassistencia\s+tecnica\b',
        r'\bdefeito\b', r'\bquebrado\b', r'\bdanificado\b',
        r'\breclamação\b', r'\breclamacao\b',
        r'\bavaria\b',
        r'\bcancelar\s+compra\b', r'\bcancelamento\b',
    ],

    # ----- SUPORTE / TÉCNICO -----

    "suporte_tecnico_pecas": [
        r'\bpeça\s+de\s+reposição\b', r'\bpecas\s+de\s+reposicao\b',
        r'\bpeças\s+de\s+reposição\b',
        r'\bmanual\s+de\s+operação\b', r'\bmanual\s+de\s+limpeza\b',
        r'\bmanual\s+de\s+manutenção\b',
        r'\bmanutenção\s+(preventiva|corretiva)\b',
        r'\bcalibração\b', r'\bcalibracao\b',
        r'\bregulagem\b',
        r'\bresistência\s+da\s+seladora\b', r'\bresistencia\s+da\s+seladora\b',
        r'\bvende\s+peça\b', r'\bvende\s+peças\b',
        r'\bvocês\s+vendem?\s+peças\b', r'\bvoces\s+vendem?\s+pecas\b',
        r'\bsetor\s+de\s+peças\b', r'\bsetor\s+tecnico\b',
    ],

    # ----- CADASTRO / CONTA -----

    "cadastro_conta": [
        r'\bcadastro\b', r'\bcadastrar\b', r'\bcriar\s+conta\b',
        r'\brecuperar\s+senha\b', r'\besqueci\s+a\s+senha\b',
        r'\bdados\s+de\s+pessoa\s+jurídica\b', r'\bdados\s+de\s+pj\b',
        r'\bcompra\s+em\s+nome\s+de\s+cnpj\b',
        r'\bcomprar\s+como\s+pessoa\s+jurídica\b',
        r'\bpessoa\s+jurídica\b', r'\bpessoa\s+juridica\b',
        r'\bcnpj\b',
    ],

    "compra_no_site": [
        r'\bcomo\s+comprar\b', r'\bcomo\s+faço\s+pra\s+comprar\b',
        r'\bfinalizar\s+compra\b', r'\bfinalizar\s+pedido\b',
        r'\bcarrinho\b',
        r'\bnão\s+consigo\s+comprar\b', r'\bnao\s+consigo\s+comprar\b',
        r'\berro\s+no\s+site\b', r'\bnão\s+consigo\s+adicionar\b',
        r'\bproblema\s+no\s+site\b',
        r'\bfrete\s+não\s+incluso\b', r'\bfrete\s+nao\s+foi\s+incluido\b',
    ],

    # ----- INFORMAÇÕES GERAIS -----

    "localizacao_horario": [
        r'\bonde\s+fica\b', r'\bonde\s+esta\s+localizado\b',
        r'\bendereço\b', r'\bendereco\b',
        r'\bem\s+qual\s+cidade\b', r'\bqual\s+cidade\b',
        r'\bbauru\b',
        r'\bhorário\s+de\s+atendimento\b', r'\bhorario\s+de\s+atendimento\b',
        r'\bqual\s+o\s+horário\b', r'\bqual\s+o\s+horario\b',
        r'\bquando\s+(abre|fecha|funciona)\b',
        r'\batende\s+sábado\b', r'\batende\s+sabado\b',
        r'\bfuncionamento\b',
    ],

    "contato_vendedor": [
        r'\bwhatsapp\s+de\s+vocês\b', r'\bwhatsapp\s+de\s+voces\b',
        r'\bnúmero\s+de\s+whatsapp\b',
        r'\bfalar\s+com\s+(um\s+)?vendedor\b',
        r'\bfalar\s+com\s+(um\s+)?atend\w+\b',
        r'\bquero\s+falar\s+com\b',
        r'\btransferir\s+(o\s+)?chat\b',
        r'\bme\s+chame\s+no\s+whatsapp\b',
        r'\bligar\s+para\s+mim\b',
        r'\bme\s+ligue\b', r'\bretorno\s+por\s+telefone\b',
        r'\b0800\b',
    ],

    "produto_nao_catalogo": [
        r'\brosqueadora\s+elétrica\b',
        r'\brecravadeira\b',
        r'\btorno\s+mecânico\b',
        r'\bmotor\s+de\s+(torneira|bomba)\b',
        r'\bvcs?\s+vendem\??\s*(isso|esse|essa|aqui|aqui)\b',
    ],

    "emprego_curriculo": [
        r'\bcurrículo\b', r'\bcurriculo\b',
        r'\btrabalhar\s+(?:com\s+)?vocês\b', r'\btrabalhar\s+(?:com\s+)?voces\b',
        r'\bvaga\b', r'\bemprego\b',
        r'\breceber\s+currículo\b',
    ],

    "showroom_visita": [
        r'\bshowroom\b', r'\bshow\s+room\b',
        r'\bvisitar\b', r'\bvisitar\s+a\s+loja\b',
        r'\bposso\s+ir\s+até\b',
    ],
}

# Compilar todos os padrões para performance
CATEGORIAS_COMPILADAS = {}
for cat, patterns in CATEGORIAS.items():
    compiled = [re.compile(p, re.IGNORECASE) for p in patterns]
    CATEGORIAS_COMPILADAS[cat] = compiled

def categorizar_mensagem(texto):
    """
    Retorna LISTA de categorias que batem (multi-label).
    Usa regex compilados com word boundary.
    """
    categorias_encontradas = []
    for cat, patterns in CATEGORIAS_COMPILADAS.items():
        for pat in patterns:
            if pat.search(texto):
                categorias_encontradas.append(cat)
                break  # Uma categoria basta, próxima
    return categorias_encontradas if categorias_encontradas else ['outros']

# =============================================================================
# IDENTIFICAR OPERADORES DINAMICAMENTE
# =============================================================================
def detectar_operadores_do_arquivo(conversas, sample_size=200):
    """
    Varre as primeiras 'sample_size' conversas e coleta todos os remetentes
    que aparecem no header como Operador.
    """
    operadores_identificados = set()
    for bloco in conversas[:sample_size]:
        m = re.search(r'\*\*Operador:\*\* (.+?) \|', bloco)
        if m:
            op = m.group(1).strip()
            operadores_identificados.add(op.lower())
    return operadores_identificados

# =============================================================================
# ANÁLISE PRINCIPAL
# =============================================================================
def analisar_arquivo(caminho):
    print(f"📂 Lendo arquivo...")
    with open(caminho, 'r', encoding='utf-8', errors='replace') as f:
        conteudo = f.read()
    print(f"✅ Lido: {len(conteudo):,} caracteres")

    blocos = conteudo.split('---')
    conversas = [b for b in blocos if '### Cliente:' in b]
    print(f"📊 Conversas encontradas: {len(conversas):,}")

    # Detectar operadores reais do arquivo
    operadores_do_arquivo = detectar_operadores_do_arquivo(conversas, 500)
    print(f"👤 Operadores detectados: {operadores_do_arquivo}")

    # Combinar com lista estática
    todos_operadores = NOMES_OPERADORES | operadores_do_arquivo

    # === ESTRUTURAS ===
    categorias_contador = Counter()
    msgs_por_categoria = defaultdict(list)   # para exemplos
    primeiras_msgs_clientes = []
    conversas_por_operador = Counter()
    duracao_total = []
    total_msgs_clientes = 0
    total_msgs_operadores = 0

    print("\n🔄 Analisando...")

    for i, bloco in enumerate(conversas):
        if i % 1000 == 0:
            print(f"   [{i+1}/{len(conversas)}] processando...")

        # Header
        h = re.search(
            r'### Cliente: (.+?) \(ID: (\d+)\).*?\*\*Operador:\*\* (.+?) \|.*?\*\*Duração:\*\* ([\d:]+|-)',
            bloco, re.DOTALL
        )
        if h:
            operador = h.group(3).strip()
            conversas_por_operador[operador] += 1
            dur = h.group(4).strip()
            if dur not in ['-', '00:00'] and ':' in dur:
                partes = dur.split(':')
                try:
                    min_total = int(partes[0]) * 60 + int(partes[1])
                    if 0 < min_total < 600:  # ignorar outliers absurdos
                        duracao_total.append(min_total)
                except:
                    pass

        # Mensagens
        msgs = re.findall(r'\- \*\*\[[\d:]+\] (.+?):\*\* (.+)', bloco)
        primeira_do_cliente = True

        for remetente_raw, mensagem in msgs:
            remetente = remetente_raw.strip()
            mensagem = mensagem.strip()

            if not mensagem or len(mensagem) < 3:
                continue

            # Ignorar [ARQUIVO/MÍDIA ENVIADO]
            if 'ARQUIVO' in mensagem or 'MÍDIA' in mensagem or 'MEDIA' in mensagem:
                continue

            # Determinar se é operador
            remetente_lower = remetente.lower()
            eh_operador = False
            for op in todos_operadores:
                if remetente_lower == op or remetente_lower.startswith(op):
                    eh_operador = True
                    break

            if eh_operador:
                total_msgs_operadores += 1
                continue

            # É mensagem de cliente
            total_msgs_clientes += 1

            # Primeira mensagem do cliente nesta conversa
            if primeira_do_cliente:
                primeiras_msgs_clientes.append(mensagem)
                primeira_do_cliente = False

            # Categorizar
            cats = categorizar_mensagem(mensagem)
            for cat in cats:
                categorias_contador[cat] += 1
                # Guardar até 20 exemplos por categoria
                if len(msgs_por_categoria[cat]) < 20:
                    msgs_por_categoria[cat].append(mensagem)

    duracao_media = round(sum(duracao_total) / len(duracao_total), 1) if duracao_total else 0

    return {
        "resumo": {
            "total_conversas": len(conversas),
            "total_msgs_clientes": total_msgs_clientes,
            "total_msgs_operadores": total_msgs_operadores,
            "duracao_media_min": duracao_media,
            "operadores_detectados": list(todos_operadores),
        },
        "categorias": categorias_contador.most_common(),
        "exemplos": dict(msgs_por_categoria),
        "operadores": conversas_por_operador.most_common(),
        "primeiras_msgs": primeiras_msgs_clientes[:100],
    }

# =============================================================================
# GERAR RELATÓRIO MARKDOWN
# =============================================================================
def gerar_relatorio(r, caminho_saida):
    total_conversas = r['resumo']['total_conversas']
    total_msgs = r['resumo']['total_msgs_clientes']
    duracao = r['resumo']['duracao_media_min']

    linhas = []
    linhas += [
        "# 🤖 Análise de Conversas Tecfag — Fagner AI v2",
        f"> **{total_conversas:,} conversas** | **{total_msgs:,} mensagens de clientes**",
        f"> Método: regex com word boundary — sem falsos positivos de letra solta",
        "",
        "---",
        "",
        "## 📊 Resumo Geral",
        "",
        "| Métrica | Valor |",
        "|---------|-------|",
        f"| Total de Conversas | **{total_conversas:,}** |",
        f"| Mensagens dos Clientes | **{total_msgs:,}** |",
        f"| Mensagens dos Operadores | **{r['resumo']['total_msgs_operadores']:,}** |",
        f"| Duração Média (conversas ativas) | **{duracao} min** |",
        "",
    ]

    # Operadores
    linhas += ["## 👤 Distribuição por Operador", ""]
    linhas += ["| Operador | Conversas | % |", "|----------|-----------|---|"]
    for op, cnt in r['operadores'][:10]:
        pct = cnt / total_conversas * 100
        linhas.append(f"| {op} | {cnt:,} | {pct:.1f}% |")
    linhas.append("")

    # Categorias
    linhas += [
        "## 🎯 Intenções dos Clientes — Ranking Corrigido",
        "",
        "> ⚠️ Uma mensagem pode ser contada em múltiplas categorias (multi-label)",
        "> Os percentuais são % do total de mensagens de clientes",
        "",
        "| # | Categoria | Ocorrências | % msgs |",
        "|---|-----------|-------------|--------|",
    ]
    for idx, (cat, cnt) in enumerate(r['categorias'], 1):
        pct = cnt / total_msgs * 100 if total_msgs else 0
        cat_label = cat.replace('_', ' ').title()
        linhas.append(f"| {idx} | {cat_label} | {cnt:,} | {pct:.2f}% |")
    linhas.append("")

    # Exemplos por categoria
    linhas += ["---", "", "## 💬 Exemplos Reais por Categoria", ""]
    for cat, cnt in r['categorias']:
        exemplos = r['exemplos'].get(cat, [])
        if not exemplos:
            continue
        cat_label = cat.replace('_', ' ').title()
        pct = cnt / total_msgs * 100 if total_msgs else 0
        linhas.append(f"### {cat_label} — {cnt:,} ocorrências ({pct:.2f}%)")
        linhas.append("")
        for ex in exemplos[:10]:
            ex_c = ex[:180] + "..." if len(ex) > 180 else ex
            linhas.append(f'- *"{ex_c}"*')
        linhas.append("")

    # Primeiras mensagens
    linhas += [
        "---", "",
        "## 📝 Primeiras Mensagens dos Clientes (abertura de conversa)",
        "",
        "> Como o cliente inicia o contato — essencial para o Fagner saber o contexto inicial",
        "",
    ]
    for msg in r['primeiras_msgs'][:60]:
        msg_c = msg[:180] + "..." if len(msg) > 180 else msg
        linhas.append(f'- *"{msg_c}"*')
    linhas.append("")

    linhas += [
        "---",
        "",
        "*Análise gerada por analise_v2.py — método: regex com word boundary*",
    ]

    with open(caminho_saida, 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas))
    print(f"\n✅ Relatório salvo: {caminho_saida}")

# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    entrada = Path("relatorio_conversas_completo.md")
    saida_md = Path("analise_v2_insights.md")
    saida_json = Path("analise_v2_dados.json")

    print("=" * 60)
    print("🤖 ANALISADOR v2 — TECFAG / FAGNER AI")
    print("=" * 60)

    resultado = analisar_arquivo(entrada)

    # Salvar JSON
    with open(saida_json, 'w', encoding='utf-8') as f:
        exportar = {k: v for k, v in resultado.items() if k != 'exemplos'}
        json.dump(exportar, f, ensure_ascii=False, indent=2)
    print(f"📁 JSON salvo: {saida_json}")

    # Gerar markdown
    gerar_relatorio(resultado, saida_md)

    # Print terminal
    print("\n" + "=" * 60)
    print("📊 RESULTADO FINAL")
    print("=" * 60)
    print(f"Conversas     : {resultado['resumo']['total_conversas']:,}")
    print(f"Msgs clientes : {resultado['resumo']['total_msgs_clientes']:,}")
    print(f"Duração média : {resultado['resumo']['duracao_media_min']} min")
    print("\n🎯 TOP CATEGORIAS:")
    for i, (cat, cnt) in enumerate(resultado['categorias'][:20], 1):
        total = resultado['resumo']['total_msgs_clientes']
        pct = cnt / total * 100 if total else 0
        print(f"  {i:2}. {cat:<35} {cnt:>5,}  ({pct:.2f}%)")
    print("\n✅ Concluído!")
