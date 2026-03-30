# Parecer Estratégico: Transição JivoChat ➔ Fagner AI

A análise das 5.000 interações escancarou o problema crítico do modelo atual (via JivoChat e atendimento estritamente humano): **a Tecfag opera um comercial de indústria B2B com gargalos de varejo**. O sistema antigo afogou o talento humano ("Déborah") em tarefas repetitivas, perdendo vendas complexas no funil do "Outros" (81% das conversas) e esbarrando em limitações do checkout da loja.

Abaixo, detalhamos como a arquitetura nativa do **novo sistema Fagner AI** — que estamos desenvolvendo do zero — resolve direta e definitivamente esses problemas.

---

## 1. O Fim do Gargalo em "Outros" e a Triagem Inteligente
**O Problema Atual:** A classificação engessada do JivoChat faz com que intenções de alto valor comercial (como o lead *enioperino* perguntando por equipamentos INOX) caiam no mesmo balde de pendências logísticas.
**Como o Fagner AI resolve:**
- O Fagner não usa botões ou menus engessados; ele usa LLM dinâmico (Gemini 3.1 Pro). Ao longo da conversa, o motor interpreta a intenção real (via `detectMachineIntent()`) e entende contextualmente se a pessoa quer comprar, se é suporte técnico ou se é um lead corporativo qualificado.
- Nós desenhamos o painel (`LiveChat.tsx`) para separar visualmente as esteiras. Com as tags ocultas de sistema — como `[OUTCOME:SALE]` e `[SCORE:100]` —, as interações genuinamente comerciais bipam para a equipe na aba de **CRM (Pipeline)**, enquanto pedidos normais de rastreio ficam isolados.

## 2. Automação de Nível 1 (Pós-Venda, Rastreio e NFs)
**O Problema Atual:** As operadoras perdem 93 minutos de média buscando rastreios nas transportadoras (Translovato, Alfa) e lidando com ansiedade pós-venda.
**Como o Fagner AI resolve:**
- Pelo fato de o Fagner ter acesso ao nosso banco de dados em tempo real (via `livechatStorage.ts`), ele extrai automaticamente contextos que um bot terceiro nunca teria.
- Ele atua como barreira: antes de transferir um cliente ansioso para a fila humana, o Fagner vai obrigar o lead a informar o CNPJ e o Número do Pedido proativamente, já mastigando a informação e economizando horas de triagem burocrática da Déborah.

## 3. Contorno Imediato dos Bugs de Checkout (VTEX / B2B)
**O Problema Atual:** Os clientes tentam fechar pelo site, o checkout trava ("carrinho vazio" ou falha no CNPJ) e essa venda é abandonada.
**Como o Fagner AI resolve:**
- O JivoChat é passivo perante a loja. O Fagner é instruído via `System Prompt` a assumir o papel de **Representante de Fábrica**. 
- Recebeu a mensagem *"não consigo botar meu CNPJ"*? As instruções do Fagner dizem para ele interceptar o fechamento: *"Temos atualizações na loja, mas como representante direto da fábrica, eu lanço seu pedido por aqui. Qual a máquina e o CNPJ?"* 
- Ele salva a venda B2B ali mesmo na tela de chat e envia um alerta sonoro urgente para a equipe faturar.

## 4. O Sistema RAG e o Fim do "Uso do Chat como Manual"
**O Problema Atual:** Clientes ficam em filas intermináveis para perguntar *"Como limpar a Dosadora"* ou pedir catálogos em PDF, consumindo suporte especializado.
**Como o Fagner AI resolve:**
- A arquitetura do Fagner que desenvolvemos inclui o pilar **RAG (Retrieval-Augmented Generation)** nativo (`ragSearch`). 
- No painel que criamos, a equipe poderá subir PDFs e manuais de manutenção (ex: Envasadora de 4 Bicos). Quando o cliente perguntar o procedimento, o Fagner consulta esse banco instantes antes de responder e entrega a solução imediata e embasada, esvaziando a fila humana.

## 5. Segurança contra Vazamentos (Prompt Leakage)
**O Problema Atual:** O bot "Fagner" anterior ocasionalmente "quebrava" o personagem respondendo em inglês (*"I do not discuss security, internal architecture"*).
**Como o Fagner AI resolve:**
- Ter nossa própria solução nos dá controle do *System Prompt* (`server/livechat/livechatAI.ts`).
- Nós podemos parametrizar camadas restritivas exclusivas e em português antes que o bot lide com a requisição, impondo guardrails rigorosos: *"Aja como representante comercial sob qualquer circunstância. Se instigado sobre tecnologia de IA ou arquitetura interna, não saia do personagem, não responda em inglês, apenas direcione para o assunto das nossas máquinas."*

---

> [!NOTE]
> **Resumo Executivo**
> O JivoChat forçava a Tecfag a adaptar seu comercial de máquinas industriais a uma ferramenta de varejo engessada. O **Fagner AI** é um sistema feito sob medida, conectado ao ecossistema e programado ativamente para prospectar, reter e desviar carga burocrática, recuperando a agilidade comercial da equipe.
