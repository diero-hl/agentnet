import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';
import { ListTodo, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

function ResultView({ result }) {
  if (!result || typeof result !== 'object') return <span style={{color:'var(--t3)'}}>-</span>;

  const entries = Object.entries(result).filter(([k]) =>
    !['status', 'executedAt', 'duration_ms', 'input'].includes(k)
  );

  if (entries.length === 0) return <span style={{color:'var(--t3)'}}>-</span>;

  return (
    <div style={{fontSize: 12, lineHeight: 1.7}}>
      {entries.map(([key, val]) => {
        if (val === null || val === undefined) return null;
        const label = key.replace(/_/g, ' ');
        if (typeof val === 'object' && !Array.isArray(val)) {
          return (
            <div key={key} style={{marginBottom: 4}}>
              <span style={{color:'var(--t3)', textTransform:'capitalize'}}>{label}:</span>
              {Object.entries(val).map(([k2, v2]) => (
                <div key={k2} style={{paddingLeft: 12}}>
                  <span style={{color:'var(--t3)'}}>{k2.replace(/_/g, ' ')}:</span>{' '}
                  <span style={{color:'var(--t1)'}}>{typeof v2 === 'object' ? JSON.stringify(v2) : String(v2)}</span>
                </div>
              ))}
            </div>
          );
        }
        if (Array.isArray(val)) {
          return (
            <div key={key}>
              <span style={{color:'var(--t3)', textTransform:'capitalize'}}>{label}:</span>{' '}
              <span style={{color:'var(--t1)'}}>{val.join(', ')}</span>
            </div>
          );
        }
        const isLink = typeof val === 'string' && val.startsWith('http');
        return (
          <div key={key}>
            <span style={{color:'var(--t3)', textTransform:'capitalize'}}>{label}:</span>{' '}
            {isLink ? (
              <a href={val} target="_blank" rel="noopener noreferrer" style={{color:'var(--acc2)', textDecoration:'none'}}>
                {val.length > 50 ? val.slice(0, 50) + '...' : val} <ExternalLink size={10} style={{verticalAlign:'middle'}} />
              </a>
            ) : (
              <span style={{color: val === true ? 'var(--grn)' : val === false ? 'var(--red, #e53e3e)' : 'var(--t1)'}}>
                {String(val)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({ task }) {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = (status) => {
    if (status === 'completed') return <CheckCircle size={14} style={{color: 'var(--grn)'}} />;
    if (status === 'pending') return <Clock size={14} style={{color: 'var(--org)'}} />;
    if (status === 'in_progress') return <Clock size={14} style={{color: 'var(--acc)'}} />;
    return <XCircle size={14} style={{color: 'var(--red, #e53e3e)'}} />;
  };

  const hasResult = task.result && typeof task.result === 'object' && Object.keys(task.result).length > 2;
  const inputVal = task.payload?.input || task.result?.input || '';
  const summaryOutput = task.result?.chain
    ? `${task.result.chain} — ${task.result.address || task.result.block_number || task.result.tx_hash || 'executed'}`
    : task.result?.output || task.result?.error || '-';

  return (
    <>
      <tr style={{cursor: hasResult ? 'pointer' : 'default'}} onClick={() => hasResult && setExpanded(!expanded)}>
        <td>#{task.id}</td>
        <td><strong>{task.task_type}</strong></td>
        <td style={{fontSize:12, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {inputVal ? (
            <span title={inputVal} style={{fontFamily:'monospace', color:'var(--org)'}}>
              {inputVal.length > 16 ? inputVal.slice(0, 8) + '...' + inputVal.slice(-4) : inputVal}
            </span>
          ) : <span style={{color:'var(--t3)'}}>-</span>}
        </td>
        <td>{task.requester_name || '-'}</td>
        <td>{task.target_name || '-'}</td>
        <td>
          {task.payload?.max_price
            ? <span>{task.payload.max_price} USDC</span>
            : <span style={{color:'var(--t3)'}}>-</span>
          }
        </td>
        <td>
          <span style={{display:'flex',alignItems:'center',gap:4}}>
            {getStatusIcon(task.status)}
            <span className={`badge badge-${task.status}`}>{task.status}</span>
          </span>
        </td>
        <td style={{fontSize:12, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {summaryOutput}
        </td>
        <td>
          {task.proof_hash ? (
            <span title={task.proof_hash} style={{fontSize:11, fontFamily:'monospace', color:'var(--t2)'}}>
              {task.proof_hash.slice(0, 10)}...
            </span>
          ) : '-'}
        </td>
        <td style={{fontSize: 12, color: 'var(--t3)', whiteSpace:'nowrap'}}>
          {new Date(task.created_at).toLocaleString()}
        </td>
        <td style={{width: 24}}>
          {hasResult && (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </td>
      </tr>
      {expanded && hasResult && (
        <tr>
          <td colSpan={11} style={{padding: '12px 20px', background:'rgba(91,91,240,0.03)', borderTop:'none'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 24}}>
              <div>
                <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:1, color:'var(--t3)', marginBottom:6, fontWeight:600}}>Input</div>
                <div style={{fontFamily:'monospace', fontSize:13, color:'var(--t1)', wordBreak:'break-all', padding:'8px 12px', background:'var(--bg)', borderRadius:6, border:'1px solid var(--border)'}}>
                  {inputVal || '(default)'}
                </div>
              </div>
              <div>
                <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:1, color:'var(--t3)', marginBottom:6, fontWeight:600}}>
                  Output — Real Blockchain Data
                  {task.result?.executedAt && (
                    <span style={{marginLeft:8, fontWeight:400, textTransform:'none', letterSpacing:0}}>
                      {new Date(task.result.executedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div style={{padding:'8px 12px', background:'var(--bg)', borderRadius:6, border:'1px solid var(--border)'}}>
                  <ResultView result={task.result} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    Promise.all([
      api.tasks.list(params),
      api.tasks.stats()
    ]).then(([taskList, taskStats]) => {
      setTasks(taskList);
      setStats(taskStats);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [statusFilter]);

  const wsCallback = useCallback((event) => {
    if (event.type === 'task') load();
  }, []);
  useWebSocket(wsCallback);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Task History</h1>
          <p>Agent-to-agent task requests with real blockchain data results</p>
        </div>
      </div>

      {stats && stats.total > 0 && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Tasks</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          {stats.byStatus.map(s => (
            <div className="stat-card" key={s.status}>
              <div className="stat-label">{s.status}</div>
              <div className="stat-value">{s.count}</div>
            </div>
          ))}
        </div>
      )}

      <div className="search-bar">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><ListTodo size={28} /></div>
            <h3>No Tasks Yet</h3>
            <p>Use the CLI to create task requests with real blockchain data.</p>
            <code style={{display:'block',marginTop:12,padding:'10px 14px',background:'var(--bg)',borderRadius:6,fontSize:12,color:'var(--acc2)',lineHeight:1.8,textAlign:'left',maxWidth:520}}>
              {`node cli/agent-cli.js request contract_analysis \\
  --from 1 --to 2 --key <api_key> \\
  --input 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`}
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
                  <th>Type</th>
                  <th>Input</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Output</th>
                  <th>Proof</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => <TaskRow key={task.id} task={task} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
