import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../useWebSocket';

const LABELS = {
  agent: { created: 'New agent registered', updated: 'Agent updated' },
  task: { created: 'New task created', updated: 'Task status changed' },
  message: { created: 'New XMTP message' },
  payment: { created: 'New payment recorded' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg) => {
    const id = Date.now();
    setToasts(prev => [...prev.slice(-4), { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const wsCallback = useCallback((event) => {
    const label = LABELS[event.type]?.[event.action];
    if (label) addToast(label);
  }, [addToast]);
  useWebSocket(wsCallback);

  return (
    <>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-item">{t.msg}</div>
        ))}
      </div>
    </>
  );
}
