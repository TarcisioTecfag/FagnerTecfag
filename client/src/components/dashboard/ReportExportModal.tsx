import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileSpreadsheet, History, Search } from "lucide-react";
import { format } from "date-fns";

interface ReportExportModalProps {
  open: boolean;
  onClose: () => void;
}

interface ReportLog {
  id: string;
  reportName: string;
  downloadedBy: string;
  filtersUsed: any;
  downloadedAt: string;
}

export default function ReportExportModal({ open, onClose }: ReportExportModalProps) {
  const [logs, setLogs] = useState<ReportLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Filtros locais para o primeiro relatório
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const reports = [
    {
      id: "geral_leads",
      name: "Relatório Geral de Leads (CRM)",
      description: "Extração detalhada de todos os visitantes que chegaram na fase de pós venda ou deixaram contato.",
      available: true
    },
    {
      id: "performance_ia",
      name: "Performance da I.A. Fagner",
      description: "Resumo de retenção, intenções não compreendidas e taxa de resolução da IA.",
      available: false
    },
    {
      id: "historico_chats",
      name: "Histórico de Atendimentos Pela I.A.",
      description: "Extração de todos os chats contendo detalhes da conversa.",
      available: true
    }
  ];

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/livechat/reports/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDownload = async (reportId: string) => {
    setDownloading(true);
    try {
      const res = await fetch("/api/livechat/reports/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportCode: reportId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        })
      });

      if (!res.ok) {
        alert("Falha ao gerar relatório.");
        return;
      }

      // Baixar arquivo Blob
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Pegar filename do header se possível, ou usar default
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = "relatorio.xlsx";
      if (contentDisposition && contentDisposition.includes("filename=")) {
        filename = contentDisposition.split("filename=")[1].replace(/"/g, "");
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Atualiza os logs agora que um novo foi feito
      fetchLogs();

    } catch (err: any) {
      alert("Erro ao realizar download: " + err.message);
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div 
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: "fadeInUp 0.3s ease-out" }}
      >
        <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.02); border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}
        </style>

        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 bg-zinc-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center border border-zinc-200 text-zinc-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-wide">Exportação de Relatórios</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Baixe dados consolidados do Fagner em formato XLSX.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          
          {/* SELECTION AREA */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-zinc-500" /> Relatórios Disponíveis
            </h3>
            
            <div className="space-y-4">
              {reports.map(r => (
                <div 
                  key={r.id} 
                  className={`p-4 rounded-xl border transition-all ${r.available ? 'border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm' : 'border-zinc-100 bg-zinc-50 opacity-60'}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-zinc-800">{r.name}</h4>
                        {!r.available && <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 font-semibold border border-zinc-300">Em breve</span>}
                        {r.available && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold border border-green-200">Disponível XLSX</span>}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{r.description}</p>
                    </div>

                    {r.available && (
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="flex items-center gap-2 bg-zinc-50 p-1.5 rounded-lg border border-zinc-200">
                          <div className="flex items-center gap-2 px-2">
                            <span className="text-[10px] uppercase text-zinc-500 font-bold">De:</span>
                            <input 
                              type="date" 
                              value={dateFrom}
                              onChange={e => setDateFrom(e.target.value)}
                              className="bg-transparent text-xs text-zinc-700 outline-none w-28 placeholder-zinc-400" 
                              style={{ colorScheme: 'light' }}
                            />
                          </div>
                          <div className="h-4 w-px bg-zinc-200" />
                          <div className="flex items-center gap-2 px-2">
                            <span className="text-[10px] uppercase text-zinc-500 font-bold">Até:</span>
                            <input 
                              type="date" 
                              value={dateTo}
                              onChange={e => setDateTo(e.target.value)}
                              className="bg-transparent text-xs text-zinc-700 outline-none w-28 placeholder-zinc-400" 
                              style={{ colorScheme: 'light' }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => handleDownload(r.id)}
                          disabled={downloading}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-900 active:bg-black text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          {downloading ? (
                            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {downloading ? 'Gerando...' : 'Baixar XLSX'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* LOGS AREA */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-orange-500" /> Registro de Auditoria & Downloads
            </h3>
            
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {loadingLogs ? (
                <div className="p-8 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-zinc-200 border-t-zinc-600 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  <p className="text-sm">Nenhum relatório foi baixado ainda.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold tracking-wider">
                      <th className="p-3 border-b border-zinc-200">Data/Hora</th>
                      <th className="p-3 border-b border-zinc-200">Relatório</th>
                      <th className="p-3 border-b border-zinc-200">Filtros Usados</th>
                      <th className="p-3 border-b border-zinc-200 whitespace-nowrap">Baixado Por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="text-xs text-zinc-700 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                        <td className="p-3 whitespace-nowrap text-zinc-500">
                          {format(new Date(log.downloadedAt), "dd/MM/yyyy • HH:mm:ss")}
                        </td>
                        <td className="p-3 font-medium text-zinc-800">
                          {log.reportName}
                        </td>
                        <td className="p-3 text-[10px] font-mono text-zinc-500">
                          {log.filtersUsed?.dateFrom ? `De ${log.filtersUsed.dateFrom} ` : ""}
                          {log.filtersUsed?.dateTo ? `Até ${log.filtersUsed.dateTo}` : ""}
                          {!log.filtersUsed?.dateFrom && !log.filtersUsed?.dateTo ? "Sem filtros" : ""}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-1 bg-zinc-100 border border-zinc-200 rounded text-zinc-700 text-[10px] font-bold">
                            {log.downloadedBy}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
