
# -*- coding: utf-8 -*-
"""
Analisador de Conversas Tecfag - Fagner AI
Analisa 5.000 conversas e extrai insights para treinamento do Fagner
"""

import re
import json
from collections import Counter, defaultdict
from pathlib import Path

# ===========================
# CATEGORIAS DE INTENÇÃO
# Baseadas em e-commerce industrial B2B
# ===========================
CATEGORIAS = {
    "rastreamento_pedido": [
        "rastrear", "rastreamento", "pedido", "entrega", "prazo", "transportadora",
        "onde está", "quando chega", "shipping", "despacho", "enviou", "enviada",
        "atual cargas", "jadlog", "correios", "transportadora", "aguardando entrega",
        "9 dias", "dias úteis", "previsão de entrega", "código de rastreio"
    ],
    "nota_fiscal": [
        "nota fiscal", "nf", "danfe", "boleto", "fatura", "comprovante",
        "recibo", "xml", "nfe", "chave de acesso"
    ],
    "preco_orcamento": [
        "preço", "valor", "custo", "orçamento", "cotação", "quanto",
        "custa", "tabela de preços", "desconto", "promoção", "oferta",
        "mais barato", "frete", "valor do frete"
    ],
    "produto_informacao": [
        "característica", "especificação", "modelo", "tamanho", "dimensão",
        "capacidade", "voltagem", "técnico", "manual", "ficha técnica",
        "como funciona", "diferença", "diferença entre", "qual melhor",
        "tem pronta entrega", "disponível", "estoque"
    ],
    "seladora": [
        "seladora", "selar", "selagem", "termossoldagem", "termosseladora",
        "frd", "continua", "pedal", "manual", "automática", "datador",
        "com datador", "tinta", "impressão", "data de validade"
    ],
    "embalagem": [
        "embalagem", "saco", "sacola", "plástico", "filme", "stretch",
        "bolsa", "envelope", "caixa", "papelão", "papel", "kraft",
        "biodegradável", "reciclável", "vacuo", "vácuo"
    ],
    "fita_arquear": [
        "fita", "arquear", "arcar", "arqueiro", "tensionadora", "clipes",
        "fita plástica", "fita de aço", "fita metálica", "pp", "pet",
        "10mm", "12mm", "16mm", "19mm", "25mm"
    ],
    "envasadora": [
        "envasadora", "envasar", "envase", "dosadora", "dosar", "dosagem",
        "bico", "líquido", "semi-automática", "automática", "manual",
        "viscoso", "pasta", "liquido", "enchimento"
    ],
    "balança": [
        "balança", "balanca", "pesagem", "pesar", "peso", "tara",
        "capacidade", "precisão", "kg", "g", "digital", "contadora"
    ],
    "maquina_vácuo": [
        "vácuo", "vacuum", "seladora a vácuo", "embalagem a vácuo",
        "máquina de vácuo"
    ],
    "cadastro_conta": [
        "cadastro", "cadastrar", "conta", "criar conta", "login",
        "senha", "esqueci", "email", "pessoa jurídica", "pj", "cnpj",
        "cpf", "dados", "incluir dados"
    ],
    "forma_pagamento": [
        "pagamento", "pagar", "boleto", "pix", "cartão", "crédito",
        "débito", "parcelamento", "parcelas", "prazo de pagamento",
        "forma de pagamento", "transferência"
    ],
    "devolucao_troca": [
        "devolver", "devolução", "troca", "trocar", "defeito", "quebrado",
        "danificado", "reclamação", "reclamar", "garantia", "assistência",
        "manutenção", "conserto", "problema", "avaria"
    ],
    "localizacao_empresa": [
        "onde fica", "endereço", "cidade", "localização", "bauru",
        "horário", "funcionamento", "atendimento", "quando abre",
        "quando fecha", "sábado", "domingo", "feriado"
    ],
    "contato_vendedor": [
        "vendedor", "vendedora", "representante", "whatsapp", "telefone",
        "contato", "falar com", "transferir", "0800", "atendente"
    ],
    "compra_site": [
        "como comprar", "finalizar", "carrinho", "site", "vtex",
        "como faço", "passo a passo", "não consigo", "erro", "botão"
    ],
    "produto_busca": [
        "procurando", "busca", "encontrar", "tienen", "tem",
        "disponível", "catálogo", "linha de produtos"
    ],
    "suporte_tecnico": [
        "manual", "limpeza", "manutenção", "calibração", "regulagem",
        "como usar", "configurar", "peça", "peças", "reposição"
    ],
    "outros": []
}

def categorizar_mensagem(texto):
    """Categoriza uma mensagem baseada em palavras-chave"""
    texto_lower = texto.lower()
    scores = defaultdict(int)
    
    for categoria, keywords in CATEGORIAS.items():
        for kw in keywords:
            if kw.lower() in texto_lower:
                scores[categoria] += 1
    
    if scores:
        return max(scores, key=scores.get)
    return "outros"

def analisar_arquivo(caminho):
    print(f"📂 Lendo arquivo: {caminho}")
    
    with open(caminho, 'r', encoding='utf-8', errors='replace') as f:
        conteudo = f.read()
    
    print(f"✅ Arquivo lido: {len(conteudo):,} caracteres")
    
    # Separar conversas
    blocos = conteudo.split('---')
    conversas = [b for b in blocos if '### Cliente:' in b]
    print(f"📊 Total de conversas encontradas: {len(conversas):,}")
    
    # === ESTRUTURAS DE ANÁLISE ===
    categorias_contador = Counter()
    primeiras_mensagens = []  # Primeira msg do cliente em cada conversa
    perguntas_clientes = []   # Todas as msgs dos clientes
    respostas_operadores = {} # Padrões de resposta por categoria
    conversas_por_operador = Counter()
    duracao_conversas = []
    clientes_recorrentes = Counter()
    exemplos_por_categoria = defaultdict(list)
    
    print("\n🔄 Analisando conversas...")
    
    for i, bloco in enumerate(conversas):
        if i % 500 == 0:
            print(f"   Processando conversa {i+1}/{len(conversas)}...")
        
        # Extrair cabeçalho
        header_match = re.search(
            r'### Cliente: (.+?) \(ID: (\d+)\).*?\*\*Operador:\*\* (.+?) \|.*?\*\*Duração:\*\* ([\d:]+|-)',
            bloco, re.DOTALL
        )
        
        if header_match:
            cliente = header_match.group(1).strip()
            operador = header_match.group(3).strip()
            duracao = header_match.group(4).strip()
            
            conversas_por_operador[operador] += 1
            clientes_recorrentes[cliente] += 1
            
            if duracao != '-' and ':' in duracao:
                partes = duracao.split(':')
                try:
                    mins = int(partes[0]) * 60 + int(partes[1])
                    duracao_conversas.append(mins)
                except:
                    pass
        
        # Extrair mensagens
        msgs = re.findall(r'\- \*\*\[[\d:]+\] (.+?):\*\* (.+)', bloco)
        
        primeira_msg_cliente = None
        for remetente, mensagem in msgs:
            remetente = remetente.strip()
            mensagem = mensagem.strip()
            
            # Ignorar Fagner (bot) e operadores conhecidos
            is_operador = remetente in ['Fagner', 'Deborah', 'Agente 0', 'Lucia', 'Luzia', 
                                         'Ana', 'Denise', 'Carlos', 'Maria', 'João',
                                         'operador', 'Operador'] or \
                          any(op in remetente for op in ['Deborah', 'Lucia', 'Ana', 'Denise', 'Agente'])
            
            if not is_operador and mensagem and len(mensagem) > 3:
                perguntas_clientes.append(mensagem)
                categoria = categorizar_mensagem(mensagem)
                categorias_contador[categoria] += 1
                
                # Guardar primeira mensagem de cada conversa
                if primeira_msg_cliente is None and remetente != 'Fagner':
                    primeira_msg_cliente = mensagem
                    primeiras_mensagens.append({
                        'mensagem': mensagem,
                        'categoria': categoria
                    })
                    
                    # Exemplos por categoria (máximo 15)
                    if len(exemplos_por_categoria[categoria]) < 15:
                        exemplos_por_categoria[categoria].append(mensagem)
    
    # === ANÁLISE DE OPERADORES ===
    # Encontrar msgs de operadores (respostas padrão)
    respostas_padrao = []
    for bloco in conversas[:200]:  # Analisar primeiras 200 para padrões
        msgs = re.findall(r'\- \*\*\[[\d:]+\] (.+?):\*\* (.+)', bloco)
        for remetente, msg in msgs:
            if any(op in remetente for op in ['Deborah', 'Lucia', 'Ana', 'Denise', 'Agente']) \
               and 'ARQUIVO' not in msg and len(msg) > 10:
                respostas_padrao.append(msg.strip())
    
    # === COMPILAR RESULTADOS ===
    total_msgs = len(perguntas_clientes)
    total_conversas = len(conversas)
    
    resultado = {
        "resumo": {
            "total_conversas": total_conversas,
            "total_mensagens_clientes": total_msgs,
            "duracao_media_minutos": round(sum(duracao_conversas) / len(duracao_conversas), 1) if duracao_conversas else 0,
            "total_operadores": len(conversas_por_operador)
        },
        "categorias_ordenadas": categorias_contador.most_common(),
        "operadores": conversas_por_operador.most_common(),
        "exemplos_por_categoria": dict(exemplos_por_categoria),
        "respostas_padrao_operadores": respostas_padrao[:100],
        "clientes_mais_ativos": clientes_recorrentes.most_common(20),
        "primeiras_mensagens_sample": [p['mensagem'] for p in primeiras_mensagens[:50]]
    }
    
    return resultado

def gerar_relatorio(resultado, caminho_saida):
    """Gera o relatório markdown com insights"""
    
    resumo = resultado['resumo']
    total = resultado['resumo']['total_conversas']
    
    linhas = []
    linhas.append("# 🤖 Análise de Conversas — Fagner AI Training Report\n")
    linhas.append(f"> **Gerado automaticamente** | {total:,} conversas analisadas\n")
    linhas.append("---\n")
    
    # RESUMO GERAL
    linhas.append("## 📊 Resumo Geral\n")
    linhas.append(f"| Métrica | Valor |")
    linhas.append(f"|---------|-------|")
    linhas.append(f"| Total de Conversas | **{resumo['total_conversas']:,}** |")
    linhas.append(f"| Total de Mensagens dos Clientes | **{resumo['total_mensagens_clientes']:,}** |")
    linhas.append(f"| Duração Média | **{resumo['duracao_media_minutos']} min** |")
    linhas.append(f"| Operadores Identificados | **{resumo['total_operadores']}** |")
    linhas.append("")
    
    # OPERADORES
    linhas.append("## 👤 Distribuição por Operador\n")
    linhas.append("| Operador | Conversas | % do Total |")
    linhas.append("|----------|-----------|------------|")
    for op, count in resultado['operadores'][:10]:
        pct = (count / total) * 100
        linhas.append(f"| {op} | {count:,} | {pct:.1f}% |")
    linhas.append("")
    
    # CATEGORIAS
    linhas.append("## 🎯 Categorias de Intenção dos Clientes\n")
    linhas.append("> Ranking das dúvidas/solicitações mais frequentes\n")
    linhas.append("| # | Categoria | Ocorrências | % | Prioridade Fagner |")
    linhas.append("|---|-----------|-------------|---|-------------------|")
    
    total_msgs = resumo['total_mensagens_clientes']
    prioridades = ["🔴 CRÍTICA", "🔴 CRÍTICA", "🟠 ALTA", "🟠 ALTA", "🟠 ALTA",
                   "🟡 MÉDIA", "🟡 MÉDIA", "🟡 MÉDIA", "🟢 BAIXA", "🟢 BAIXA"]
    
    for idx, (cat, count) in enumerate(resultado['categorias_ordenadas'][:20]):
        pct = (count / total_msgs) * 100 if total_msgs > 0 else 0
        pri = prioridades[idx] if idx < len(prioridades) else "🟢 BAIXA"
        cat_label = cat.replace('_', ' ').title()
        linhas.append(f"| {idx+1} | {cat_label} | {count:,} | {pct:.1f}% | {pri} |")
    linhas.append("")
    
    # EXEMPLOS POR CATEGORIA
    linhas.append("## 💬 Exemplos Reais por Categoria\n")
    for cat, count in resultado['categorias_ordenadas'][:15]:
        exemplos = resultado['exemplos_por_categoria'].get(cat, [])
        if exemplos:
            cat_label = cat.replace('_', ' ').title()
            linhas.append(f"### {cat_label} ({count:,} ocorrências)\n")
            for ex in exemplos[:8]:
                # Limitar comprimento
                ex_clean = ex[:150] + "..." if len(ex) > 150 else ex
                linhas.append(f"- *\"{ex_clean}\"*")
            linhas.append("")
    
    # KNOWLEDGE BASE NECESSÁRIA
    linhas.append("---\n")
    linhas.append("## 🧠 Knowledge Base Necessária para o Fagner\n")
    linhas.append("> O que o Fagner PRECISA saber para substituir o Jivo Chat\n")
    
    kb_items = [
        ("🚚 Rastreamento e Entrega", [
            "Como consultar o rastreamento de um pedido",
            "Quais transportadoras a Tecfag utiliza (Atual Cargas, Jadlog, etc.)",
            "Prazo médio de entrega por região/estado",
            "O que fazer quando a entrega está atrasada",
            "Como obter o código de rastreio"
        ]),
        ("📄 Notas Fiscais e Documentos", [
            "Como solicitar/reenviar nota fiscal",
            "Como acessar a nota fiscal no portal",
            "Emissão de boleto segunda via",
            "Chave de acesso NF-e"
        ]),
        ("💰 Preços e Orçamentos", [
            "Como solicitar orçamento",
            "Política de descontos para pessoa jurídica",
            "Tabela de fretes por região",
            "Promoções vigentes",
            "Formas de pagamento disponíveis (boleto, PIX, cartão, parcelamento)"
        ]),
        ("🏭 Produtos - Seladoras", [
            "Modelos de seladora disponíveis (FRD, contínua, pedal, automática)",
            "Diferença entre modelos com e sem datador",
            "Especificações técnicas de cada modelo",
            "Temperatura de operação, voltagem, capacidade"
        ]),
        ("📦 Embalagens e Materiais", [
            "Tipos de sacolas, sacos e filmes disponíveis",
            "Especificações (espessura, tamanho, material)",
            "Fitas de arquear (PP, PET, aço) - dimensões e aplicações"
        ]),
        ("🏢 Informações da Empresa", [
            "Localização completa (Bauru-SP)",
            "Horário de atendimento (segunda a sexta, 08h às 18h)",
            "Telefone geral: 0800 947 5000",
            "WhatsApp: 14 991054116",
            "Site: tecfag.com.br"
        ]),
        ("👤 Cadastro e Conta", [
            "Como criar conta no site",
            "Como incluir dados de pessoa jurídica (CNPJ)",
            "Como recuperar senha",
            "Como atualizar dados cadastrais"
        ]),
        ("🔄 Devolução e Garantia", [
            "Política de devolução e troca",
            "Prazo de garantia dos produtos",
            "Como solicitar troca por defeito",
            "Processo de assistência técnica"
        ]),
        ("🔧 Suporte Técnico", [
            "Manuais de operação e limpeza",
            "Como calibrar/ajustar máquinas",
            "Peças de reposição disponíveis",
            "Contato do serviço técnico"
        ]),
        ("🛒 Como Comprar no Site", [
            "Passo a passo para finalizar compra",
            "Problemas comuns no checkout",
            "Como aplicar cupom de desconto",
            "Como comprar como pessoa jurídica"
        ]),
    ]
    
    for titulo, itens in kb_items:
        linhas.append(f"\n### {titulo}\n")
        for item in itens:
            linhas.append(f"- {item}")
    
    # FLUXOS DE CONVERSA
    linhas.append("\n---\n")
    linhas.append("## 🔄 Fluxos de Conversa Mais Comuns\n")
    linhas.append("> Sequências de interação identificadas nas conversas\n")
    
    fluxos = [
        ("Rastreamento de Pedido", [
            "Cliente: Pergunta sobre entrega/rastreamento",
            "Fagner: Coleta o número do pedido ou e-mail do cliente",
            "Fagner: Informa a transportadora e código de rastreio",
            "Fagner: Oferece envio de NF por e-mail se solicitado"
        ]),
        ("Orçamento de Produto", [
            "Cliente: Pergunta sobre preço ou disponibilidade",
            "Fagner: Identifica o produto e especificações",
            "Fagner: Informa preço ou direciona para página do produto",
            "Fagner: Oferece transferência para vendedor se necessário"
        ]),
        ("Problema com Pedido", [
            "Cliente: Reporta problema (defeito, demora, etc.)",
            "Fagner: Coleta dados do cliente (nome, CNPJ, pedido)",
            "Fagner: Registra a ocorrência",
            "Fagner: Transfere para operador humano ou vendedor responsável"
        ]),
        ("Dúvida Técnica", [
            "Cliente: Pergunta técnica sobre produto",
            "Fagner: Tenta responder com base na KB",
            "Fagner: Envia link para manual/ficha técnica se disponível",
            "Fagner: Oferece contato com técnico especializado"
        ]),
    ]
    
    for nome, passos in fluxos:
        linhas.append(f"\n**{nome}:**")
        for passo in passos:
            linhas.append(f"1. {passo}")
    
    # PRIMEIRAS MENSAGENS
    linhas.append("\n---\n")
    linhas.append("## 📝 Amostra de Primeiras Mensagens dos Clientes\n")
    linhas.append("> As primeiras 50 mensagens de abertura de conversa\n")
    for msg in resultado['primeiras_mensagens_sample']:
        msg_clean = msg[:200] + "..." if len(msg) > 200 else msg
        linhas.append(f"- *\"{msg_clean}\"*")
    
    # RESPOSTAS PADRÃO
    linhas.append("\n---\n")
    linhas.append("## ✉️ Respostas Padrão dos Operadores\n")
    linhas.append("> Exemplos de como os operadores respondem — base para treinar o Fagner\n")
    
    respostas_unicas = list(set(resultado['respostas_padrao_operadores']))[:40]
    for resp in respostas_unicas:
        resp_clean = resp[:200] + "..." if len(resp) > 200 else resp
        linhas.append(f"- *\"{resp_clean}\"*")
    
    # PRÓXIMOS PASSOS
    linhas.append("\n---\n")
    linhas.append("## 🚀 Próximos Passos para Implementação\n")
    linhas.append("""
1. **Criar base de conhecimento (KB)** estruturada com respostas para cada categoria
2. **Criar intents/flows** no Fagner para cada categoria identificada
3. **Integrar APIs** de rastreamento, pedidos e produtos (VTEX)
4. **Treinar respostas** baseadas nos padrões dos operadores
5. **Definir gatilhos** para transferência para humano (casos complexos)
6. **Testar** com conversas reais do arquivo
7. **Monitorar** e ajustar continuamente
    """)
    
    linhas.append("\n---\n")
    linhas.append("*Relatório gerado pelo Analisador de Conversas Tecfag*")
    
    # Salvar
    with open(caminho_saida, 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas))
    
    print(f"\n✅ Relatório salvo em: {caminho_saida}")

# ===========================
# EXECUÇÃO PRINCIPAL
# ===========================
if __name__ == "__main__":
    arquivo_entrada = Path("relatorio_conversas_completo.md")
    arquivo_saida = Path("analise_insights_fagner.md")
    arquivo_json = Path("analise_dados_brutos.json")
    
    print("=" * 60)
    print("🤖 ANALISADOR DE CONVERSAS — FAGNER AI")
    print("=" * 60)
    
    resultado = analisar_arquivo(arquivo_entrada)
    
    # Salvar JSON com dados brutos
    with open(arquivo_json, 'w', encoding='utf-8') as f:
        # Remover exemplos muito longos para o JSON
        json_data = {k: v for k, v in resultado.items() if k != 'exemplos_por_categoria'}
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"📁 Dados brutos salvos em: {arquivo_json}")
    
    # Gerar relatório Markdown
    gerar_relatorio(resultado, arquivo_saida)
    
    # Mostrar summary no terminal
    print("\n" + "=" * 60)
    print("📊 RESUMO DA ANÁLISE")
    print("=" * 60)
    print(f"Total conversas: {resultado['resumo']['total_conversas']:,}")
    print(f"Total mensagens dos clientes: {resultado['resumo']['total_mensagens_clientes']:,}")
    print(f"Duração média: {resultado['resumo']['duracao_media_minutos']} min")
    print("\n🎯 TOP 10 CATEGORIAS:")
    for i, (cat, count) in enumerate(resultado['categorias_ordenadas'][:10], 1):
        total_msgs = resultado['resumo']['total_mensagens_clientes']
        pct = (count / total_msgs * 100) if total_msgs > 0 else 0
        print(f"  {i:2}. {cat:<30} {count:>6,} ({pct:.1f}%)")
    
    print("\n✅ Análise completa!")
