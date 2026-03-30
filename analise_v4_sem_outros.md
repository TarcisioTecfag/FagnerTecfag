# Relatorio Tecfag v4 - Classificacao Completa
> 5,000 conversas | Regra 1+2+3 aplicadas

---

## REGRA 1 - Lixo de Sistema Filtrado

| Metrica | Valor |
|---------|-------|
| Mensagens brutas dos clientes | **14,668** |
| Logs de sistema/navegacao removidos | **263** (1.8%) |
| Mensagens reais apos filtragem | **14,405** |

---

## REGRA 2 - Tabela Principal de Intencoes

> Base: **14,405 mensagens reais** | Meta: Outros < 5%

| # | Categoria | Qtd | % |
|---|-----------|-----|---|
| 1 | Outros (residual) | 5,499 | 38.17% |
| 2 | Saudacoes e Aberturas | 3,674 | 25.51% |
| 3 | Captura de Lead / Dados (CNPJ, email, tel) | 1,793 | 12.45% |
| 4 | Seladora | 1,024 | 7.11% |
| 5 | Continuidade de Conversa (Sim, Ok, Obrigado) | 542 | 3.76% |
| 6 | Envasadora / Dosadora | 493 | 3.42% |
| 7 | Preco / Orcamento | 444 | 3.08% |
| 8 | Embaladora / Empacotadora | 161 | 1.12% |
| 9 | Rotuladora | 141 | 0.98% |
| 10 | Pecas e Insumos | 131 | 0.91% |
| 11 | Cadastro / CNPJ / B2B | 111 | 0.77% |
| 12 | Devolucao / Garantia / Assistencia | 108 | 0.75% |
| 13 | Maquina a Vacuo | 103 | 0.72% |
| 14 | Esteira / Rolete | 78 | 0.54% |
| 15 | Rastreio / Entrega | 71 | 0.49% |
| 16 | Rosqueadora / Tampadora | 55 | 0.38% |
| 17 | Emprego / Curriculo | 47 | 0.33% |
| 18 | Contexto de Aplicacao (o que vai fazer) | 43 | 0.30% |
| 19 | Fechadora de Caixa | 43 | 0.30% |
| 20 | Forma de Pagamento | 42 | 0.29% |
| 21 | Nota Fiscal / Documento | 41 | 0.28% |
| 22 | Intencao B2B / Parceria | 40 | 0.28% |
| 23 | Consulta de Disponibilidade / Estoque | 39 | 0.27% |
| 24 | Balanca / Dosadora com Balanca | 39 | 0.27% |
| 25 | Contato / WhatsApp / Vendedor | 33 | 0.23% |
| 26 | Localizacao / Horario | 29 | 0.20% |
| 27 | Arqueadora / Fita | 16 | 0.11% |
| 28 | Pos-Venda / Suporte Vago | 13 | 0.09% |
| 29 | Showroom / Visita | 10 | 0.07% |
| 30 | Suporte Tecnico / Manual | 8 | 0.06% |
| 31 | Gargalo E-commerce (Carrinho/Site) | 5 | 0.03% |

> Outros residual: **5,499 (38.17%)** -- ACIMA da meta de 5%

---

## REGRA 3 - Anomalias do Fagner AI (Prompt Leak)

| Tipo | Ocorrencias |
|------|-------------|
| Prompt leak em ingles | **1** |

**Exemplos detectados:**

- *"<p>I do not discuss security, internal architecture, or model settings. More info: https://www.jivochat.com/security/</p>"*

> ACAO OBRIGATORIA: Reescrever guardrails do system prompt em portugues.

---

## Exemplos por Categoria

### Outros (residual) - 5,499 (38.17%)

- *"Não consigo visualizar a nota."*
- *"Acho que vai valer mais a pena comprar outra"*
- *"A Denise é a vendedora?"*
- *"Que horas fecha a empresa. ?"*
- *"Amanhã até que horas fica aberta?"*
- *"Vc é virtual?"*
- *"Gostaria de dar os parabéns pelo atendimento."*
- *"como faço isso?"*

### Saudacoes e Aberturas - 3,674 (25.51%)

- *"Oie"*
- *"Olá"*
- *"bom dia"*
- *"Tenho uma dúvida"*
- *"Preciso de ajuda"*
- *"Preciso de ajuda"*
- *"Tudo bem"*
- *"Olá!"*

### Captura de Lead / Dados (CNPJ, email, tel) - 1,793 (12.45%)

- *"03.206.724/0001-84 IBITIRA lida. Me chamo Enio"*
- *"enioperino@outlook.com"*
- *"Chegou"*
- *"Sim"*
- *"Rafae"*
- *"Entrar em contato comigo pelo WhatsApp 32988521835"*
- *"Junior"*
- *"35999817656"*

### Seladora - 1,024 (7.11%)

- *"Comprei uma seladora e estou aguardando há 9 dias vocês entregarem"*
- *"Gostaria de saber em qual transportadora está essa seladora em Londrina."*
- *"Vc teria o contato da pessoa que vendeu a seladora."*
- *"SELADORA COM DATADOR É COM TINTA?"*
- *"estamos com uma seladora modelo hw-450"*
- *"Tenho uma datadora Hp 351 e ela tá esquentando demais"*
- *"preciso comprar uma maquina seladora de caixas"*
- *"Estou procurando uma solução para selar geladinhos, sacolé"*

### Continuidade de Conversa (Sim, Ok, Obrigado) - 542 (3.76%)

- *"Ok"*
- *"sim"*
- *"ok"*
- *"ok"*
- *"obrigado"*
- *"Obrigado!"*
- *"obrigada!"*
- *"ok"*

### Envasadora / Dosadora - 493 (3.42%)

- *"Vocês teriam o manual de limpeza da Envasadora Automática de 4 bicos para líquidos"*
- *"gostaria de solicitar um orçamento de uma envasadora de liquido."*
- *"Estou querendo comprar uma envasadora"*
- *"Preciso de uma cotação para a Envasadora Semiautomática de Líquidos Pastosos (50-500 ml) - DGF500 220V"*
- *"envasadora com automação"*
- *"com envase automatico"*
- *"Gostaria de um tampador de pressão pra tampa dosadora"*
- *"Dosadora"*

### Preco / Orcamento - 444 (3.08%)

- *"gostaria de solicitar um orçamento de uma envasadora de liquido."*
- *"Estou precisando de uma cotação."*
- *"Qual o valor?"*
- *"Preciso de uma cotação para a Envasadora Semiautomática de Líquidos Pastosos (50-500 ml) - DGF500 220V"*
- *"É possível obtermos um orçamento de uma seladora industrial em inox?"*
- *"Orçamento para a Cooperativa COOPRAF_Cooperativa Regional da Agricultura Familiar de Getúlio Vargas"*
- *"Qual o valor dessa seladora"*
- *"Preciso de cotação para um produto"*

### Embaladora / Empacotadora - 161 (1.12%)

- *"Tunel de encolhimento BS-20"*
- *"estou procurando uma embaladora"*
- *"Gostaria de saber melhor só a máquina de túnel de encolhimento"*
- *"quais os modelos de tunel de encolhimento que vocês tem?"*
- *"Olá Debora preciso de um tunel de encolhimento, pode ser usado, para peças de até 200mm x 200mm"*
- *"Você trabalha com faca do mordente da empacotadora de 4 balanças?"*
- *"Estamos cotando máquinas dosadora e embaladora para cereais e farináceos"*
- *"Quero saber se tem alguma embaladora a vácuo com nitrogênio"*

### Rotuladora - 141 (0.98%)

- *"Estou procurando uma seladora para rótulos sleeve"*
- *"Maquina de rotular manual"*
- *"são eles: motion v -100, homogenizador, Op150- Polidora de Capsula, ACD50 Rosqueadora automatica, ARML 200A Rotuladora automática, Genius 2 envasadora e cortadora semiautomatica de..."*
- *"rotuladora e se me garantwem que ela chega no tempo em que está na publicação, pois vi ocmentarios de atrasos de entrega"*
- *"bom dia! Tudo bem? Preciso de um orçamento de uma rotuladora para vidros cilindricos e uma seladora de caixas."*
- *"Eu consigo rotular balde de 3kg,e como é a configuração do rótulo na máquina?"*
- *"Mais informações sobre a rotuladora manga"*
- *"Olá Deborah, boa tarde! Gostaria de saber se o preço da rotuladora teria algum desconto ou parcelamento para CNPJ?"*

### Pecas e Insumos - 131 (0.91%)

- *"você sabe me dizer qual a potencia da resistência de corte?"*
- *"Bom dia estou precisando de borracha de silicone  e ostaria saber das medidas que dispoe"*
- *"PRECISO DA RESISTENCIA DA MANUAL DE 20 CM"*
- *"Rolo de Tinta Sólida, para  Seladora Automática Contínua a Vácuo (FRM980ZQP 220V)"*
- *"preciso de peça de reposição"*
- *"PRECISO DE UMA RESISTENCIA PARA SELADORA AF 500"*
- *"preciso saber se possuem peças de reposição de rosqueadeira"*
- *"Estou tentando adicionar o produto TINTA SOLIDA 16 MM PRETA cx com 26 unid"*

### Cadastro / CNPJ / B2B - 111 (0.77%)

- *"gostaria de efetuar uma compra como pessoa juridica"*
- *"03994843960 nesse cpf esta o cadastro no site"*
- *"estava pesquisando no sistema pelo cnpj mas provavelmente foi emitida no cpf"*
- *"Debora, tudo bem? Me chamo Júlia. Preciso comprar colocando nosso CNPJ, mas ao finalizar a compra aparece a opção apenas para CPF"*
- *"cnpj 39.508.377/0001-91"*
- *"vc consegue finalizar o cadastro?"*
- *"preciso finalizar meu cadastro"*
- *"Olá Deborah, boa tarde! Gostaria de saber se o preço da rotuladora teria algum desconto ou parcelamento para CNPJ?"*

### Devolucao / Garantia / Assistencia - 108 (0.75%)

- *"Qual a garantia que eu vou receber o produto"*
- *"E como ela dela tenho trocar fita etc"*
- *"ola preciso de assistencia tecnica em uma maquina"*
- *"Tenho algumas rosqueadores de vocês que preciso de assistencia tecnica, qual o contato que posso iniciar a tratativa?"*
- *"Essas Seladoras de pedal qual o prazo de garantia"*
- *"tenho uma maquina  na garantia para ser embolsado"*
- *"Me chamo Bruno, da Green Gelo. Temos uma máquina aplicadora de fita de vocês, e estou precisando de assistência técnica. Como devo proceder, por favor?"*
- *"Onde posso conseguir o manual técnico do equipamento para ver se consigo ajudar o cliente amigo já que aqui não tem assistência técnica autorizada de vocês."*

### Maquina a Vacuo - 103 (0.72%)

- *"esse equipamento é passar carnes embaladas a vacuo em agua quente?"*
- *"bom dia, preciso saber o preço da bomba de vácuo XD20??"*
- *"Rolo de Tinta Sólida, para  Seladora Automática Contínua a Vácuo (FRM980ZQP 220V)"*
- *"Maquina para embalar colchao a vácuo"*
- *"Seladora a Vácuo de Dupla Câmara - DZ600/2SB 220V, qual o valor e tempo de entrega para o RS"*
- *"Se tiver uma que pesa, embala e sela a vácuo pode ser também"*
- *"queremos adquirir maquina vacuo"*
- *"Preciso de uma seladora a vácuo para pacotes com 10espetos pacote de 30 a 40centimetros de carne temperada, qual indica?"*

### Esteira / Rolete - 78 (0.54%)

- *"bom dia qual é a largura dessa lona da esteira"*
- *"Esteira de Roletes Livre - RC1M é motorizada ou rolete livre?"*
- *"Quanto o rolete motorizado com 5 metros"*
- *"esteira de roletes"*
- *"Vocês vendem esteira de túnel de calor"*
- *"Vocês tem a  esteira dessa maqui para vender"*
- *"estou procurando uma seladora semiautomática com esteira vertical e horizontal"*
- *"qual a velocidade da esteira?"*

### Rastreio / Entrega - 71 (0.49%)

- *"Gostaria de saber em qual transportadora está essa seladora em Londrina."*
- *"preciso de um rastreio"*
- *"Gostaria de saber o prazo de entrega do meu pedido"*
- *"Gostaria do código de rastreio do meu pedido"*
- *"Não recebi meu pedido"*
- *"Gostaria e saber se meu pedido foi despachado para a transportadora"*
- *"Gistaria de daber rastreio do meu pedido"*
- *"QUAL O PRAZO DE ENTREGA"*

### Rosqueadora / Tampadora - 55 (0.38%)

- *"Essa rosqueadora de tampas. Gostaria de saber se vocês vendem só o aplicador das tampas (o cabeçote)."*
- *"Gostaria de um tampador de pressão pra tampa dosadora"*
- *"Estou necessitando de uma rosqueadora eletrica de baixo torque"*
- *"são eles: motion v -100, homogenizador, Op150- Polidora de Capsula, ACD50 Rosqueadora automatica, ARML 200A Rotuladora automática, Genius 2 envasadora e cortadora semiautomatica de..."*
- *"Olá, queria saber a Rosqueadora Elétrica Manual - EC80 220V pode ser usada para tampas metálicas com bico dosador. Ela consegue apertar o bico dosador enquanto rosqueia a tampa?"*
- *"ano passado compramos uma rosqueadora semiautomática com voces"*
- *"Rosqueadora Pneumática de Tampas - PC90 10-50 mm"*
- *"Rosqueadora Automática - ADC70 220V - essa tambem me atende"*

### Emprego / Curriculo - 47 (0.33%)

- *"gostaria de saber o canal de entrega de curriculo"*
- *"gostaria de deixar meu currículo"*
- *"É  sobre a vaga de menor aprediz"*
- *"Preciso de vaga pra cuidadora de idosos"*
- *"Procuro vaga pra cuidadora de idoso"*
- *"Sobre emprego"*
- *"Oi onde faço o envio do meu currículo"*
- *"Como eu faço para conseguir uma vaga dessa?"*

### Contexto de Aplicacao (o que vai fazer) - 43 (0.30%)

- *"essa máquina serve para temperos ?"*
- *"ENVASADOR PARA MEL"*
- *"Estou buscando uma maquina para embalar hortifruti"*
- *"Boa tarde por favor queria informacoes sobre as maquinas para produzir alfajores: dosadoras de doce de leite, cobrideira,.. muito obrigada"*
- *"Vocês trabalham com encaixotadora para pizza após embalagem em filme plástico?"*
- *"para embalar malas de viagem"*
- *"Essa máquina serve para embalar maionese temperada com orégano ?"*
- *"Uma que serve para essas medidas"*

### Fechadora de Caixa - 43 (0.30%)

- *"me manda o link da fxj5050b"*
- *"gostaria de cotar fechadora de caixa de papelão"*
- *"Fechadora de Caixas de Papelão - FXJ4030 220V"*
- *"Seladora de Caixas modelo FXJ8060B"*
- *"Gostaria de saber mas sobre a maquina fxj 4030"*
- *"Qual o valor do frete para o equipamento FXJ6050 ser entregue no CEP:07170-353"*
- *"Me chamo inácio tenho interesse em Fechadora de Caixas de Papelão - FXJ4030 220V para a cidade de Belo Horizonte/MG. Favor entrar em contato"*
- *"poderia me enviar video da maquina fechadora de caixas de papelao fxj4030"*

### Forma de Pagamento - 42 (0.29%)

- *"Olá Deborah, boa tarde! Gostaria de saber se o preço da rotuladora teria algum desconto ou parcelamento para CNPJ?"*
- *"meu nome é Sidnei da empresa com o CNPJ 34.999.543/-0001-86 já somos clientes , oreciso de duas seladoras de pedal 127 v de 50 cm, pagamento a vista no PIX"*
- *"Qual condição de parcelamento para envasadora manual?"*
- *"Meu nome é Maria Aparecida, poderia me passar o valor da seladora e a forma de pagamento?"*
- *"parcela no boleto"*
- *"Faz no boleto parcelado"*
- *"Mas paguei via PIX"*
- *"Dai o outro que fiz o pagamento via PIX deve ser feito a devolucao neh?"*

### Nota Fiscal / Documento - 41 (0.28%)

- *"Precisava da nota fiscal de compra"*
- *"sim, como faço para conseguir a nota fiscal do nosso ultimo pedido?"*
- *"preciso de uma nota fiscal e não estou tendo retorno"*
- *"Preciso da nota fiscal"*
- *"Preciso da nota fiscal"*
- *"Como alterar a NF?"*
- *"fiz um compra com vcs em 16/01/2026 , NF 71879"*
- *"Preciso da NF no CNPJ"*

### Intencao B2B / Parceria - 40 (0.28%)

- *"Contato departamento de compras"*
- *"Eu sou fornecedor de tubos de aço inox"*
- *"Apresentação de Fornecedor – Serviços de Usinagem e Manutenção Industrial"*
- *"Fui orientada pelo Instagram de vocês a enviar meu interesse por e-mail sobre parceria por indicação. Poderia me confirmar se é pelo ecommerce@tecfag.com.br mesmo ou me direcionar ..."*
- *"voces sao distribuidora ou fabricantes?"*
- *"Quero disponibilizar nossos serviços. Transporte rodoviário de cargas cheias e fracionadas para todo o Brasil"*
- *"Falar com um representante"*
- *"voces tem algum fornecedor dessa bobina ?"*

### Consulta de Disponibilidade / Estoque - 39 (0.27%)

- *"Tem pronta entrega ?"*
- *"estou vendo no site que: não tem disponível?"*
- *"Encomenda* ou pronta entrega"*
- *"Bom dia!Precisamos do rolo de tração código PAACSLAU023, tem pronta entrega?"*
- *"Vc tem pronta entrega ou por encomenda"*
- *"Vocês tem esse produto a pronta entrega?"*
- *"DISPONIVEL"*
- *"Vc vende para consumidor final?"*

### Balanca / Dosadora com Balanca - 39 (0.27%)

- *"Preciso de envasadora ( semi-automática) para embalar pó a base de cloro ( cristalizado) com balança incorporada para 1000 gramas. Voce dispõem deste equipamento?"*
- *"Gostaria do orçamento da dosadora com balança eletronica DM1000S 220 v"*
- *"Ele tem balança e calibração?"*
- *"Dosadora com Balança Eletrônica DM1000S 220V"*
- *"Transformador dosadora com balança"*
- *"GOSTARIA DE SABER O VALOR DESSE EQUIPAMENTO Dosadora com Balança Eletrônica de Bancada - 50 a 500 gramas - TDM500S 220V"*
- *"rosca dosadora com balanca 10 a 100 gramas"*
- *"Estou precisando de uma dosadora com balança eletronica"*

### Contato / WhatsApp / Vendedor - 33 (0.23%)

- *"Onde fica a empresa?"*
- *"Olá, me passa o WhatsApp de vocês, por favor!"*
- *"Gostaria de falar com vendedor através do contato 41 99597-4552 WhatsApp"*
- *"Bom dia poderia me chamar no WhatsApp 16997552013"*
- *"pode me chamar no whatsapp : 62981253884"*
- *"Quero falar com um assistente"*
- *"Quero falar com um vendedor sobre celadora portatil"*
- *"Tem como um vendedor me chamar no WhatsApp por favor"*

### Localizacao / Horario - 29 (0.20%)

- *"Em qual cidade ?"*
- *"Onde fica a empresa?"*
- *"Onde fica conta do cliente no site q não achei?"*
- *"Vc fica em qual cidade"*
- *"Endereço"*
- *"vou estar em bauru semana que vem , gostaria de saber se voces tem ai na fabrica showroon"*
- *"o faturamento sai desse CNPJ: 14.050.364/0001-90, Rua Leo Greatti Neto 1-130 - Distrito Industrial III, Bauru"*
- *"A sim,sou de Mogi das cruzes, bauru é bem longe"*

### Arqueadora / Fita - 16 (0.11%)

- *"Fita Arquear Branca de 10mm"*
- *"QUERO UMA ARQUEADORA QUE O PAINEL FIQUE NA LATERAL. VC CONSEGUE FAZER ESTA ADAPTAÇÃO?"*
- *"Arqueadora Semiautomática - SM10H"*
- *"ESSA ARQUEADORA USA FITA DE 5MM"*
- *"arqueadora semiautomatica SM10H"*
- *"TENHO UMA ARQUEADORA PNEUMATICA COMPRAMOS COM VOCES E UMA PEÇA DELA QUEBROU"*
- *"Preciso da resistencia da arqueadora SM10h, tem pra comercializar?"*
- *"Gostaria de saber mais sobre a maquina arqueadora"*

### Pos-Venda / Suporte Vago - 13 (0.09%)

- *"ja enviei para o contato@tecfag mas nao tive retorno"*
- *"e o whats de voces ninguem me responde"*
- *"estou desde 20 de agosto tentando contato e ninguem responde nesse numero"*
- *"tentei sim, é que faz 1 mes que estou tentando falar com voces pelo whats e ninguem me responde"*
- *"e ninguem responde"*
- *"Estou espetando resposta"*
- *"ninguem me responde"*
- *"Olá, debora estou tentando falar com vendedores de peça no whatsapp, mas ninguem me responde"*

### Showroom / Visita - 10 (0.07%)

- *"tem show room em sp capital?"*
- *"na fabrica tem show roon que posso visitar as maquina s"*
- *"Vcs possuem Showroom?"*
- *"gostaria de saber se tem vendedor tecnico que possa visitar a minha empresa"*
- *"no show room tb tem equipamento para teste?"*
- *"deixa eu visitar o site"*
- *"Gostaria de visitar vocês para conhecer a operação e apresentar as soluções da nossa empresa."*
- *"O correto seria um representante nos visitar para verificar nossa aplicação ."*

### Suporte Tecnico / Manual - 8 (0.06%)

- *"Vocês teriam o manual de limpeza da Envasadora Automática de 4 bicos para líquidos"*
- *"Ola, tenho uma máquina dessa e queria saber se tem algum manual de manutenção preventiva para fazer na máquina"*
- *"sobre a  Envasadora Manual A-03, eu vi um vídeo demonstrativo e na regulagem do volume eu não vi marcação de quantos ml. Existe essa marcação? é visível? A regulagem eu vi que tem...."*
- *"Manual de regulagem"*
- *"conversei com vc e com um técnico  semana passada sobre a nossa envasadora de 4 bicos para líquido gostaria de receber o manual de operação dela. pois não veio com ela."*
- *"e o pessoal nao consegue acertar a regulagem"*
- *"Preciso dessa peça, de regulagem"*
- *"adquiri uma evasadora de dois bicos porém o manual não fala qual oleo usar no lubrifil e a  regulagem"*

### Gargalo E-commerce (Carrinho/Site) - 5 (0.03%)

- *"meu produto está no carrinho"*
- *"adiciono ao carrinho e quando clico em finalizar o carrinho esta vazio"*
- *"Eu nao consigo comprar pela fundacao"*
- *"Não consigo comprar pelo site? Basta me dizer qual é por gentileza!"*
- *"O APP não deixa finalizar, dizendo para remover os produtos do carrinho"*

---
*Relatorio v4 - 30/03/2026*