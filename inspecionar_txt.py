
# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
"""
Inspeciona o mensagens.txt para entender a estrutura real dos dados
incluindo logs de navegação do JivoChat
"""
with open('mensagens.txt', 'r', encoding='utf-8', errors='replace') as f:
    linhas = f.readlines()

print(f"Total de linhas: {len(linhas):,}")
print()

# Mostrar as primeiras 150 linhas para entender o formato
print("=== PRIMEIRAS 150 LINHAS ===")
for i, l in enumerate(linhas[:150], 1):
    print(f"{i:4}: {repr(l[:120])}")

print()
print("=== LINHAS 500-600 (meio do arquivo) ===")
for i, l in enumerate(linhas[500:600], 500):
    print(f"{i:4}: {repr(l[:120])}")
