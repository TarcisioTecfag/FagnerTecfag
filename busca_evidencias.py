
# -*- coding: utf-8 -*-
with open('mensagens.txt', 'r', encoding='utf-8', errors='replace') as f:
    texto = f.read()

buscas = [
    'I do not discuss security',
    'internal architecture',
    'model settings',
    'resistencia do mordente',
    'resistência do mordente',
    'cinto teflon',
    'tinta solida',
    'ink roll',
    'borracha de silicone',
    'ERP',
    'CNPJ, mas ao finalizar',
    '24x sem juros',
    'parcelamento de ate 24',
    'parcelamento de até 24',
]

for termo in buscas:
    count = texto.lower().count(termo.lower())
    idx = texto.lower().find(termo.lower())
    if idx >= 0:
        ctx = texto[max(0, idx-100):idx+150].replace('\n', ' ').strip()
        print(f'[{count}x] "{termo}"')
        print(f'       Contexto: ...{ctx}...')
        print()
    else:
        print(f'[0x] "{termo}" — NAO ENCONTRADO')
        print()
