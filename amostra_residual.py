
# -*- coding: utf-8 -*-
# Mostrar amostra dos "outros_residual" para entender o que falta categorizar
import re, random
from pathlib import Path

with open('relatorio_conversas_completo.md', 'r', encoding='utf-8', errors='replace') as f:
    conteudo = f.read()

blocos = conteudo.split('---')
conversas = [b for b in blocos if '### Cliente:' in b]

OPERADORES = {'fagner','deborah','agente 0','lucia','luzia','ana','denise','vitor','carlos','maria','agente','operador','tecfag'}
def is_op(n):
    n = n.strip().lower()
    return any(n == op or n.startswith(op) for op in OPERADORES)

import sys
sys.stdout = open('amostra_residual.txt', 'w', encoding='utf-8')

SISTEMA = re.compile(r'.+\s*[-–]\s*Tecfag(\s+Personnalité)?\s*$', re.IGNORECASE)
SAUDACAO = re.compile(r'^\s*(olá|ola|oi+|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|preciso\s+de\s+ajuda|tenho\s+uma\s+duvida|tenho\s+uma\s+dúvida)\s*[!?.,]?\s*$', re.IGNORECASE)
CONTIN = re.compile(r'^\s*(sim|não|nao|ok|certo|perfeito|obrigad\w*|tchau|chegou|combinado|entendi|blz|beleza)\s*[!?.,]?\s*$', re.IGNORECASE)
PRODUTO = re.compile(r'\b(seladora|envasadora|dosadora|empacotadora|rotuladora|vácuo|rosqueadora|arqueadora|esteira|fechadora|balança|peça\s+de\s+reposição|teflon|ink\s+roll|borracha\s+de\s+silicone)\b', re.IGNORECASE)
TRANSAC = re.compile(r'\b(orçamento|cotação|nota\s+fiscal|rastreio|cnpj|garantia|devolução|parcelamento|carrinho)\b', re.IGNORECASE)

residual = []
for bloco in conversas:
    msgs = re.findall(r'\- \*\*\[[\d:]+\] (.+?):\*\* (.+)', bloco)
    for rem, msg in msgs:
        msg = msg.strip()
        if not msg or len(msg) < 3: continue
        if is_op(rem): continue
        if SISTEMA.search(msg): continue
        if 'ARQUIVO' in msg or 'MÍDIA' in msg: continue
        if SAUDACAO.match(msg): continue
        if CONTIN.match(msg): continue
        if PRODUTO.search(msg): continue
        if TRANSAC.search(msg): continue
        residual.append(msg)

random.seed(99)
sample = random.sample(residual, min(120, len(residual)))
print(f"Total residual estimado: {len(residual)}")
print()
for m in sample:
    print(repr(m[:140]))

sys.stdout.close()
print("OK")
