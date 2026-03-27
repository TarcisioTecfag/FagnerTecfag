import re
import json

def parse_html(html_file, md_file):
    print("Lendo o arquivo HTML...")
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("Extraindo mapeamento de agentes e bots...")
    # Pre-parse mappings
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
    # Find all clients
    clients = re.findall(r'<table class="client" id="client-(\d+)">(.*?)</table>', content, re.DOTALL)
    
    print(f"Total de clientes encontrados: {len(clients)}. Escrevendo no markdown...")
    with open(md_file, 'w', encoding='utf-8') as out:
        out.write("# Relatório de Conversas\n\n")
        out.write("| ID Cliente | Nome | Data/Hora | Operador | Duração | Resumo da Msg |\n")
        out.write("|---|---|---|---|---|---|\n")
        
        count = 0
        for client_id, client_html in clients:
            name_match = re.search(r'<field-client-name>(.*?)</field-client-name>', client_html)
            client_name = name_match.group(1) if name_match else "Desconhecido"
            client_name = client_name.replace('|', '')
            
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
                
                msgs = re.findall(r'<message-text sender="(.*?)" time=".*?">(.*?)</message-text>', dialog_html, re.DOTALL)
                first_msg = "-"
                for sender, msg in msgs:
                    if "<bot" not in sender and "<agent" not in sender:
                        first_msg = msg.strip()[:60].replace('\n', ' ').replace('|', ' ') + "..."
                        break
                
                out.write(f"| {client_id} | {client_name} | {start_time} | {agent_name} | {duration} | {first_msg} |\n")
                count += 1
                
    print(f"Sucesso! {count} diálogos exportados para {md_file}.")

if __name__ == '__main__':
    parse_html('mensagens.html', 'relatorio_conversas.md')
