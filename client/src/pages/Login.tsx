import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Loader2, AlertCircle, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

// ─────────────────────────────────────────────────────────────
// Mensagens do balão de fala
// ─────────────────────────────────────────────────────────────
const MESSAGES = [
  { text: "Olá! Bem-vindo! 👋", highlight: "Bem-vindo!", delay: 2000 },
  { text: "Sou o Fagner,", highlight: "Fagner,", delay: 1800 },
  { text: "seu assistente de IA.", highlight: "assistente de IA.", delay: 2200 },
  { text: "Pronto para ajudar!", highlight: "ajudar!", delay: 2000 },
];

// ─────────────────────────────────────────────────────────────
// Componente: Balão de fala premium
// ─────────────────────────────────────────────────────────────
function SpeechBubble() {
  const [displayParts, setDisplayParts] = useState<{
    before: string;
    hi: string;
    after: string;
  }>({ before: "", hi: "", after: "" });

  const msgIdx = useRef(0);
  const charIdx = useRef(0);
  const isDeleting = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      const msg = MESSAGES[msgIdx.current];
      const full = msg.text;
      const hi = msg.highlight ?? "";

      if (isDeleting.current) charIdx.current--;
      else charIdx.current++;

      const slice = full.substring(0, charIdx.current);
      const hiStart = hi ? full.indexOf(hi) : -1;
      const hiEnd = hiStart >= 0 ? hiStart + hi.length : -1;

      if (hi && hiStart >= 0 && charIdx.current > hiStart) {
        const visibleEnd = Math.min(charIdx.current, hiEnd);
        setDisplayParts({
          before: slice.substring(0, hiStart),
          hi: slice.substring(hiStart, visibleEnd),
          after: charIdx.current > hiEnd ? slice.substring(hiEnd) : "",
        });
      } else {
        setDisplayParts({ before: slice, hi: "", after: "" });
      }

      let speed = isDeleting.current ? 35 : 65;

      if (!isDeleting.current && charIdx.current === full.length) {
        speed = msg.delay;
        isDeleting.current = true;
      } else if (isDeleting.current && charIdx.current === 0) {
        isDeleting.current = false;
        msgIdx.current = (msgIdx.current + 1) % MESSAGES.length;
        speed = 400;
      }

      timer = setTimeout(tick, speed);
    }

    const init = setTimeout(tick, 800);
    return () => { clearTimeout(timer); clearTimeout(init); };
  }, []);

  return (
    <div
      className="relative"
      style={{ animation: "bubble-breathe 4s ease-in-out infinite" }}
    >
      {/* Glow sutil atrás do balão */}
      <div
        className="absolute inset-0 rounded-3xl blur-xl opacity-40"
        style={{ background: "rgba(239, 68, 68, 0.3)" }}
      />
      {/* Balão */}
      <div
        className="relative px-7 py-5 rounded-3xl text-center"
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
          minWidth: 240,
          maxWidth: 310,
          minHeight: 64,
        }}
      >
        <p
          className="text-[1.05rem] font-medium leading-relaxed min-h-[1.6rem]"
          style={{ color: "rgba(241,245,249,0.95)", letterSpacing: "-0.01em" }}
        >
          {displayParts.before}
          {displayParts.hi && (
            <span
              style={{
                fontWeight: 700,
                background: "linear-gradient(135deg, #fca5a5, #ef4444)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {displayParts.hi}
            </span>
          )}
          {displayParts.after}
          <span
            className="ml-[2px] inline-block w-[2px] align-middle rounded-full"
            style={{
              height: "1em",
              background: "linear-gradient(135deg, #fca5a5, #ef4444)",
              animation: "cursor-blink 0.8s step-end infinite",
            }}
          />
        </p>
      </div>
      {/* Rabicho apontando para baixo */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: -10,
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "10px solid rgba(255,255,255,0.12)",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Componente: Partícula decorativa flutuante (lado direito)
// ─────────────────────────────────────────────────────────────
function FloatingOrb({
  size, color, top, left, delay, duration,
}: {
  size: number; color: string; top: string; left: string; delay: number; duration: number;
}) {
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        background: color,
        top,
        left,
        animation: `orb-float ${duration}s ease-in-out ${delay}s infinite`,
        filter: "blur(1px)",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Componente principal: Página de Login
// ─────────────────────────────────────────────────────────────
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [valHovered, setValHovered] = useState(false);

  const { loginMutation, user } = useAuth();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation("/");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password, rememberMe });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');

        .login-root { font-family: 'Inter', system-ui, sans-serif; }

        /* ── Keyframes ─────────────────────────── */
        @keyframes bubble-breathe {
          0%, 100% { transform: scale(1) translateY(0px); }
          50%       { transform: scale(1.025) translateY(-4px); }
        }
        @keyframes cursor-blink {
          from, to { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes orb-float {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.6; }
          50%       { transform: translateY(-18px) scale(1.05); opacity: 0.9; }
        }
        @keyframes login-slide-up {
          0%   { opacity: 0; transform: translateY(28px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes login-slide-right {
          0%   { opacity: 0; transform: translateX(32px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes val-appear {
          0%   { opacity: 0; transform: scale(0.92) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes grid-fade {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); opacity: 0.6; }
          70%  { transform: scale(1.05); opacity: 0.1; }
          100% { transform: scale(0.95); opacity: 0; }
        }

        @keyframes neon-pulse {
          0%, 100% {
            transform: scaleX(1);
            box-shadow: 0 0 5px #fff, 0 0 10px #ef4444, 0 0 20px #ef4444, 0 0 40px #b91c1c, 0 0 70px #b91c1c;
          }
          50% {
            transform: scaleX(1.02);
            box-shadow: 0 0 10px #fff, 0 0 20px #ef4444, 0 0 40px #ef4444, 0 0 60px #b91c1c, 0 0 100px #b91c1c;
          }
        }
        @keyframes neon-reflection {
          0%, 100% { opacity: 0.25; transform: scaleX(0.9); }
          50%       { opacity: 0.5;  transform: scaleX(1.1); }
        }
        @keyframes neon-scan {
          0%   { left: -60%; }
          100% { left: 160%; }
        }

        /* ── Classes de animação ───────────────── */
        .anim-slide-up-1 { animation: login-slide-up 0.65s cubic-bezier(0.22,1,0.36,1) 0.05s both; }
        .anim-slide-up-2 { animation: login-slide-up 0.65s cubic-bezier(0.22,1,0.36,1) 0.15s both; }
        .anim-slide-up-3 { animation: login-slide-up 0.65s cubic-bezier(0.22,1,0.36,1) 0.25s both; }
        .anim-slide-up-4 { animation: login-slide-up 0.65s cubic-bezier(0.22,1,0.36,1) 0.35s both; }
        .anim-slide-up-5 { animation: login-slide-up 0.65s cubic-bezier(0.22,1,0.36,1) 0.45s both; }
        .anim-val        { animation: val-appear 0.9s cubic-bezier(0.22,1,0.36,1) 0.3s both; }
        .anim-grid       { animation: grid-fade 1.2s ease 0.2s both; }

        /* ── Input premium ─────────────────────── */
        .input-premium {
          width: 100%;
          height: 52px;
          border-radius: 14px;
          border: 1.5px solid #e2e8f0;
          background: #f8fafc;
          padding: 0 16px;
          font-size: 0.9375rem;
          font-family: 'Inter', system-ui, sans-serif;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .input-premium::placeholder { color: #94a3b8; }
        .input-premium:focus {
          border-color: #dc2626;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(220,38,38,0.08), 0 1px 3px rgba(0,0,0,0.06);
        }
        .input-premium.has-value { background: #fff; }

        /* ── Botão premium com shine ────────────── */
        .btn-primary {
          position: relative;
          width: 100%;
          height: 52px;
          border-radius: 14px;
          border: none;
          font-weight: 700;
          font-size: 0.9375rem;
          font-family: 'Inter', system-ui, sans-serif;
          letter-spacing: 0.01em;
          color: #fff;
          cursor: pointer;
          overflow: hidden;
          transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s;
          background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #ef4444 100%);
          box-shadow: 0 4px 20px rgba(220,38,38,0.35), 0 1px 3px rgba(0,0,0,0.15);
        }
        .btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%);
          background-size: 200% 100%;
          transition: background-position 0.4s;
        }
        .btn-primary:hover::before { background-position: -100% center; animation: shimmer 1.2s linear; }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(220,38,38,0.45), 0 2px 6px rgba(0,0,0,0.1);
        }
        .btn-primary:active { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.65; transform: none; cursor: not-allowed; }

        /* ── Checkbox ──────────────────────────── */
        .check-btn {
          width: 20px; height: 20px;
          border-radius: 7px;
          border: 1.5px solid #cbd5e1;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.18s;
          flex-shrink: 0;
          background: #f8fafc;
        }
        .check-btn.active {
          border-color: #dc2626;
          background: linear-gradient(135deg, #b91c1c, #dc2626);
          box-shadow: 0 2px 8px rgba(220,38,38,0.3);
        }

        /* ── Grade de pontos (painel direito) ─── */
        .dot-grid {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        /* ── Glow circular atrás do Fagner ─── */
        .fagner-glow {
          position: absolute;
          width: 340px; height: 340px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(239,68,68,0.22) 0%, rgba(185,28,28,0.12) 50%, transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
      `}</style>

      <div className="login-root flex h-screen overflow-hidden">

        {/* ═══════════════════════════════════════════════════════
            PAINEL ESQUERDO — Universo Fagner
        ═══════════════════════════════════════════════════════ */}
        <div
          className="hidden lg:flex lg:w-[52%] items-center justify-center relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #1a0000 0%, #7f1d1d 40%, #450a0a 70%, #1a0000 100%)",
          }}
        >
          {/* Grade de pontos de fundo */}
          <div className="dot-grid anim-grid" />

          {/* Orbes flutuantes decorativos */}
          <FloatingOrb size={120} color="rgba(220,38,38,0.12)" top="8%" left="10%" delay={0} duration={6} />
          <FloatingOrb size={80} color="rgba(185,28,28,0.15)" top="70%" left="75%" delay={1.5} duration={7} />
          <FloatingOrb size={50} color="rgba(239,68,68,0.2)" top="15%" left="78%" delay={0.8} duration={5} />
          <FloatingOrb size={35} color="rgba(252,165,165,0.2)" top="78%" left="15%" delay={2} duration={8} />
          <FloatingOrb size={20} color="rgba(254,202,202,0.3)" top="40%" left="85%" delay={0.3} duration={4.5} />
          <FloatingOrb size={14} color="rgba(239,68,68,0.35)" top="88%" left="45%" delay={1} duration={6} />

          {/* Linha de gradiente decorativa */}
          <div
            className="absolute inset-x-0 top-0 h-px opacity-30"
            style={{ background: "linear-gradient(90deg, transparent, rgba(252,165,165,0.8), transparent)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-px opacity-20"
            style={{ background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.6), transparent)" }}
          />

          {/* Glow atrás do Fagner */}
          <div className="fagner-glow" />

          {/* Conteúdo central */}
          <div className="relative z-10 flex flex-col items-center text-center px-10 anim-val">

            {/* ── Grupo hover: balão + fagner + barra ── */}
            <div
              onMouseEnter={() => setValHovered(true)}
              onMouseLeave={() => setValHovered(false)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                transition: "transform 0.45s cubic-bezier(0.34,1.56,0.64,1)",
                transform: valHovered ? "scale(1.07)" : "scale(1)",
                transformOrigin: "bottom center",
                cursor: "default",
              }}
            >
              {/* Balão de fala */}
              <div className="mb-5 w-full flex justify-center">
                <SpeechBubble />
              </div>

              {/* Imagem do Fagner */}
              <div className="relative mt-2">
                {/* Anel pulsante */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "radial-gradient(circle, rgba(239,68,68,0.25) 0%, transparent 70%)",
                    animation: "pulse-ring 3s ease-out infinite",
                    transform: "scale(1.15)",
                  }}
                />
                <img
                  src="/fagner.png"
                  alt="Fagner - Agente de IA da Tec I.A"
                  className="relative block"
                  style={{
                    height: 300,
                    width: "auto",
                    filter: valHovered
                      ? "drop-shadow(0 0 55px rgba(239,68,68,0.5)) drop-shadow(0 20px 40px rgba(0,0,0,0.45))"
                      : "drop-shadow(0 0 40px rgba(239,68,68,0.25)) drop-shadow(0 20px 40px rgba(0,0,0,0.4))",
                    transition: "filter 0.35s ease",
                  }}
                />
              </div>

              {/* Barra neon */}
              <div
                style={{
                  position: "relative",
                  width: valHovered ? "92%" : "80%",
                  height: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  marginBottom: 28,
                  transition: "width 0.45s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                {/* Reflexo inferior */}
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    width: "90%",
                    height: 20,
                    background: "linear-gradient(90deg, #b91c1c, #ef4444, #b91c1c)",
                    filter: "blur(22px)",
                    borderRadius: "50%",
                    animation: "neon-reflection 2s ease-in-out infinite",
                  }}
                />
                {/* Barra principal */}
                <div
                  style={{
                    width: "100%",
                    height: valHovered ? 8 : 6,
                    background: "linear-gradient(90deg, #991b1b, #ef4444, #991b1b)",
                    borderRadius: 50,
                    animation: "neon-pulse 2s ease-in-out infinite",
                    overflow: "hidden",
                    position: "relative",
                    transition: "height 0.3s ease",
                  }}
                >
                  {/* Varredura de luz */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "50%",
                      height: "100%",
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)",
                      animation: "neon-scan 3s linear infinite",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Nome */}
            <h2
              className="text-4xl font-extrabold tracking-tight"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #fca5a5 60%, #ef4444 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.03em",
              }}
            >
              Fagner
            </h2>

            {/* Subtítulo */}
            <p
              className="mt-3 text-base leading-relaxed max-w-[280px]"
              style={{ color: "rgba(254,202,202,0.8)", fontWeight: 400 }}
            >
              Seu assistente de IA para atendimento inteligente e vendas automatizadas.
            </p>

            {/* Badge de status */}
            <div className="mt-5 flex items-center gap-2">
              <span
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(254,202,202,0.9)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#4ade80",
                    boxShadow: "0 0 6px #4ade80",
                  }}
                />
                Online
              </span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            PAINEL DIREITO — Formulário
        ═══════════════════════════════════════════════════════ */}
        <div
          className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] overflow-y-auto"
          style={{ background: "#fff" }}
        >
          <div className="w-full" style={{ maxWidth: 400 }}>

            {/* ── Branding ── */}
            <div className="flex flex-col items-center mb-10 anim-slide-up-1">
              {/* Logo */}
              <div className="relative mb-5">
                <div
                  className="absolute inset-0 rounded-2xl blur-lg opacity-30"
                  style={{ background: "linear-gradient(135deg, #b91c1c, #7f1d1d)" }}
                />
                <div
                  className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)",
                    boxShadow: "0 8px 24px rgba(220,38,38,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                >
                  <Sparkles className="w-7 h-7 text-white" strokeWidth={1.5} />
                </div>
              </div>

              {/* Nome do produto */}
              <h1
                className="text-4xl font-extrabold tracking-tight"
                style={{
                  background: "linear-gradient(135deg, #0f172a 0%, #dc2626 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.03em",
                }}
              >
                Tec I.A
              </h1>

              {/* Badge empresa */}
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(220,38,38,0.07)",
                    color: "#dc2626",
                    border: "1px solid rgba(220,38,38,0.15)",
                  }}
                >
                  Tecfag Group
                </span>
              </div>
            </div>

            {/* ── Cabeçalho do form ── */}
            <div className="mb-7 anim-slide-up-2">
              <h2
                className="text-2xl font-bold"
                style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
              >
                Bem-vindo de volta
              </h2>
              <p className="mt-1 text-sm" style={{ color: "#64748b" }}>
                Acesse o painel de controle do Fagner
              </p>
            </div>

            {/* ── Erro de login ── */}
            {loginMutation.isError && (
              <div
                className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm anim-slide-up-2"
                style={{
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#dc2626",
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{loginMutation.error?.message ?? "Credenciais inválidas. Tente novamente."}</span>
              </div>
            )}

            {/* ── Formulário ── */}
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* E-mail */}
              <div className="anim-slide-up-3">
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold mb-1.5"
                  style={{ color: "#374151" }}
                >
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="seu@email.com.br"
                  data-testid="input-email"
                  required
                  className={`input-premium${email ? " has-value" : ""}`}
                />
              </div>

              {/* Senha */}
              <div className="anim-slide-up-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold"
                    style={{ color: "#374151" }}
                  >
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs font-semibold transition-colors"
                    style={{ color: "#dc2626" }}
                    data-testid="button-forgot-password"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="••••••••"
                    data-testid="input-password"
                    required
                    className={`input-premium pr-12${password ? " has-value" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: passwordFocused ? "#dc2626" : "#94a3b8" }}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Lembrar de mim */}
              <div className="flex items-center gap-2.5 pt-1 anim-slide-up-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={rememberMe}
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`check-btn${rememberMe ? " active" : ""}`}
                >
                  {rememberMe && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className="text-sm select-none" style={{ color: "#475569" }}>
                  Lembrar de mim neste dispositivo
                </span>
              </div>

              {/* Botão submit */}
              <div className="pt-2 anim-slide-up-5">
                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="btn-primary"
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : (
                    "Acessar Painel"
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Rodapé */}
          <p
            className="mt-12 text-xs anim-slide-up-5"
            style={{ color: "#94a3b8" }}
          >
            © {new Date().getFullYear()} Tecfag Group. Todos os direitos reservados.
          </p>
        </div>



        {/* ── Dialog — Esqueceu a senha ── */}
        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent className="rounded-2xl border border-border shadow-2xl">
            <DialogHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                </div>
                <DialogTitle className="text-xl font-semibold">Redefinir Senha</DialogTitle>
              </div>
              <DialogDescription className="text-muted-foreground pt-2">
                Para redefinir sua senha, entre em contato com o administrador do sistema.
                Eles poderão ajudá-lo a recuperar o acesso à sua conta.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setForgotOpen(false)}
                className="rounded-xl"
                data-testid="button-dialog-cancel"
              >
                Fechar
              </Button>
              <Button
                className="rounded-xl"
                data-testid="button-dialog-contact"
              >
                Contatar Suporte
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
