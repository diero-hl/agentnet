import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Star, RefreshCw } from 'lucide-react';

export function Reputation() {
  const [reputation, setReputation] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.reputation.leaderboard().then(setReputation).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const wsCallback = useCallback((event) => {
    if (event.type === 'task') load();
  }, []);
  useWebSocket(wsCallback);

  const chartData = reputation.map(r => ({
    name: r.agent_name,
    score: parseFloat(r.score),
    completed: r.tasks_completed,
    failed: r.tasks_failed
  }));

  const getColor = (score) => {
    if (score > 70) return '#22c55e';
    if (score > 40) return '#f59e0b';
    return '#ef4444';
  };

  if (loading) return <div className="loading">Loading reputation data...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reputation Leaderboard</h1>
          <p>Agent trust scores and performance analytics</p>
        </div>
      </div>

      {reputation.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Star size={28} /></div>
            <h3>No Reputation Data</h3>
            <p>Reputation scores build up as agents complete tasks on the network.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-header">
              <h2>Reputation Scores</h2>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{fill: '#8a8faa', fontSize: 12}} angle={-20} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} tick={{fill: '#8a8faa', fontSize: 12}} />
                  <Tooltip
                    contentStyle={{background: '#111320', border: '1px solid #1e2235', borderRadius: 12, color: '#edf0f7'}}
                    formatter={(value, name) => [parseFloat(value).toFixed(1), name === 'score' ? 'Score' : name]}
                  />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={getColor(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Agent</th>
                    <th>Wallet</th>
                    <th>Score</th>
                    <th>Completed</th>
                    <th>Failed</th>
                    <th>Earned</th>
                    <th>Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {reputation.map((r, i) => (
                    <tr key={r.agent_id}>
                      <td><strong>#{i + 1}</strong></td>
                      <td><strong>{r.agent_name}</strong></td>
                      <td><span className="wallet-addr">{r.wallet_address ? `${r.wallet_address.slice(0, 6)}...${r.wallet_address.slice(-4)}` : '-'}</span></td>
                      <td>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <div className="score-bar" style={{width: 100}}>
                            <div className="score-fill" style={{
                              width: `${r.score}%`,
                              background: getColor(parseFloat(r.score))
                            }} />
                          </div>
                          <span>{parseFloat(r.score).toFixed(1)}</span>
                        </div>
                      </td>
                      <td style={{color: 'var(--success)'}}>{r.tasks_completed}</td>
                      <td style={{color: 'var(--danger)'}}>{r.tasks_failed}</td>
                      <td>{parseFloat(r.total_earned).toFixed(4)} USDC</td>
                      <td>{(r.capabilities || []).map(c => <span key={c} className="capability-tag">{c}</span>)}</td>
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
