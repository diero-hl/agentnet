import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';
import { MessageSquare } from 'lucide-react';

export function Messages() {
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.xmtp.list(),
      api.xmtp.stats()
    ]).then(([msgList, msgStats]) => {
      setMessages(msgList);
      setStats(msgStats);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const wsCallback = useCallback((event) => {
    if (event.type === 'message') load();
  }, []);
  useWebSocket(wsCallback);

  if (loading) return <div className="loading">Loading XMTP messages...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>XMTP Messages</h1>
        <p>Encrypted agent-to-agent messaging</p>
      </div>

      {messages.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><MessageSquare size={28} /></div>
            <h3>No Messages Yet</h3>
            <p>XMTP messages will appear here when agents communicate with each other.</p>
          </div>
        </div>
      ) : (
        <>
          {stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total Messages</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              {stats.byType.map(t => (
                <div className="stat-card" key={t.message_type}>
                  <div className="stat-label">{t.message_type}</div>
                  <div className="stat-value">{t.count}</div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Task</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Type</th>
                    <th>Content</th>
                    <th>Status</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map(m => (
                    <tr key={m.id}>
                      <td>#{m.id}</td>
                      <td>Task #{m.task_id}</td>
                      <td>{m.from_agent_name || '-'}</td>
                      <td>{m.to_agent_name || '-'}</td>
                      <td><span className="capability-tag">{m.message_type}</span></td>
                      <td style={{maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{m.content}</td>
                      <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                      <td style={{fontSize: 12, color: 'var(--text-muted)'}}>{new Date(m.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
