import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface LogEntry {
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
}

interface LogContextType {
  logs: LogEntry[];
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Carregar logs iniciais do servidor
    const fetchInitialLogs = async () => {
      try {
        const response = await fetch('/api/bot/logs');
        if (response.ok) {
          const initialLogs = await response.json();
          // Os logs vêm invertidos do servidor (mais recentes primeiro),
          // mas o terminal no dashboard os inverte novamente.
          // Para manter consistência com o hook anterior, apenas invertemos para ordem cronológica.
          setLogs(initialLogs.reverse());
        }
      } catch (error) {
        console.error("Failed to fetch initial logs", error);
      }
    };

    fetchInitialLogs();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/ws/logs`);

    socket.onmessage = (event) => {
      try {
        const newLog = JSON.parse(event.data);
        setLogs((prev) => [...prev, newLog].slice(-200)); // Mantém mais logs no histórico global
      } catch (e) {
        console.error("Failed to parse log message", e);
      }
    };

    socket.onopen = () => console.log("WebSocket Connected");
    socket.onclose = () => {
      console.log("WebSocket Disconnected, retrying in 5s...");
      setTimeout(() => {
         // Lógica simples de reconexão poderia ser adicionada aqui
      }, 5000);
    };

    socketRef.current = socket;

    // Ouve eventos de status do bot para limpar logs ao reiniciar
    const chatSocket = new WebSocket(`${protocol}//${host}/ws/chat`);
    chatSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Quando o bot inicia (STARTING), limpa os logs ao vivo para nova sessão
        if (data.type === 'BOT_STATUS' && data.status === 'STARTING') {
          setLogs([]);
          console.log('[LogProvider] Bot reiniciado - logs ao vivo limpos.');
        }
      } catch (e) {}
    };

    return () => {
      socket.close();
      chatSocket.close();
    };
  }, []);

  const clearLogs = () => setLogs([]);

  return (
    <LogContext.Provider value={{ logs, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLogs() {
  const context = useContext(LogContext);
  if (context === undefined) {
    throw new Error('useLogs must be used within a LogProvider');
  }
  return context;
}
