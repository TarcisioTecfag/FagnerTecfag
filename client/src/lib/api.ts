// Centraliza a base URL da API.
// Em produção (Vercel), VITE_API_URL aponta para o Railway.
// Em desenvolvimento local, usa caminho relativo (proxy do Vite).
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

// URL do WebSocket — converte https→wss e http→ws automaticamente.
export const WS_URL: string = API_BASE
  .replace("https://", "wss://")
  .replace("http://", "ws://");
