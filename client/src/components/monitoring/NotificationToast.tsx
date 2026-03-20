import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { useEffect } from "react";

export interface NotificationData {
  id: string;
  senderName: string;
  message: string;
  time: string;
}

interface NotificationToastProps {
  notification: NotificationData | null;
  onDismiss: () => void;
  onClickNotification?: (id: string) => void;
}

export default function NotificationToast({ notification, onDismiss, onClickNotification }: NotificationToastProps) {
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss]);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="fixed top-4 right-4 z-50 max-w-sm"
        >
          <div
            onClick={() => onClickNotification?.(notification.id)}
            className="flex items-start gap-3 p-4 rounded-xl bg-white border border-zinc-100 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
          >
            {/* Ícone animado */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <MessageCircle size={18} className="text-red-600" />
              </div>
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900">
                  {notification.senderName}
                </span>
                <span className="text-[10px] text-zinc-400 ml-2">
                  {notification.time}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                {notification.message}
              </p>
              <span className="text-[10px] text-red-600 font-medium mt-1 block">
                Nova mensagem via WhatsApp
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors"
            >
              <X size={10} className="text-zinc-500" />
            </button>
          </div>

          {/* Barra de progresso de auto-dismiss */}
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 5, ease: "linear" }}
            className="h-0.5 rounded-full mt-0.5 origin-left"
            style={{ background: "linear-gradient(90deg, #7f1d1d, #dc2626)" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
