# 🤖 Análise de Conversas Tecfag — Fagner AI v2
> **5,000 conversas** | **13,818 mensagens de clientes**
> Método: regex com word boundary — sem falsos positivos de letra solta

---

## 📊 Resumo Geral

| Métrica | Valor |
|---------|-------|
| Total de Conversas | **5,000** |
| Mensagens dos Clientes | **13,818** |
| Mensagens dos Operadores | **12,520** |
| Duração Média (conversas ativas) | **93.9 min** |

## 👤 Distribuição por Operador

| Operador | Conversas | % |
|----------|-----------|---|
| Deborah | 4,458 | 89.2% |
| Agente 0 | 542 | 10.8% |

## 🎯 Intenções dos Clientes — Ranking Corrigido

> ⚠️ Uma mensagem pode ser contada em múltiplas categorias (multi-label)
> Os percentuais são % do total de mensagens de clientes

| # | Categoria | Ocorrências | % msgs |
|---|-----------|-------------|--------|
| 1 | Outros | 11,022 | 79.77% |
| 2 | Seladora | 1,032 | 7.47% |
| 3 | Envasadora | 490 | 3.55% |
| 4 | Preco Orcamento | 445 | 3.22% |
| 5 | Embaladora Empacotadora | 170 | 1.23% |
| 6 | Rotuladora | 149 | 1.08% |
| 7 | Maquina Vacuo | 120 | 0.87% |
| 8 | Cadastro Conta | 111 | 0.80% |
| 9 | Devolucao Garantia | 109 | 0.79% |
| 10 | Rastreamento Pedido | 91 | 0.66% |
| 11 | Esteira | 85 | 0.62% |
| 12 | Rosqueadora | 67 | 0.48% |
| 13 | Suporte Tecnico Pecas | 57 | 0.41% |
| 14 | Emprego Curriculo | 51 | 0.37% |
| 15 | Fechadora Caixa | 44 | 0.32% |
| 16 | Embalagem Material | 43 | 0.31% |
| 17 | Nota Fiscal | 41 | 0.30% |
| 18 | Localizacao Horario | 40 | 0.29% |
| 19 | Balanca | 40 | 0.29% |
| 20 | Forma Pagamento | 33 | 0.24% |
| 21 | Contato Vendedor | 26 | 0.19% |
| 22 | Arqueadora Fita | 16 | 0.12% |
| 23 | Produto Nao Catalogo | 12 | 0.09% |
| 24 | Showroom Visita | 10 | 0.07% |
| 25 | Compra No Site | 7 | 0.05% |

---

## 💬 Exemplos Reais por Categoria

### Outros — 11,022 ocorrências (79.77%)

- *"03.206.724/0001-84 IBITIRA lida. Me chamo Enio"*
- *"Não consigo visualizar a nota."*
- *"enioperino@outlook.com"*
- *"Acho que vai valer mais a pena comprar outra"*
- *"Chegou"*
- *"A Denise é a vendedora?"*
- *"Sim"*
- *"Tem pronta entrega ?"*
- *"Que horas fecha a empresa. ?"*
- *"Amanhã até que horas fica aberta?"*

### Seladora — 1,032 ocorrências (7.47%)

- *"Comprei uma seladora e estou aguardando há 9 dias vocês entregarem"*
- *"Gostaria de saber em qual transportadora está essa seladora em Londrina."*
- *"Vc teria o contato da pessoa que vendeu a seladora."*
- *"SELADORA COM DATADOR É COM TINTA?"*
- *"estamos com uma seladora modelo hw-450"*
- *"preciso comprar uma maquina seladora de caixas"*
- *"Estou procurando uma solução para selar geladinhos, sacolé"*
- *"É possível obtermos um orçamento de uma seladora industrial em inox?"*
- *"Preciso de assistência para datadora"*
- *"E sei que muitas empresas compram a máquina, mas não sabem integrar o datador ao sistema de estoque (ERP)"*

### Envasadora — 490 ocorrências (3.55%)

- *"Vocês teriam o manual de limpeza da Envasadora Automática de 4 bicos para líquidos"*
- *"gostaria de solicitar um orçamento de uma envasadora de liquido."*
- *"Estou querendo comprar uma envasadora"*
- *"Preciso de uma cotação para a Envasadora Semiautomática de Líquidos Pastosos (50-500 ml) - DGF500 220V"*
- *"envasadora com automação"*
- *"com envase automatico"*
- *"Gostaria de um tampador de pressão pra tampa dosadora"*
- *"Dosadora"*
- *"Tem opções de envasadora para pequena produção"*
- *"Preciso de suporte para uma envasadora de pó"*

### Preco Orcamento — 445 ocorrências (3.22%)

- *"gostaria de solicitar um orçamento de uma envasadora de liquido."*
- *"Estou precisando de uma cotação."*
- *"Qual o valor?"*
- *"Preciso de uma cotação para a Envasadora Semiautomática de Líquidos Pastosos (50-500 ml) - DGF500 220V"*
- *"É possível obtermos um orçamento de uma seladora industrial em inox?"*
- *"Orçamento para a Cooperativa COOPRAF_Cooperativa Regional da Agricultura Familiar de Getúlio Vargas"*
- *"Qual o valor dessa seladora"*
- *"Preciso de cotação para um produto"*
- *"Seladora a Vácuo de Dupla Câmara - DZ600/2SB 220V, qual o valor e tempo de entrega para o RS"*
- *"podemos fazer a cotação via WhatsApp"*

### Embaladora Empacotadora — 170 ocorrências (1.23%)

- *"Tunel de encolhimento BS-20"*
- *"estou procurando uma embaladora"*
- *"quero saber das suas empacotadoras!"*
- *"possuem embaladoras e seladoras para 25 kg?"*
- *"Bom dia, sabe me dizer a faixa de a temperatura que ela atingi? Serviria para selar embalagens multicamadas, tipo saches?"*
- *"Bom dia, sabe me dizer a faixa de a temperatura que ela atingi? Serviria para selar embalagens multicamadas, tipo saches?"*
- *"Gostaria de saber melhor só a máquina de túnel de encolhimento"*
- *"quais os modelos de tunel de encolhimento que vocês tem?"*
- *"Olá Debora preciso de um tunel de encolhimento, pode ser usado, para peças de até 200mm x 200mm"*
- *"Você trabalha com faca do mordente da empacotadora de 4 balanças?"*

### Rotuladora — 149 ocorrências (1.08%)

- *"Estou procurando uma seladora para rótulos sleeve"*
- *"Maquina de rotular manual"*
- *"são eles: motion v -100, homogenizador, Op150- Polidora de Capsula, ACD50 Rosqueadora automatica, ARML 200A Rotuladora automática, Genius 2 envasadora e cortadora semiautomatica de..."*
- *"rotuladora e se me garantwem que ela chega no tempo em que está na publicação, pois vi ocmentarios de atrasos de entrega"*
- *"bom dia! Tudo bem? Preciso de um orçamento de uma rotuladora para vidros cilindricos e uma seladora de caixas."*
- *"Eu consigo rotular balde de 3kg,e como é a configuração do rótulo na máquina?"*
- *"Mais informações sobre a rotuladora manga"*
- *"Olá Deborah, boa tarde! Gostaria de saber se o preço da rotuladora teria algum desconto ou parcelamento para CNPJ?"*
- *"qual o preço da rotuladora para cilindros e bisnagas?"*
- *"Rotuladora Semiautomática com Datador - MT50/P 220V gostaria de saber se serve para frascos de vidro de 30 ml"*

### Maquina Vacuo — 120 ocorrências (0.87%)

- *"É possível obtermos um orçamento de uma seladora industrial em inox?"*
- *"Um inox resistente aos processos e produtos de um frigorífico suíno"*
- *"https://www.tecfag.com.br/emulsificador-a-vacuo/p?srsltid=AfmBOoq53_dC_e54PgtPmWjddfmhyV0ow9udjxQlXIWwx7EtMtO0j-oa"*
- *"esse equipamento é passar carnes embaladas a vacuo em agua quente?"*
- *"bom dia, preciso saber o preço da bomba de vácuo XD20??"*
- *"Rolo de Tinta Sólida, para  Seladora Automática Contínua a Vácuo (FRM980ZQP 220V)"*
- *"Trabalho com tubos de aço inox,"*
- *"Maquina para embalar colchao a vácuo"*
- *"Seladora a Vácuo de Dupla Câmara - DZ600/2SB 220V, qual o valor e tempo de entrega para o RS"*
- *"Se tiver uma que pesa, embala e sela a vácuo pode ser também"*

### Cadastro Conta — 111 ocorrências (0.80%)

- *"gostaria de efetuar uma compra como pessoa juridica"*
- *"03994843960 nesse cpf esta o cadastro no site"*
- *"estava pesquisando no sistema pelo cnpj mas provavelmente foi emitida no cpf"*
- *"Debora, tudo bem? Me chamo Júlia. Preciso comprar colocando nosso CNPJ, mas ao finalizar a compra aparece a opção apenas para CPF"*
- *"cnpj 39.508.377/0001-91"*
- *"vc consegue finalizar o cadastro?"*
- *"preciso finalizar meu cadastro"*
- *"Olá Deborah, boa tarde! Gostaria de saber se o preço da rotuladora teria algum desconto ou parcelamento para CNPJ?"*
- *"Comprei uma maquina no cnpj 037850100000178, o novo prazo de recebimento de voces era para o dia 28 de fev"*
- *"Comprei uma maquina no cnpj 037850100000178, o novo prazo de recebimento de voces era para o dia 28 de fev"*

### Devolucao Garantia — 109 ocorrências (0.79%)

- *"Qual a garantia que eu vou receber o produto"*
- *"E como ela dela tenho trocar fita etc"*
- *"ola preciso de assistencia tecnica em uma maquina"*
- *"Tenho algumas rosqueadores de vocês que preciso de assistencia tecnica, qual o contato que posso iniciar a tratativa?"*
- *"Essas Seladoras de pedal qual o prazo de garantia"*
- *"tenho uma maquina  na garantia para ser embolsado"*
- *"Me chamo Bruno, da Green Gelo. Temos uma máquina aplicadora de fita de vocês, e estou precisando de assistência técnica. Como devo proceder, por favor?"*
- *"Onde posso conseguir o manual técnico do equipamento para ver se consigo ajudar o cliente amigo já que aqui não tem assistência técnica autorizada de vocês."*
- *"Quanto assistência técnica"*
- *"Reposição de peças, e garantia"*

### Rastreamento Pedido — 91 ocorrências (0.66%)

- *"Gostaria de saber em qual transportadora está essa seladora em Londrina."*
- *"preciso de um rastreio"*
- *"Gostaria de saber o prazo de entrega do meu pedido"*
- *"sim, vou passar para o financeiro realizar o pagamento e ja te envio o comprovante"*
- *"Gostaria do código de rastreio do meu pedido"*
- *"Não recebi meu pedido"*
- *"Gostaria e saber se meu pedido foi despachado para a transportadora"*
- *"Gistaria de daber rastreio do meu pedido"*
- *"QUAL O PRAZO DE ENTREGA"*
- *"qual prazo de entrega pra 89248000"*

### Esteira — 85 ocorrências (0.62%)

- *"bom dia qual é a largura dessa lona da esteira"*
- *"Esteira de Roletes Livre - RC1M é motorizada ou rolete livre?"*
- *"Quanto o rolete motorizado com 5 metros"*
- *"esteira de roletes"*
- *"Vocês vendem esteira de túnel de calor"*
- *"Vocês tem a  esteira dessa maqui para vender"*
- *"estou procurando uma seladora semiautomática com esteira vertical e horizontal"*
- *"qual a velocidade da esteira?"*
- *"Estou adquirindo uma flowpack com a empresa BBA e preciso da esteira motorizada e roletes livres"*
- *"Qual a altura máxima da embalagem, e qtºs kg a esteira suporta , meu produto carne moída ."*

### Rosqueadora — 67 ocorrências (0.48%)

- *"Essa rosqueadora de tampas. Gostaria de saber se vocês vendem só o aplicador das tampas (o cabeçote)."*
- *"Gostaria de um tampador de pressão pra tampa dosadora"*
- *"Estou necessitando de uma rosqueadora eletrica de baixo torque"*
- *"são eles: motion v -100, homogenizador, Op150- Polidora de Capsula, ACD50 Rosqueadora automatica, ARML 200A Rotuladora automática, Genius 2 envasadora e cortadora semiautomatica de..."*
- *"preciso fazer uma cotação para um alimentador de rosca com capacidade de 2000 kg/h e outro pra 400 kg/h"*
- *"Olá, queria saber a Rosqueadora Elétrica Manual - EC80 220V pode ser usada para tampas metálicas com bico dosador. Ela consegue apertar o bico dosador enquanto rosqueia a tampa?"*
- *"ano passado compramos uma rosqueadora semiautomática com voces"*
- *"https://www.tecfag.com.br/rosqueadora-semiautomatica-de-tampas-dhz450aii/p"*
- *"Rosqueadora Pneumática de Tampas - PC90 10-50 mm"*
- *"Rosqueadora Automática - ADC70 220V - essa tambem me atende"*

### Suporte Tecnico Pecas — 57 ocorrências (0.41%)

- *"Vocês teriam o manual de limpeza da Envasadora Automática de 4 bicos para líquidos"*
- *"preciso de peça de reposição"*
- *"preciso saber se possuem peças de reposição de rosqueadeira"*
- *"Vocês vende peças também?"*
- *"Ola, tenho uma máquina dessa e queria saber se tem algum manual de manutenção preventiva para fazer na máquina"*
- *"vende peças ?"*
- *"preciso de peças de reposição"*
- *"preciso da resistencia da seladora manual com temporizador 40cm"*
- *"sobre a  Envasadora Manual A-03, eu vi um vídeo demonstrativo e na regulagem do volume eu não vi marcação de quantos ml. Existe essa marcação? é visível? A regulagem eu vi que tem...."*
- *"Ele tem balança e calibração?"*

### Emprego Curriculo — 51 ocorrências (0.37%)

- *"gostaria de saber o canal de entrega de curriculo"*
- *"gostaria de deixar meu currículo"*
- *"É  sobre a vaga de menor aprediz"*
- *"Preciso de vaga pra cuidadora de idosos"*
- *"Procuro vaga pra cuidadora de idoso"*
- *"Currículo"*
- *"Sobre emprego"*
- *"Oi onde faço o envio do meu currículo"*
- *"Como eu faço para conseguir uma vaga dessa?"*
- *"Envio de currículo onde consigo."*

### Fechadora Caixa — 44 ocorrências (0.32%)

- *"me manda o link da fxj5050b"*
- *"gostaria de cotar fechadora de caixa de papelão"*
- *"Fechadora de Caixas de Papelão - FXJ4030 220V"*
- *"Seladora de Caixas modelo FXJ8060B"*
- *"Gostaria de saber mas sobre a maquina fxj 4030"*
- *"Qual o valor do frete para o equipamento FXJ6050 ser entregue no CEP:07170-353"*
- *"Me chamo inácio tenho interesse em Fechadora de Caixas de Papelão - FXJ4030 220V para a cidade de Belo Horizonte/MG. Favor entrar em contato"*
- *"poderia me enviar video da maquina fechadora de caixas de papelao fxj4030"*
- *"FXJ4030 220v"*
- *"Gostaria de saber mais sobre a máquina FXJ4030"*

### Embalagem Material — 43 ocorrências (0.31%)

- *"BOBINA BOPP TRANSPARENTE LISO 20 CM DE"*
- *"Uma bobina de ribbon daria para quantas impressões nesta  HP241C?"*
- *"Bom dia. Esse tubel pode ser utilizado para embalagem de linguiça, salame, etc...?"*
- *"Estou buscando uma solução para fechamento de produção de saco de papel para pães,  papel acoplado e guardanapo TV."*
- *"Seladora em L Pneumática - FQL450T 220V, cabe bobina de ate que tamanho?"*
- *"Vocês trabalham com encaixotadora para pizza após embalagem em filme plástico?"*
- *"quero saber qual o valor da Empacotadora Automática Stand-Up Pouch para Pós – Diamond 320 220V"*
- *"oi eu tava querendo ver a maquina de sacola"*
- *"Eu queria uma Celadora para usar bobina tubular"*
- *"Aplicador Manual de Filme Stretch - E610 1 un."*

### Nota Fiscal — 41 ocorrências (0.30%)

- *"Precisava da nota fiscal de compra"*
- *"sim, como faço para conseguir a nota fiscal do nosso ultimo pedido?"*
- *"preciso de uma nota fiscal e não estou tendo retorno"*
- *"Preciso da nota fiscal"*
- *"Preciso da nota fiscal"*
- *"Como alterar a NF?"*
- *"fiz um compra com vcs em 16/01/2026 , NF 71879"*
- *"Preciso da NF no CNPJ"*
- *"Nota fiscal 71868"*
- *"preciso que seja emitido a nota fiscal no CNPJ"*

### Localizacao Horario — 40 ocorrências (0.29%)

- *"Em qual cidade ?"*
- *"Onde fica a empresa?"*
- *"ok, já entendi o funcionamento do item, obrigado. att"*
- *"Onde fica conta do cliente no site q não achei?"*
- *"Vc fica em qual cidade"*
- *"SELADORA DE MESA MANUAL – PAPEL GRAU CIRÚRGICO. Seladora Embalagem. Material: Tubo Aço. Voltagem: 110/220 V. Funcionamento: À Pedal. Acabamento Superficial: Pintura Eletrostática C..."*
- *"Endereço"*
- *"tem video da maquima em funcionamento"*
- *"vou estar em bauru semana que vem , gostaria de saber se voces tem ai na fabrica showroon"*
- *"o faturamento sai desse CNPJ: 14.050.364/0001-90, Rua Leo Greatti Neto 1-130 - Distrito Industrial III, Bauru"*

### Balanca — 40 ocorrências (0.29%)

- *"sou Adriano da Lacre balanças , petrolina pe"*
- *"Preciso de envasadora ( semi-automática) para embalar pó a base de cloro ( cristalizado) com balança incorporada para 1000 gramas. Voce dispõem deste equipamento?"*
- *"Você trabalha com faca do mordente da empacotadora de 4 balanças?"*
- *"Gostaria do orçamento da dosadora com balança eletronica DM1000S 220 v"*
- *"Ele tem balança e calibração?"*
- *"Dosadora com Balança Eletrônica DM1000S 220V"*
- *"Transformador dosadora com balança"*
- *"GOSTARIA DE SABER O VALOR DESSE EQUIPAMENTO Dosadora com Balança Eletrônica de Bancada - 50 a 500 gramas - TDM500S 220V"*
- *"Vcs possuem peças de reposição dessas balanças dosadoras?"*
- *"Estou precisando de uma dosadora com balança eletronica"*

### Forma Pagamento — 33 ocorrências (0.24%)

- *"Olá Deborah, boa tarde! Gostaria de saber se o preço da rotuladora teria algum desconto ou parcelamento para CNPJ?"*
- *"meu nome é Sidnei da empresa com o CNPJ 34.999.543/-0001-86 já somos clientes , oreciso de duas seladoras de pedal 127 v de 50 cm, pagamento a vista no PIX"*
- *"Qual condição de parcelamento para envasadora manual?"*
- *"Meu nome é Maria Aparecida, poderia me passar o valor da seladora e a forma de pagamento?"*
- *"Tenho interesse mas não tenho cartão de crédito"*
- *"Mas paguei via PIX"*
- *"Dai o outro que fiz o pagamento via PIX deve ser feito a devolucao neh?"*
- *"PIX"*
- *"vocês informam no site que todas as máquinas têm opção de parcelamento de até 24x sem juros"*
- *"no entanto, tenho interesse em uma máquina e não aparece essa opção de parcelamento"*

### Contato Vendedor — 26 ocorrências (0.19%)

- *"Olá, me passa o WhatsApp de vocês, por favor!"*
- *"Gostaria de falar com vendedor através do contato 41 99597-4552 WhatsApp"*
- *"Quero falar com um assistente"*
- *"Quero falar com um vendedor sobre celadora portatil"*
- *"bom dia  quero  falar  com um vendedor"*
- *"Tem um número de WhatsApp"*
- *"preciso falar com um vendedor, queremos um datadora e seladora em uma mesma máquina para selar polpa de frutas"*
- *"Preciso falar com um vendedor"*
- *"Falar com atendente"*
- *"falar com vendedor"*

### Arqueadora Fita — 16 ocorrências (0.12%)

- *"Fita Arquear Branca de 10mm"*
- *"QUERO UMA ARQUEADORA QUE O PAINEL FIQUE NA LATERAL. VC CONSEGUE FAZER ESTA ADAPTAÇÃO?"*
- *"Arqueadora Semiautomática - SM10H"*
- *"ESSA ARQUEADORA USA FITA DE 5MM"*
- *"arqueadora semiautomatica SM10H"*
- *"TENHO UMA ARQUEADORA PNEUMATICA COMPRAMOS COM VOCES E UMA PEÇA DELA QUEBROU"*
- *"Preciso da resistencia da arqueadora SM10h, tem pra comercializar?"*
- *"Gostaria de saber mais sobre a maquina arqueadora"*
- *"Preciso de orçamento para 02 peças da  Arqueadora Semiautomática - SM10H 220V"*
- *"Bom dia!, vcs trabalham com fita de arquear 8mm?"*

### Produto Nao Catalogo — 12 ocorrências (0.09%)

- *"vocês tem recravadeira de frasco ampola para farmácia de manipulação?"*
- *"Vocês tem torno mecânico usao"*
- *"Olá, queria saber a Rosqueadora Elétrica Manual - EC80 220V pode ser usada para tampas metálicas com bico dosador. Ela consegue apertar o bico dosador enquanto rosqueia a tampa?"*
- *"Rosqueadora Elétrica de Tampas - EC90 10-30 mm"*
- *"Rosqueadora Elétrica Manual - EC80 220V"*
- *"Rosqueadora Elétrica Manual - EC80 220V"*
- *"Boa tarde! Sou sócio em uma empresa nova de produção de água desmineralizada, Aquatech BR Ltda. Somos uma empresa ainda embrionária, mas estamos estudando melhorar nossa linha de p..."*
- *"a primeira peça da Rosqueadora Elétrica de Tampas - EC90"*
- *"Rosqueadora Elétrica de Tampas - EC90 10-30 mm"*
- *"Sobre a Rosqueadora Elétrica de Tampas - EC90 10-30 mm"*

### Showroom Visita — 10 ocorrências (0.07%)

- *"tem show room em sp capital?"*
- *"na fabrica tem show roon que posso visitar as maquina s"*
- *"Vcs possuem Showroom?"*
- *"gostaria de saber se tem vendedor tecnico que possa visitar a minha empresa"*
- *"no show room tb tem equipamento para teste?"*
- *"deixa eu visitar o site"*
- *"Gostaria de visitar vocês para conhecer a operação e apresentar as soluções da nossa empresa."*
- *"O correto seria um representante nos visitar para verificar nossa aplicação ."*
- *"Hola quero visitar su lugar para ver las máquinas porfavor"*
- *"vcs tem show room em Bauru?"*

### Compra No Site — 7 ocorrências (0.05%)

- *"meu produto está no carrinho"*
- *"Não consigo adicionar o frete para ver o valor final que ficaria minha compra"*
- *"adiciono ao carrinho e quando clico em finalizar o carrinho esta vazio"*
- *"As correias dentadas da seladora continua com datador, como faço pra comprar?"*
- *"Eu nao consigo comprar pela fundacao"*
- *"Não consigo comprar pelo site? Basta me dizer qual é por gentileza!"*
- *"O APP não deixa finalizar, dizendo para remover os produtos do carrinho"*

---

## 📝 Primeiras Mensagens dos Clientes (abertura de conversa)

> Como o cliente inicia o contato — essencial para o Fagner saber o contexto inicial

- *"Em qual cidade ?"*
- *"Gostaria de dar os parabéns pelo atendimento."*
- *"SELADORA COM DATADOR É COM TINTA?"*
- *"Fita Arquear Branca de 10mm"*
- *"Olá"*
- *"Tenho uma dúvida"*
- *"Preciso de ajuda"*
- *"Preciso de ajuda"*
- *"Tudo bem"*
- *"Olá!"*
- *"bom dia"*
- *"Olá!"*
- *"Olá, me passa o WhatsApp de vocês, por favor!"*
- *"Olá!"*
- *"Boa tarde"*
- *"olá"*
- *"boa tarde"*
- *"Olá"*
- *"Boa noite"*
- *"Boa tarde"*
- *"Olá!"*
- *"como posso compras peças acessorios de maquina emblistadora"*
- *"Olá!"*
- *"Motopolia para caixa de supermercado, vcs vendem?"*
- *"Tenho uma dúvida"*
- *"BOBINA BOPP TRANSPARENTE LISO 20 CM DE"*
- *"Preciso de ajuda"*
- *"Bom dia"*
- *"Tenho uma dúvida"*
- *"Tenho uma dúvida"*
- *"Tenho uma dúvida"*
- *"bom dia qual é a largura dessa lona da esteira"*
- *"Bom dia !!!"*
- *"Preciso de ajuda"*
- *"Bom dia"*
- *"Preciso de ajuda"*
- *"Bom dia,"*
- *"Olá bom dia"*
- *"Bom dia !"*
- *"Bom dia!"*
- *"olá"*
- *"Preciso de ajuda"*
- *"Preciso de ajuda"*
- *"Tenho uma dúvida"*
- *"Celadora de naylon vc tem"*
- *"olá boa tarde"*
- *"Preciso de ajuda"*
- *"Gostaria de um tampador de pressão pra tampa dosadora"*
- *"Olá!"*
- *"Boa tarde"*
- *"Tenho uma dúvida"*
- *"Boa tarde"*
- *"Bom dia. Esse tubel pode ser utilizado para embalagem de linguiça, salame, etc...?"*
- *"Preciso de ajuda"*
- *"62981976680"*
- *"olá bom dia"*
- *"Preciso de ajuda"*
- *"Tenho uma dúvida"*
- *"Tenho uma dúvida"*
- *"Preciso de ajuda"*

---

*Análise gerada por analise_v2.py — método: regex com word boundary*