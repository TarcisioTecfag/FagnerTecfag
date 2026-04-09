"""Fix broken JSX in LiveChat.tsx using CRLF-aware split"""
with open('client/src/pages/LiveChat.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Replace the broken pos_venda comment + leftover ].map(...) with correct block
old1 = (
    '                      {/* Pós Venda — campos específicos */}\n'
    '                          ].map(f => (\n'
    '                            <div key={f.label} className={`p-2 rounded-lg border shadow-sm ${f.value ? \'bg-white border-purple-100/60\' : \'bg-zinc-50 border-zinc-100/60 opacity-70\'}`}>\n'
    '                              <p className="text-[9px] text-purple-400 font-semibold uppercase tracking-wide mb-0.5">{f.icon} {f.label}</p>\n'
    '                              <p className={`text-[11px] font-semibold break-all leading-snug ${f.value ? \'text-zinc-700\' : \'text-zinc-400 italic\'}`}>\n'
    "                                {f.value || 'Aguardando'}\n"
    '                              </p>\n'
    '                            </div>\n'
    '                          ))}\n'
    '                        </>\n'
    '                      )}\n'
)

new1 = (
    '                      {/* Pós Venda — campos específicos */}\n'
    '                      {(selectedVisitor.pipelineStage === \'pos_venda\' || selectedVisitor.posVendaProblema || selectedVisitor.posVendaNotaPedido) && (\n'
    '                        <>\n'
    '                          <div className="pt-1 pb-0.5">\n'
    '                            <p className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: \'#8b5cf6\' }}>\n'
    '                              Pos Venda\n'
    '                            </p>\n'
    '                          </div>\n'
    '                          {[\n'
    '                            { label: \'Problema relatado\', value: selectedVisitor.posVendaProblema, icon: \'⚙️\' },\n'
    '                            { label: \'Nota do pedido\', value: selectedVisitor.posVendaNotaPedido, icon: \'📄\' },\n'
    '                          ].map(f => (\n'
    '                            <div key={f.label} className={`p-2 rounded-lg border shadow-sm ${f.value ? \'bg-white border-purple-100/60\' : \'bg-zinc-50 border-zinc-100/60 opacity-70\'}`}>\n'
    '                              <p className="text-[9px] text-purple-400 font-semibold uppercase tracking-wide mb-0.5">{f.icon} {f.label}</p>\n'
    '                              <p className={`text-[11px] font-semibold break-all leading-snug ${f.value ? \'text-zinc-700\' : \'text-zinc-400 italic\'}`}>\n'
    "                                {f.value || 'Aguardando'}\n"
    '                              </p>\n'
    '                            </div>\n'
    '                          ))}\n'
    '                        </>\n'
    '                      )}\n'
)

# Fix 2: Remove the leftover fragment after </div> (lines 2319-2326)
old2 = (
    '                  </div>\n'
    '                                {f.value || "Aguardando preenchimento"}\n'
    '                              </p>\n'
    '                            </div>\n'
    '                          ))}\n'
    '                        </div>\n'
    '                      </>\n'
    '                    )}\n'
    '                  </div>\n'
)
new2 = '                  </div>\n'

# Also try CRLF versions
old1_crlf = old1.replace('\n', '\r\n')
new1_crlf = new1.replace('\n', '\r\n')
old2_crlf = old2.replace('\n', '\r\n')
new2_crlf = new2.replace('\n', '\r\n')

changed = False
if old1_crlf in content:
    content = content.replace(old1_crlf, new1_crlf, 1)
    print("Fix 1 applied (CRLF)")
    changed = True
elif old1 in content:
    content = content.replace(old1, new1, 1)
    print("Fix 1 applied (LF)")
    changed = True
else:
    print("Fix 1 NOT found - checking fragment...")

if old2_crlf in content:
    content = content.replace(old2_crlf, new2_crlf, 1)
    print("Fix 2 applied (CRLF)")
    changed = True
elif old2 in content:
    content = content.replace(old2, new2, 1)
    print("Fix 2 applied (LF)")
    changed = True
else:
    print("Fix 2 NOT found")

if changed:
    with open('client/src/pages/LiveChat.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("File saved.")
else:
    print("No changes made.")
