import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings, Key, Shield } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newApiKey, setNewApiKey] = useState("");

  const { data: apiKey } = useQuery<string | null>({
    queryKey: ["/api/settings/gemini_api_key"],
  });

  const updateApiKeyMutation = useMutation({
    mutationFn: (value: string) =>
      apiRequest("POST", "/api/settings", { key: "gemini_api_key", value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/gemini_api_key"] });
      toast({ title: "Sucesso", description: "Chave de API atualizada." });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full overflow-hidden flex flex-col p-0 border border-red-100 bg-white/95 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)] rounded-3xl duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[50%] sm:zoom-in-90">

        {/* Modal Header */}
        <DialogHeader
          className="p-8 border-b border-red-50 shrink-0"
          style={{ background: "linear-gradient(180deg, #fff 0%, rgba(220,38,38,0.03) 100%)" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="p-3 rounded-2xl shadow-sm flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
            >
              <Settings size={28} strokeWidth={1.5} />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-zinc-950">
                Configurações do Sistema
              </DialogTitle>
              <DialogDescription className="text-zinc-500 text-base mt-1">
                Configure a chave de IA do robô Fagner.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-8 bg-zinc-50/30">
          <div className="p-8 bg-white rounded-3xl border border-red-100 shadow-sm space-y-8 relative overflow-hidden group hover:border-red-200 transition-colors">
            <div
              className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: "linear-gradient(90deg, #991b1b, #ef4444, #991b1b)" }}
            />

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl text-white" style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-950">Inteligência Artificial</h3>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    Configure sua chave de API do Google Gemini para habilitar o processamento de linguagem natural.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="apiKey" className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 ml-1">
                Chave de API (Gemini)
              </Label>
              <div className="flex gap-4">
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={apiKey ? "Chave configurada (••••••••••••••••)" : "Cole sua chave do Google Studio aqui"}
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  className="font-mono bg-zinc-50/80 border-red-100 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 h-12 rounded-xl text-base px-4"
                />
                <Button
                  onClick={() => {
                    updateApiKeyMutation.mutate(newApiKey);
                    setNewApiKey("");
                  }}
                  disabled={!newApiKey || updateApiKeyMutation.isPending}
                  className="text-white font-medium px-8 h-12 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                >
                  Salvar
                </Button>
              </div>
            </div>

            {apiKey && (
              <div
                className="flex items-center justify-between p-5 rounded-2xl border border-emerald-100 shadow-sm animate-in fade-in zoom-in-95 duration-500"
                style={{ background: "linear-gradient(90deg, rgba(16,185,129,0.05), rgba(16,185,129,0.02))" }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-inner">
                    <Shield size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-900">API Conectada e Ativa</p>
                    <p className="text-xs font-semibold text-emerald-700/80 mt-0.5">O robô está pronto para processar mensagens</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-xl px-4 font-semibold"
                  onClick={() => updateApiKeyMutation.mutate("")}
                >
                  Remover Chave
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
