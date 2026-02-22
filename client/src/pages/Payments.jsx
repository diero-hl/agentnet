import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';
import { Wallet, ExternalLink, RefreshCw, CheckCircle, Clock, XCircle, ArrowUpRight } from 'lucide-react';

export function Payments() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.payments.list(),
      api.payments.stats()
    ]).then(([paymentList, paymentStats]) => {
      setPayments(paymentList);
      setStats(paymentStats);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const wsCallback = useCallback((event) => {
    if (event.type === 'payment' || event.type === 'task') load();
  }, []);
  useWebSocket(wsCallback);

  const getStatusIcon = (status) => {
    if (status === 'verified') return <CheckCircle size={14} style={{color: 'var(--accent-green)'}} />;
    if (status === 'pending') return <Clock size={14} style={{color: 'var(--accent-yellow, #f0b429)'}} />;
    return <XCircle size={14} style={{color: 'var(--accent-red, #e53e3e)'}} />;
  };

  const getMethodBadge = (method) => {
    if (method === 'x402') return <span className="badge badge-completed">x402</span>;
    if (method === 'insufficient_funds') return <span className="badge badge-failed">No Funds</span>;
    if (method === 'x402_processed') return <span className="badge badge-pending">Processed</span>;
    return <span className="badge">{method || '-'}</span>;
  };

  const truncateHash = (hash) => {
    if (!hash) return null;
    return hash.slice(0, 6) + '...' + hash.slice(-4);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>x402 Payments</h1>
          <p>Real USDC micro-payments on Base Mainnet via x402 protocol</p>
        </div>
      </div>

      {stats && stats.total > 0 && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Payments</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Volume</div>
            <div className="stat-value">{parseFloat(stats.totalAmount).toFixed(4)}</div>
            <div className="stat-sub">USDC</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Verified</div>
            <div className="stat-value">{stats.byStatus?.find(s => s.status === 'verified')?.count || 0}</div>
            <div className="stat-sub">on-chain confirmed</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Network</div>
            <div className="stat-value" style={{fontSize: 18}}>Base Mainnet</div>
            <div className="stat-sub">eip155:8453</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading payments...</div>
      ) : payments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Wallet size={28} /></div>
            <h3>No Payments Yet</h3>
            <p>Use the CLI to request tasks between agents. Real USDC payments will appear here.</p>
            <code style={{display:'block',marginTop:12,padding:'8px 12px',background:'var(--bg-dark)',borderRadius:6,fontSize:13,color:'var(--accent-primary)'}}>
              node cli/agent-cli.js request data-analysis --from 1 --to 2 --max-price 0.001
            </code>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Task</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Tx Hash</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td>Task #{p.task_id}</td>
                    <td>{p.from_agent_name || '-'}</td>
                    <td>{p.to_agent_name || '-'}</td>
                    <td><strong>{parseFloat(p.amount).toFixed(4)}</strong> USDC</td>
                    <td>{getMethodBadge(p.payment_method)}</td>
                    <td>
                      <span style={{display:'flex',alignItems:'center',gap:4}}>
                        {getStatusIcon(p.status)}
                        <span className={`badge badge-${p.status}`}>{p.status}</span>
                      </span>
                    </td>
                    <td>
                      {(p.tx_hash || p.tx_ref) ? (
                        <a
                          href={`https://basescan.org/tx/${p.tx_hash || p.tx_ref}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{display:'flex',alignItems:'center',gap:4,color:'var(--accent-primary)',textDecoration:'none',fontSize:13}}
                          title={p.tx_hash || p.tx_ref}
                        >
                          {truncateHash(p.tx_hash || p.tx_ref)}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{color:'var(--text-muted)',fontSize:13}}>-</span>
                      )}
                    </td>
                    <td style={{fontSize: 12, color: 'var(--text-muted)', whiteSpace:'nowrap'}}>
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
