import re
import json

def parse_html_full(html_file, md_file):
    print("Lendo o arquivo HTML...")
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    print("Extraindo mapeamento de agentes e bots...")
    agents_map = {}
    agents_match = re.search(r'const agentsMap = (\{.*?\})', content)
    if agents_match:
        try:
            raw = agents_match.group(1).replace(',}', '}')
            agents_map = json.loads(raw)
        except:
            agents_map = {'5': "Deborah"}

    bots_map = {}
    bots_match = re.search(r'const botsMap = (\{.*?\})', content)
    if bots_match:
        try:
            raw = bots_match.group(1).replace(',}', '}')
            bots_map = json.loads(raw)
        except:
            bots_map = {'2': "Fagner"}

    print("Procurando clientes e diálogos...")
    clients = re.findall(r'<table class="client" id="client-(\d+)">(.*?)</table>', content, re.DOTALL)

    print(f"Total de clientes encontrados: {len(clients)}. Escrevendo no markdown formatado...")
    with open(md_file, 'w', encoding='utf-8') as out:
        out.write("# Relatório Completo de Diálogos\n\n")

        count = 0
        for client_id, client_html in clients:
            name_match = re.search(r'<field-client-name>(.*?)</field-client-name>', client_html)
            client_name = name_match.group(1) if name_match else "Desconhecido"

            dialogs = re.findall(r'<tr class="dialogRow">(.*?)</tr>', client_html, re.DOTALL)
            for dialog_html in dialogs:
                start_match = re.search(r'<field-start-dialog>(.*?)</field-start-dialog>', dialog_html)
                start_time = start_match.group(1) if start_match else "-"

                duration_match = re.search(r'<field-duration>(.*?)</field-duration>', dialog_html)
                duration = duration_match.group(1) if duration_match else "-"

                agent_match = re.search(r'<agent-name-(\d+)>', dialog_html)
                agent_name = "N/A"
                if agent_match:
                    agent_name = agents_map.get(agent_match.group(1), f"Agente {agent_match.group(1)}")
                else:
                    bot_match = re.search(r'<bot-name-(\d+)>', dialog_html)
                    if bot_match:
                        agent_name = bots_map.get(bot_match.group(1), f"Bot {bot_match.group(1)}")

                out.write(f"### Cliente: {client_name} (ID: {client_id})\n")
                out.write(f"**Data/Hora:** {start_time} | **Operador:** {agent_name} | **Duração:** {duration}\n\n")
                out.write("**Mensagens:**\n")

                msgs = re.findall(r'<(message-text|media-[a-z\_]+)\s+sender="(.*?)" time="(.*?)">(.*?)</\1>', dialog_html, re.DOTALL)
                
                # Se msgs estiver vazio por causa do padrão (tem tags com auto fechamento ou formato diferente) 
                # vamos tentar um regex mais permissivo mas que garanta extrair o conteúdo
                if not msgs:
                     msgs = re.findall(r'<message-text sender="(.*?)" time="(.*?)">(.*?)</message-text>', dialog_html, re.DOTALL)
                     media_msgs = re.findall(r'<media-[a-z\_]+ sender="(.*?)" time="(.*?)">', dialog_html, re.DOTALL)
                     # Precisamos ordenar, mas sem o regex combinando é difícil. 
                     # O regex combinado inicial é melhor. Apenas adicionei underscores.

                for tag_type, raw_sender, time, text in msgs:
                    # Descriptografando nome de bote e agente 
                    sender = raw_sender
                    agent_m = re.search(r'<agent-name-(\d+)/>', raw_sender)
                    if agent_m: sender = agents_map.get(agent_m.group(1), f"Agente {agent_m.group(1)}")
                    else:
                        bot_m = re.search(r'<bot-name-(\d+)/>', raw_sender)
                        if bot_m: sender = bots_map.get(bot_m.group(1), f"Bot {bot_m.group(1)}")
                    
                    if "message-text" in tag_type:
                        msg_clean = text.strip()
                        out.write(f"- **[{time}] {sender}:** {msg_clean}\n")
                    else:
                        out.write(f"- **[{time}] {sender}:** [ARQUIVO/MÍDIA ENVIADO]\n")

                out.write("\n---\n\n")
                count += 1

    print(f"Relatório detalhado gerado com sucesso! {count} diálogos completos formatados em {md_file}")

if __name__ == '__main__':
    parse_html_full('mensagens.html', 'relatorio_conversas_completo.md')
