
# -*- coding: utf-8 -*-
"""
Converte mensagens.html -> mensagens.txt
Extrai apenas o texto visível, sem tags HTML, scripts ou estilos.
"""

from html.parser import HTMLParser
from pathlib import Path
import re

class HTMLToText(HTMLParser):
    """Parser que extrai texto visível do HTML."""
    
    IGNORAR_TAGS = {'script', 'style', 'head', 'meta', 'link', 'noscript'}
    QUEBRA_LINHA_TAGS = {
        'p', 'br', 'div', 'tr', 'li', 'h1', 'h2', 'h3',
        'h4', 'h5', 'h6', 'blockquote', 'section', 'article',
        'header', 'footer', 'td', 'th'
    }
    
    def __init__(self):
        super().__init__()
        self.resultado = []
        self._ignorar = False
        self._tag_stack = []
    
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        self._tag_stack.append(tag)
        if tag in self.IGNORAR_TAGS:
            self._ignorar = True
        if tag in self.QUEBRA_LINHA_TAGS:
            self.resultado.append('\n')
        if tag == 'br':
            self.resultado.append('\n')
    
    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.IGNORAR_TAGS:
            self._ignorar = False
        if tag in self.QUEBRA_LINHA_TAGS:
            self.resultado.append('\n')
        if self._tag_stack and self._tag_stack[-1] == tag:
            self._tag_stack.pop()
    
    def handle_data(self, data):
        if not self._ignorar:
            self.resultado.append(data)
    
    def handle_entityref(self, name):
        ENTIDADES = {
            'nbsp': ' ', 'amp': '&', 'lt': '<', 'gt': '>',
            'quot': '"', 'apos': "'", 'mdash': '—', 'ndash': '–',
        }
        if not self._ignorar:
            self.resultado.append(ENTIDADES.get(name, ''))
    
    def handle_charref(self, name):
        if not self._ignorar:
            try:
                if name.startswith('x'):
                    c = chr(int(name[1:], 16))
                else:
                    c = chr(int(name))
                self.resultado.append(c)
            except (ValueError, OverflowError):
                pass
    
    def get_text(self):
        texto = ''.join(self.resultado)
        # Limpar múltiplas linhas em branco (máximo 2 consecutivas)
        texto = re.sub(r'\n{3,}', '\n\n', texto)
        # Remover espaços no início de linhas (mas não todos os espaços)
        linhas = [linha.rstrip() for linha in texto.splitlines()]
        # Remover linhas que são apenas espaço
        linhas = [l for l in linhas if l.strip() != '' or l == '']
        return '\n'.join(linhas)


def converter(entrada: Path, saida: Path, chunk_kb=2048):
    """
    Converte HTML para TXT em chunks para economizar memória.
    Para arquivos grandes (>10 MB), processa em partes.
    """
    tamanho_mb = entrada.stat().st_size / (1024 * 1024)
    print(f"📂 Arquivo: {entrada.name} ({tamanho_mb:.1f} MB)")
    print(f"📝 Destino: {saida.name}")
    print(f"🔄 Convertendo...")

    parser = HTMLToText()

    # Ler e alimentar o parser em blocos
    chunk_size = chunk_kb * 1024
    lidos = 0
    total = entrada.stat().st_size

    with open(entrada, 'r', encoding='utf-8', errors='replace') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            parser.feed(chunk)
            lidos += len(chunk.encode('utf-8', errors='replace'))
            pct = min(lidos / total * 100, 100)
            print(f"\r   Progresso: {pct:.0f}%", end='', flush=True)

    print()  # nova linha após progresso

    texto = parser.get_text()
    
    # Salvar
    with open(saida, 'w', encoding='utf-8') as f:
        f.write(texto)
    
    tamanho_saida = saida.stat().st_size / (1024 * 1024)
    linhas = texto.count('\n')
    
    print(f"\n✅ Concluído!")
    print(f"   Linhas geradas : {linhas:,}")
    print(f"   Tamanho saída  : {tamanho_saida:.2f} MB")
    print(f"   Arquivo salvo  : {saida}")


if __name__ == "__main__":
    entrada = Path("mensagens.html")
    saida   = Path("mensagens.txt")
    
    if not entrada.exists():
        print(f"❌ Arquivo não encontrado: {entrada}")
        exit(1)
    
    converter(entrada, saida)
