import { useCallback, useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { ToastContext, ToastItem } from './toast-context';

function ToastItemComponent({
  toast,
  onRemove,
}: {
  toast: ToastItem;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    if (toast.duration === null || toast.duration === 0) return;
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const iconMap = {
    success: (
      <CheckCircle className="mesoor-toast-icon mesoor-toast-icon-green" />
    ),
    error: <AlertCircle className="mesoor-toast-icon mesoor-toast-icon-red" />,
    warning: (
      <AlertTriangle className="mesoor-toast-icon mesoor-toast-icon-orange" />
    ),
    info: <Info className="mesoor-toast-icon mesoor-toast-icon-blue" />,
  };

  const typeClass = toast.type ?? 'info';

  return (
    <div className={`mesoor-toast-item mesoor-toast-${typeClass}`}>
      <div className="mesoor-toast-content">
        {iconMap[typeClass]}
        <div className="mesoor-toast-body">
          {toast.title && (
            <div className="mesoor-toast-title">{toast.title}</div>
          )}
          <div className="mesoor-toast-message">{toast.message}</div>
        </div>
      </div>
      <button className="mesoor-toast-close" onClick={() => onRemove(toast.id)}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="mesoor-toast-container">
        {toasts.map(t => (
          <ToastItemComponent key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
