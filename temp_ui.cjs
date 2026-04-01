const fs = require('fs');
let txt = fs.readFileSync('client/src/pages/LiveChat.tsx', 'utf8');

// 1. Add state variable
const s1 = '  const [visitorChats, setVisitorChats] = useState<Chat[]>([]);';
const r1 = '  const [visitorChats, setVisitorChats] = useState<Chat[]>([]);\n  const [pastNegotiations, setPastNegotiations] = useState<any[]>([]);';
if (txt.includes(s1)) { txt = txt.replace(s1, r1); } else { console.log('State replace failed'); }

// 2. Modify useEffect
const s2 = `  // Fetch chat history when visitor selected in CRM
  useEffect(() => {
    if (!selectedVisitor) { setVisitorChats([]); return; }
    fetch(\`/api/livechat/visitors/\${selectedVisitor.id}/chats\`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setVisitorChats)
      .catch(() => setVisitorChats([]));
  }, [selectedVisitor]);`;
const r2 = `  // Fetch chat history and past negotiations when visitor selected in CRM
  useEffect(() => {
    if (!selectedVisitor) { 
      setVisitorChats([]); 
      setPastNegotiations([]);
      return; 
    }
    
    // Fetch chats for the current negotiation
    fetch(\`/api/livechat/visitors/\${selectedVisitor.id}/chats\`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setVisitorChats)
      .catch(() => setVisitorChats([]));

    // Fetch past negotiations (other cards of this same client)
    fetch(\`/api/livechat/visitors/\${selectedVisitor.id}/history\`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setPastNegotiations)
      .catch(() => setPastNegotiations([]));
  }, [selectedVisitor]);`;

if (txt.includes(s2)) {
  txt = txt.replace(s2, r2);
} else if (txt.replace(/\r/g,'').includes(s2.replace(/\r/g, ''))) {
  txt = txt.replace(s2.replace(/\r/g, ''), r2.replace(/\r/g, ''));
} else {
  console.log('UseEffect replace failed');
}

// 3. UI logic
const s3 = '                  {/* Col 2: Chat Atual (Conversas Ativas) */}';
const s4 = '                  {/* Col 4: Notas da IA */}';

const prt = txt.split(s3);
if (prt.length === 2 && prt[1].includes(s4)) {
  const inner = prt[1].split(s4);
  const mid = `
                  <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 p-4 flex flex-col overflow-hidden bg-white">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                      {"\\u{1F4AC}"} Conversas da Sessão
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                      {visitorChats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-300 py-4">
                          <MessageCircle className="w-6 h-6 mb-1 opacity-40" />
                          <p className="text-[10px] text-center">Nenhum chat</p>
                        </div>
                      ) : (
                        visitorChats.map(c => (
                          <div
                            key={c.id}
                            onClick={() => openVisitorChat(c.id)}
                            className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-red-50/50 border border-red-100 cursor-pointer hover:bg-red-50 hover:border-red-300 transition-all group shadow-sm"
                          >
                            <span className={\`w-1.5 h-1.5 rounded-full flex-shrink-0 \${c.status === "closed" ? "bg-zinc-300" : "bg-emerald-500 animate-pulse"}\`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-bold text-red-700 leading-tight">
                                {(c as any).visitorName || selectedVisitor.name || "Visitante"}
                              </p>
                              <span className="text-[9px] text-red-500/70 font-medium">{timeAgo(c.startedAt)}</span>
                            </div>
                            <span className="text-[10px] text-red-600 font-bold ml-1 flex-shrink-0">→</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Col 3: Histórico de Negociações (Outros Cards) */}
                  <div className="w-[200px] flex-shrink-0 border-r border-zinc-100 p-4 flex flex-col overflow-hidden bg-zinc-50/30">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                      {"\\u{1F4C2}"} Negociações Anteriores
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                      {pastNegotiations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-300 py-4">
                          <Layers className="w-6 h-6 mb-1 opacity-40" />
                          <p className="text-[10px] text-center">Nenhum histórico extra</p>
                        </div>
                      ) : (
                        pastNegotiations.map(pn => (
                          <div
                            key={pn.id}
                            onClick={() => setSelectedVisitor(pn)}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-zinc-200 cursor-pointer hover:border-zinc-300 hover:shadow-sm transition-all group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-[10px] font-medium text-zinc-600 group-hover:text-zinc-900 transition-colors">
                                {new Date(pn.lastSeenAt).toLocaleDateString("pt-BR", { day: '2-digit', month: 'short' })} • {(pn as any).pipelineStage ? (pn as any).pipelineStage.replace(/_/g," ") : ""}
                              </p>
                            </div>
                            <span className="text-[8px] bg-zinc-100 text-zinc-400 px-1 py-0.5 rounded flex-shrink-0">Abrir</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

`;
  txt = prt[0] + s3 + mid + s4 + inner[1];
} else {
  console.log('Split replace failed UI');
}

fs.writeFileSync('client/src/pages/LiveChat.tsx', txt, 'utf8');
