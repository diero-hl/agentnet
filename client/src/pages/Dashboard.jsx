import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';
import { Bot, ListTodo, Wallet, MessageSquare, TrendingUp, Activity, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const wsCallback = useCallback((event) => {
    api.dashboard().then(setData).catch(console.error);
  }, []);
  useWebSocket(wsCallback);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!data) return <div className="empty-state"><p>Failed to load dashboard data</p></div>;

  const hasData = data.agents.total > 0 || data.tasks.total > 0;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>A2A Agent Network Overview</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label"><Bot size={14} style={{marginRight: 6}} />Agents</div>
          <div className="stat-value">{data.agents.total}</div>
          <div className="stat-sub">{data.agents.active} active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><ListTodo size={14} style={{marginRight: 6}} />Tasks</div>
          <div className="stat-value">{data.tasks.total}</div>
          <div className="stat-sub">{data.tasks.completed} completed, {data.tasks.pending} pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Wallet size={14} style={{marginRight: 6}} />Payments</div>
          <div className="stat-value">{data.payments.total}</div>
          <div className="stat-sub">{parseFloat(data.payments.totalAmount).toFixed(4)} USDC total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><MessageSquare size={14} style={{marginRight: 6}} />XMTP Messages</div>
          <div className="stat-value">{data.messages.total}</div>
          <div className="stat-sub">Encrypted A2A messages</div>
        </div>
      </div>

      <div className="grid-2" style={{marginBottom: 12}}>
        <div className="card">
          <div className="card-header"><h2>Task Activity</h2></div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.tasks.recentActivity || []}>
                <defs>
                  <linearGradient id="taskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5b5bf0" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#5b5bf0" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#55556a'}} tickFormatter={v => v?.slice(5)} />
                <YAxis tick={{fontSize: 10, fill: '#55556a'}} allowDecimals={false} />
                <Tooltip contentStyle={{background: '#0f0f18', border: '1px solid #1c1c2e', borderRadius: 8, fontSize: 12}} />
                <Area type="monotone" dataKey="count" stroke="#5b5bf0" fill="url(#taskGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2>Payment Volume</h2></div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.payments.recentActivity || []}>
                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#55556a'}} tickFormatter={v => v?.slice(5)} />
                <YAxis tick={{fontSize: 10, fill: '#55556a'}} allowDecimals={false} />
                <Tooltip contentStyle={{background: '#0f0f18', border: '1px solid #1c1c2e', borderRadius: 8, fontSize: 12}} />
                <Bar dataKey="count" fill="#00d47b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Activity size={28} />
            </div>
            <h3>Network is Ready</h3>
            <p>No agents registered yet. Use the CLI or API to register your first agent and start sending tasks.</p>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2><Zap size={16} style={{marginRight: 8}} />Recent Tasks</h2>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTasks.length > 0 ? data.recentTasks.map(task => (
                    <tr key={task.id}>
                      <td>{task.task_type}</td>
                      <td>{task.requester_name}</td>
                      <td>{task.target_name}</td>
                      <td><span className={`badge badge-${task.status}`}>{task.status}</span></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} style={{textAlign: 'center', color: 'var(--text-muted)', padding: 30}}>No tasks yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2><TrendingUp size={16} style={{marginRight: 8}} />Top Agents</h2>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Score</th>
                    <th>Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topAgents.length > 0 ? data.topAgents.map(agent => (
                    <tr key={agent.agent_id}>
                      <td><strong>{agent.agent_name}</strong></td>
                      <td>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <div className="score-bar" style={{width: 80}}>
                            <div className="score-fill" style={{
                              width: `${agent.score}%`,
                              background: agent.score > 70 ? 'var(--success)' : agent.score > 40 ? 'var(--warning)' : 'var(--danger)'
                            }} />
                          </div>
                          <span style={{fontSize: 13}}>{parseFloat(agent.score).toFixed(1)}</span>
                        </div>
                      </td>
                      <td>{agent.tasks_completed}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} style={{textAlign: 'center', color: 'var(--text-muted)', padding: 30}}>No reputation data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
