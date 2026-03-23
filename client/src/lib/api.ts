// Centraliza a base URL da API.
// Com vercel.json proxy: VITE_API_URL deve ser vazio ("") —
// o Vercel faz proxy de /api/* para o Railway, eliminando CORS.
// Em desenvolvimento local, também usa caminho relativo (proxy do Vite em vite.config.ts).
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

// URL do WebSocket — quando API_BASE é vazio usa o mesmo host da página
export const WS_URL: string = API_BASE
  ? API_BASE.replace("https://", "wss://").replace("http://", "ws://")
  : typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "";
