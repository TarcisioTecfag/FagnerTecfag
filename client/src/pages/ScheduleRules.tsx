import { useState } from "react";
import { Clock, PhoneOff, Plus, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const DAYS = [
  { id: "mon", label: "Segunda-feira", active: true },
  { id: "tue", label: "Terça-feira", active: true },
  { id: "wed", label: "Quarta-feira", active: true },
  { id: "thu", label: "Quinta-feira", active: true },
  { id: "fri", label: "Sexta-feira", active: true },
  { id: "sat", label: "Sábado", active: false },
  { id: "sun", label: "Domingo", active: false },
];

export default function ScheduleRules() {
  const [blacklist, setBlacklist] = useState(["+1 (555) 000-0000", "+44 7700 900077"]);
  const [newNumber, setNewNumber] = useState("");

  const addToBlacklist = () => {
    if (newNumber && !blacklist.includes(newNumber)) {
      setBlacklist([...blacklist, newNumber]);
      setNewNumber("");
    }
  };

  const removeFromBlacklist = (number: string) => {
    setBlacklist(blacklist.filter(n => n !== number));
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-page-enter">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950">Agendamento & Regras</h1>
          <p className="text-zinc-500 mt-1">Controle quando o robô opera e quem ele deve ignorar.</p>
        </div>
        <Button
          className="gap-2 text-white"
          style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
        >
          <Save size={16} /> Salvar Configurações
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Operating Hours */}
        <Card className="border-red-100">
          <CardHeader className="border-b border-red-50 pb-4" style={{ background: "rgba(220,38,38,0.03)" }}>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock size={18} style={{ color: "#dc2626" }} /> Horário de Funcionamento
            </CardTitle>
            <CardDescription>
              Defina os dias e horários em que o robô tem permissão para responder mensagens.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">

              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-zinc-900">Fuso Horário Global</Label>
                <Badge variant="outline" className="border-red-100 text-zinc-600 bg-red-50/50">UTC-03:00 (Brasília)</Badge>
              </div>

              <div className="h-px bg-red-50"></div>

              <div className="space-y-3">
                {DAYS.map((day) => (
                  <div key={day.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch defaultChecked={day.active} id={`day-${day.id}`} className="data-[state=checked]:bg-red-600" />
                      <Label htmlFor={`day-${day.id}`} className={`font-medium ${day.active ? 'text-zinc-900' : 'text-zinc-400'}`}>
                        {day.label}
                      </Label>
                    </div>

                    {day.active ? (
                      <div className="flex items-center gap-2">
                        <Input type="time" defaultValue="09:00" className="w-28 h-8 text-sm bg-white border-red-100 focus-visible:ring-red-200" />
                        <span className="text-zinc-400 text-sm">até</span>
                        <Input type="time" defaultValue="18:00" className="w-28 h-8 text-sm bg-white border-red-100 focus-visible:ring-red-200" />
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-400 italic">Offline</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Blacklist */}
        <Card className="border-red-100 flex flex-col">
          <CardHeader className="border-b border-red-50 pb-4" style={{ background: "rgba(220,38,38,0.03)" }}>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PhoneOff size={18} style={{ color: "#dc2626" }} /> Lista Negra de Números
            </CardTitle>
            <CardDescription>
              O robô ignorará totalmente as mensagens dantes números. Útil para filtrar spam ou clientes específicos.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col">

            <div className="flex gap-2 mb-6">
              <Input
                placeholder="Digite o número de telefone..."
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToBlacklist()}
                className="bg-white border-red-100 focus-visible:ring-red-200"
              />
              <Button
                onClick={addToBlacklist}
                className="shrink-0 text-white"
                style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
              >
                <Plus size={16} className="mr-1" /> Adicionar
              </Button>
            </div>

            <div className="flex-1 rounded-lg border border-red-100 overflow-hidden" style={{ background: "rgba(220,38,38,0.02)" }}>
              {blacklist.length > 0 ? (
                <div className="divide-y divide-red-50">
                  {blacklist.map((number, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 hover:bg-red-50/40 transition-colors">
                      <span className="text-sm font-mono text-zinc-700">{number}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 px-2"
                        onClick={() => removeFromBlacklist(number)}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 p-8 text-center">
                  <PhoneOff size={24} className="mb-2 opacity-20" />
                  <p className="text-sm">Nenhum número na lista negra.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}