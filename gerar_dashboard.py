import json
import os

OUTPUT_PATH = "dashboard_estrategico.html"

def gerar_dashboard():
    data_v4 = {
        "total_mensagens": 14405,
        "macro_grupos": [
            ["Triagem & Ruído", 79.89, "#a855f7", "#c084fc", "Saudações rasas, coleta de contatos (Lead) e mensagens em 'Outros' sem categoria exata. Sugerem total desvios de operação Nível 1."], 
            ["Interesse Core", 15.53, "#f59e0b", "#fbbf24", "Busca técnica e de preço direto por Máquinas Core: Seladoras, Envasadoras, Empacotadoras, Esteiras, etc."],     
            ["Comercial/Venda", 4.64, "#3b82f6", "#60a5fa", "Processo de compra: Orçamentos genéricos, atritos para faturamento em CNPJ, dúvidas sobre pagamento e erros do carrinho VTEX."],        
            ["Suporte Operacional", 3.15, "#ef4444", "#f87171", "Carga do pós-venda logístico: Demanda massiva por peças de desgaste (teflon, tintas), rastreamento e assistência."],       
            ["Parcerias/Outros", 0.68, "#10b981", "#34d399", "Procura corporativa externa tangencial: Curriculuns/Vagas, parceiros B2B logísticos e visitas agendadas ao Showroom."]        
        ],
        "triagem": [
            ["Outros (residual)", 38.17],
            ["Saudações", 25.51],
            ["Captura de Lead", 12.45],
            ["Continuidade", 3.76]
        ],
        "produtos": [
            ["Seladora", 7.11],
            ["Envasadora", 3.42],
            ["Embaladora", 1.12],
            ["Rotuladora", 0.98],
            ["Máquina a Vácuo", 0.72],
            ["Esteira/Rolete", 0.54],
            ["Rosqueadora", 0.38],
            ["Fechadora de Caixa", 0.30],
            ["Balança/Dosadora", 0.27],
            ["Arqueadora/Fita", 0.11]
        ],
        "comercial_suporte": [
            ["Preço/Orçamento", 3.08, "comercial"],
            ["Peças e Insumos", 0.91, "suporte"],
            ["Cadastro B2B/CNPJ", 0.77, "comercial"],
            ["Garantia/Devolução", 0.75, "suporte"],
            ["Rastreio/Entrega", 0.49, "suporte"],
            ["Consultas Estoque", 0.27, "suporte"],
            ["Forma de Pagamento", 0.29, "comercial"],
            ["Contato Vendedor", 0.23, "comercial"],
            ["Localização/Horário", 0.20, "suporte"],
            ["Gargalo E-commerce", 0.03, "comercial"]
        ]
    }

    json_data = json.dumps(data_v4)

    html_content = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inteligência Estratégica V4 - Tecfag</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {{
            --bg-dark: #020617; /* Slate 950 */
            --bg-glow: #0a0f24;
            --panel-bg: rgba(15, 23, 42, 0.6); /* Slate 900 w/ opacity */
            --panel-border: rgba(255, 255, 255, 0.05);
            --panel-highlight: rgba(255, 255, 255, 0.1);
            --text-main: #f8fafc; /* Slate 50 */
            --text-muted: #94a3b8; /* Slate 400 */
            
            --brand-main: #f59e0b;
            --brand-light: #fcd34d;
            
            --chart-purple: #a855f7;
            --chart-blue: #3b82f6;
            --chart-red: #ef4444;
            --chart-green: #10b981;
        }}

        * {{ box-sizing: border-box; margin: 0; padding: 0; }}

        body {{
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-main);
            min-height: 100vh;
            padding: 3rem;
            position: relative;
            overflow-x: hidden;
        }}

        .orb {{
            position: fixed; border-radius: 50%; filter: blur(100px); z-index: -1;
            animation: float 20s infinite ease-in-out alternate; opacity: 0.15;
        }}
        .orb-1 {{ top: -10%; left: -10%; width: 800px; height: 800px; background: radial-gradient(circle, var(--brand-main), transparent 70%); animation-delay: 0s; }}
        .orb-2 {{ bottom: -20%; right: -10%; width: 1000px; height: 1000px; background: radial-gradient(circle, var(--chart-purple), transparent 70%); animation-delay: -5s; }}
        .orb-3 {{ top: 40%; left: 50%; width: 600px; height: 600px; background: radial-gradient(circle, var(--chart-blue), transparent 60%); animation-delay: -10s; transform: translate(-50%, -50%); }}

        @keyframes float {{
            0% {{ transform: translate(0, 0) scale(1); }}
            100% {{ transform: translate(50px, 50px) scale(1.1); }}
        }}

        header {{ margin-bottom: 3.5rem; text-align: center; position: relative; z-index: 10; }}

        h1 {{
            font-family: 'Outfit', sans-serif; font-size: 3.5rem; font-weight: 800;
            background: linear-gradient(135deg, #ffffff 20%, var(--text-muted) 80%);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            margin-bottom: 1rem; letter-spacing: -1px; text-shadow: 0 0 40px rgba(255,255,255,0.1);
        }}
        
        header p {{ color: var(--text-muted); font-size: 1.25rem; max-width: 800px; margin: 0 auto; line-height: 1.7; }}

        .dashboard-grid {{
            display: grid; grid-template-columns: repeat(12, 1fr); gap: 2rem;
            max-width: 1500px; margin: 0 auto; position: relative; z-index: 10;
        }}

        @keyframes fadeUp {{ from {{ opacity: 0; transform: translateY(30px); }} to {{ opacity: 1; transform: translateY(0); }} }}

        .stagger-1 {{ animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards; opacity: 0; }}
        .stagger-2 {{ animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards; opacity: 0; }}
        .stagger-3 {{ animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards; opacity: 0; }}
        .stagger-4 {{ animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s forwards; opacity: 0; }}

        .panel {{
            background: linear-gradient(165deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
            border: 1px solid var(--panel-border); border-top: 1px solid rgba(255, 255, 255, 0.12); border-left: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px; padding: 2rem; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex; flex-direction: column; position: relative; overflow: hidden;
        }}

        .panel::before {{
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 100%;
            background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, -20%), rgba(255,255,255,0.04), transparent 40%);
            opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 1;
        }}
        .panel:hover {{
            transform: translateY(-4px);
            box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.05);
            border-color: var(--panel-highlight);
        }}
        .panel:hover::before {{ opacity: 1; }}

        .panel-header {{
            font-family: 'Outfit', sans-serif; font-size: 1.4rem; font-weight: 600;
            margin-bottom: 1.75rem; display: flex; align-items: center; gap: 0.75rem; color: #fff; letter-spacing: -0.5px; z-index: 2; position: relative;
        }}

        .metric-cards {{ grid-column: span 12; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2rem; }}

        .metric {{ text-align: left; padding: 2rem; }}
        .metric .value {{
            font-size: 3.5rem; font-weight: 800; font-family: 'Outfit', sans-serif;
            background: linear-gradient(135deg, #fff 30%, #a1a1aa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            line-height: 1; margin-bottom: 0.75rem; position: relative; z-index: 2;
        }}
        .metric .abs-number {{
            display: inline-block; margin-top: 0.5rem; background: rgba(0,0,0,0.4); padding: 0.4rem 0.75rem; 
            border-radius: 6px; font-size: 0.9rem; color: var(--text-muted); font-weight: 500;
            border: 1px solid rgba(255,255,255,0.05); width: fit-content;
        }}
        .metric .label {{
            font-size: 1.05rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; font-weight: 600; z-index: 2; position: relative;
        }}
        
        .chart-col-4 {{ grid-column: span 4; }}
        .chart-col-8 {{ grid-column: span 8; }}
        .chart-col-5 {{ grid-column: span 5; }}
        .chart-col-6 {{ grid-column: span 6; }}
        .chart-col-7 {{ grid-column: span 7; }}
        .chart-col-12 {{ grid-column: span 12; }}

        .chart-container {{ position: relative; flex-grow: 1; min-height: 380px; width: 100%; z-index: 2; filter: drop-shadow(0px 10px 15px rgba(0,0,0,0.3)); }}

        /* Detailed Explaination Grid */
        .explanation-grid {{
            grid-column: span 12;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 1.5rem;
        }}

        .exp-card {{
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 16px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            position: relative;
            overflow: hidden;
        }}
        
        .exp-card::before {{
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
            background: var(--exp-color);
        }}

        .exp-card h4 {{
            color: #fff; font-size: 1.05rem; font-weight: 600;
            display: flex; align-items: center; justify-content: space-between;
        }}
        
        .exp-card .badge {{
            font-size: 0.75rem; font-weight: 800; background: rgba(0,0,0,0.5); padding: 3px 8px; border-radius: 6px;
            color: var(--exp-color); border: 1px solid rgba(255,255,255,0.1);
        }}
        
        .exp-card .abs-val {{
            font-size: 1.8rem; font-weight: 800; font-family: 'Outfit', sans-serif;
            color: var(--text-main); line-height: 1;
        }}
        .exp-card .abs-val span {{
            font-size: 0.9rem; font-weight: 500; color: var(--text-muted); font-family: 'Inter', sans-serif;
        }}

        .exp-card p {{
            font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;
        }}

        /* Custom Gradients for Top Metrics */
        .m-purple .value {{ background: linear-gradient(135deg, #e9d5ff, var(--chart-purple)); -webkit-background-clip: text;  }}
        .m-yellow .value {{ background: linear-gradient(135deg, #fde68a, var(--brand-main)); -webkit-background-clip: text; }}
        .m-blue .value {{ background: linear-gradient(135deg, #bfdbfe, var(--chart-blue)); -webkit-background-clip: text; }}
        .m-red .value {{ background: linear-gradient(135deg, #fecaca, var(--chart-red)); -webkit-background-clip: text; }}

        /* Responsive */
        @media (max-width: 1400px) {{
            .explanation-grid {{ grid-template-columns: repeat(3, 1fr); }}
        }}
        @media (max-width: 1100px) {{
            .metric-cards {{ grid-template-columns: repeat(2, 1fr); }}
            .chart-col-4, .chart-col-8, .chart-col-5, .chart-col-7 {{ grid-column: span 12; }}
        }}
        @media (max-width: 768px) {{
            .explanation-grid {{ grid-template-columns: 1fr; }}
            .chart-col-6 {{ grid-column: span 12; }}
            body {{ padding: 1.5rem; }} h1 {{ font-size: 2.5rem; }} .metric .value {{ font-size: 2.5rem; }}
        }}

    </style>
</head>
<body>

    <div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div>

    <header class="stagger-1">
        <h1>Inteligência Operacional — V4</h1>
        <p>Análise de 14.405 mensagens B2B consolidadas. Mapeamento preciso do esforço de atendimento e segmentação rica por intenção de compra vs ruído sistêmico.</p>
    </header>

    <div class="dashboard-grid">
        
        <!-- Metrics -->
        <div class="metric-cards stagger-1">
            <div class="panel metric m-purple">
                <div class="label">Volume Tratado</div>
                <div class="value" id="val-msgs">14.405</div>
                <div class="abs-number">Total estruturado (V4)</div>
            </div>
            <div class="panel metric m-purple">
                <div class="label">Peso de Triagem & Ruído</div>
                <div class="value" id="val-fuga">79,8%</div>
                <div class="abs-number">~11.508 msgs</div>
            </div>
            <div class="panel metric m-yellow">
                <div class="label">Intenção Core (Ticket Alto)</div>
                <div class="value" id="val-conversas">15,5%</div>
                <div class="abs-number">~2.237 msgs</div>
            </div>
            <div class="panel metric m-red">
                <div class="label">Fricção logíst. / Comercial</div>
                <div class="value" id="val-logs">7,7%</div>
                <div class="abs-number">~1.122 msgs</div>
            </div>
        </div>

        <!-- Detailed Macro Explainations Grid (NEW) -->
        <div class="explanation-grid stagger-2" id="explanation-container">
            <!-- Povoado por JavaScript -->
        </div>

        <!-- Row 1 -->
        <div class="panel chart-col-5 stagger-2">
            <div class="panel-header">🎯 Macro Distribuição do Esforço</div>
            <div class="chart-container" style="min-height: 450px;">
                <canvas id="chartMacro"></canvas>
            </div>
        </div>

        <div class="panel chart-col-7 stagger-2">
            <div class="panel-header">📦 Top Produtos Core (<span style="color:#fbbf24; margin-left: 5px;">~2.237 interações</span>)</div>
            <div class="chart-container" style="min-height: 450px;">
                <canvas id="chartIntencoes"></canvas>
            </div>
        </div>

        <!-- Row 2 -->
        <div class="panel chart-col-6 stagger-3">
            <div class="panel-header">🟣 A Fila de Triagem (<span style="color:#c084fc; margin-left: 5px;">~11.508 interações rasas</span>)</div>
            <div class="chart-container">
                <canvas id="chartTriagem"></canvas>
            </div>
        </div>

        <div class="panel chart-col-6 stagger-3">
            <div class="panel-header">⚠️ Dores e Fricções (<span style="color:#f87171; margin-left: 5px;">~1.122 atritos diários</span>)</div>
            <div class="chart-container">
                <canvas id="chartFriccao"></canvas>
            </div>
        </div>
    </div>

    <script>
        const rawData = {json_data};
        const TOTAL = rawData.total_mensagens;
        
        // Helper: Formata números (11508 -> "11.508")
        const fA = (pct) => Math.round(TOTAL * (pct / 100)).toLocaleString('pt-BR');

        // Povoando as Caixas de Explicação
        const expContainer = document.getElementById('explanation-container');
        rawData.macro_grupos.forEach(grupo => {{
            const div = document.createElement('div');
            div.className = 'exp-card';
            div.style.setProperty('--exp-color', grupo[2]);
            div.innerHTML = `
                <h4>${{grupo[0]}} <span class="badge">${{grupo[1]}}%</span></h4>
                <div class="abs-val">${{fA(grupo[1])}} <span>mensagens</span></div>
                <p>${{grupo[4]}}</p>
            `;
            expContainer.appendChild(div);
        }});

        // Panels Mouse Tracking
        document.querySelectorAll('.panel, .exp-card').forEach(panel => {{
            panel.addEventListener('mousemove', e => {{
                const rect = panel.getBoundingClientRect();
                panel.style.setProperty('--mouse-x', `${{e.clientX - rect.left}}px`);
                panel.style.setProperty('--mouse-y', `${{e.clientY - rect.top}}px`);
            }});
        }});

        // Chart.js Styles
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 13;
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
        Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
        Chart.defaults.plugins.tooltip.bodyColor = '#f8fafc';
        Chart.defaults.plugins.tooltip.padding = 16;
        Chart.defaults.plugins.tooltip.cornerRadius = 12;
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;

        const createGradient = (ctx, colorStop1, colorStop2, isHorizontal = false) => {{
            const chartArea = ctx.chart.chartArea;
            if (!chartArea) return colorStop1;
            const gradient = isHorizontal 
                ? ctx.chart.ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
                : ctx.chart.ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, colorStop1);
            gradient.addColorStop(1, colorStop2);
            return gradient;
        }};

        // Tooltip Callback Builder (Shows % and Abs)
        const getTooltipConfig = (isMacro = false) => ({{
            callbacks: {{ 
                label: (ctx) => {{
                    const rawVal = isMacro ? ctx.raw : (ctx.parsed.x || ctx.parsed.y);
                    return '   ' + rawVal + '% (~' + fA(rawVal) + ' msgs)';
                }}
            }}
        }});

        // 1. Chart: Macro Grupos
        const ctxMacro = document.getElementById('chartMacro').getContext('2d');
        new Chart(ctxMacro, {{
            type: 'doughnut',
            data: {{
                labels: rawData.macro_grupos.map(g => g[0]),
                datasets: [{{
                    data: rawData.macro_grupos.map(g => g[1]),
                    backgroundColor: rawData.macro_grupos.map(g => g[2]),
                    hoverBackgroundColor: rawData.macro_grupos.map(g => g[3]),
                    borderColor: '#0f172a', borderWidth: 6, hoverBorderWidth: 4, borderRadius: 5
                }}]
            }},
            options: {{
                responsive: true, maintainAspectRatio: false, cutout: '72%', layout: {{ padding: 20 }},
                plugins: {{
                    legend: {{ 
                        position: 'right', 
                        labels: {{ color: '#f8fafc', padding: 24, font: {{ size: 14 }}, usePointStyle: true, pointStyle: 'circle' }}
                    }},
                    tooltip: getTooltipConfig(true)
                }}
            }}
        }});

        // 2. Chart: Intenções Produtos
        const ctxInt = document.getElementById('chartIntencoes').getContext('2d');
        new Chart(ctxInt, {{
            type: 'bar',
            data: {{
                labels: rawData.produtos.map(p => p[0]),
                datasets: [{{
                    label: 'Intenção',
                    data: rawData.produtos.map(p => p[1]),
                    backgroundColor: (ctx) => createGradient(ctx, 'rgba(245, 158, 11, 0.4)', 'rgba(245, 158, 11, 1)', false),
                    hoverBackgroundColor: '#fbbf24', borderRadius: 8, barPercentage: 0.6
                }}]
            }},
            options: {{
                responsive: true, maintainAspectRatio: false,
                scales: {{
                    y: {{ beginAtZero: true, grid: {{ color: 'rgba(255,255,255,0.03)', drawBorder: false }}, ticks: {{ callback: (value) => value + '%' }}, border: {{ dash: [4, 4] }} }},
                    x: {{ grid: {{ display: false }}, ticks: {{ maxRotation: 45, minRotation: 45, color: '#f8fafc' }} }}
                }},
                plugins: {{ legend: {{ display: false }}, tooltip: getTooltipConfig() }}
            }}
        }});

        // 3. Chart: Triagem
        const ctxTriagem = document.getElementById('chartTriagem').getContext('2d');
        new Chart(ctxTriagem, {{
            type: 'bar',
            data: {{
                labels: rawData.triagem.map(t => t[0]),
                datasets: [{{
                    label: 'Volume',
                    data: rawData.triagem.map(t => t[1]),
                    backgroundColor: (ctx) => createGradient(ctx, 'rgba(168, 85, 247, 0.4)', 'rgba(168, 85, 247, 1)', true),
                    hoverBackgroundColor: '#c084fc', borderRadius: 8, barPercentage: 0.7
                }}]
            }},
            options: {{
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                scales: {{
                    x: {{ beginAtZero: true, grid: {{ color: 'rgba(255,255,255,0.03)', drawBorder: false }}, ticks: {{ callback: (value) => value + '%' }}, border: {{ dash: [4, 4] }} }},
                    y: {{ grid: {{ display: false }}, ticks: {{ color: '#f8fafc', font: {{ size: 14 }} }} }}
                }},
                plugins: {{ legend: {{ display: false }}, tooltip: getTooltipConfig() }}
            }}
        }});

        // 4. Chart: Fricção
        const ctxFriccao = document.getElementById('chartFriccao').getContext('2d');
        new Chart(ctxFriccao, {{
            type: 'bar',
            data: {{
                labels: rawData.comercial_suporte.map(c => c[0]),
                datasets: [{{
                    label: 'Impacto',
                    data: rawData.comercial_suporte.map(c => c[1]),
                    backgroundColor: (ctx) => rawData.comercial_suporte[ctx.dataIndex]?.[2] === 'comercial' ? createGradient(ctx, 'rgba(59, 130, 246, 0.4)', 'rgba(59, 130, 246, 1)', true) : createGradient(ctx, 'rgba(239, 68, 68, 0.4)', 'rgba(239, 68, 68, 1)', true),
                    hoverBackgroundColor: (ctx) => rawData.comercial_suporte[ctx.dataIndex]?.[2] === 'comercial' ? '#60a5fa' : '#f87171',
                    borderRadius: 8, barPercentage: 0.7
                }}]
            }},
            options: {{
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                scales: {{
                    x: {{ beginAtZero: true, grid: {{ color: 'rgba(255,255,255,0.03)', drawBorder: false }}, ticks: {{ callback: (value) => value + '%' }}, border: {{ dash: [4, 4] }} }},
                    y: {{ grid: {{ display: false }}, ticks: {{ color: '#f8fafc' }} }}
                }},
                plugins: {{ legend: {{ display: false }}, tooltip: getTooltipConfig() }}
            }}
        }});
    </script>
</body>
</html>
"""

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    print(f"Dashboard V4 Detalhado gerado com sucesso em {{OUTPUT_PATH}}")

if __name__ == "__main__":
    gerar_dashboard()
