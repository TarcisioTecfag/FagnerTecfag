// server/fagner/scheduleService.ts
// Lógica de horário de atendimento do Fagner (Seg-Sex, 8h-18h BRT)
// Se fora do horário, envia mensagem automática e sinaliza ao orquestrador

export interface ScheduleConfig {
  enabled: boolean;
  weekdays: number[];          // 0=Dom, 1=Seg ... 6=Sab
  startHour: number;           // ex: 8
  endHour: number;             // ex: 18
  timezone: string;            // ex: "America/Sao_Paulo"
  offHoursMessage: string;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: true,
  weekdays: [1, 2, 3, 4, 5],  // Segunda a Sexta
  startHour: 8,
  endHour: 18,
  timezone: "America/Sao_Paulo",
  offHoursMessage:
    "Olá! Tudo bem? 😊 Nosso atendimento funciona de segunda a sexta, das 8h às 18h. " +
    "Assim que estivermos online, eu te respondo. Se preferir, pode deixar sua mensagem aqui " +
    "que a gente retorna assim que possível!",
};

let currentSchedule: ScheduleConfig = { ...DEFAULT_SCHEDULE };

export function setSchedule(cfg: Partial<ScheduleConfig>) {
  currentSchedule = { ...currentSchedule, ...cfg };
}

export function getSchedule(): ScheduleConfig {
  return { ...currentSchedule };
}

/**
 * Verifica se o horário atual é dentro do horário de atendimento.
 * Usa o timezone configurado (BRT por padrão).
 */
export function isWithinSchedule(): boolean {
  const cfg = currentSchedule;
  if (!cfg.enabled) return true; // Se desativado, sempre atende

  const now = new Date();

  // Obtém hora e dia da semana no timezone configurado
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  formatter.formatToParts(now).forEach((p) => {
    parts[p.type] = p.value;
  });

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = weekdayMap[parts.weekday] ?? -1;
  const hourNow   = parseInt(parts.hour ?? "0", 10);

  if (!cfg.weekdays.includes(dayOfWeek)) return false;
  if (hourNow < cfg.startHour || hourNow >= cfg.endHour) return false;

  return true;
}

/**
 * Retorna a mensagem de fora do horário configurada.
 */
export function getOffHoursMessage(): string {
  return currentSchedule.offHoursMessage;
}

/**
 * Formata o próximo horário de abertura como string legível.
 */
export function getNextOpenTime(): string {
  const cfg = currentSchedule;
  const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  const nowParts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date()).forEach((p) => (nowParts[p.type] = p.value));

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const today = weekdayMap[nowParts.weekday] ?? 0;

  // Procura o próximo dia de atendimento
  for (let i = 1; i <= 7; i++) {
    const nextDay = (today + i) % 7;
    if (cfg.weekdays.includes(nextDay)) {
      return `${dayNames[nextDay]} às ${cfg.startHour}h`;
    }
  }

  return `${dayNames[cfg.weekdays[0]]} às ${cfg.startHour}h`;
}
