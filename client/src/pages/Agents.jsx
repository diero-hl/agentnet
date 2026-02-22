import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';
import { Search, Bot, RefreshCw, ExternalLink, Copy } from 'lucide-react';

export function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [capFilter, setCapFilter] = useState('');
  const [allCaps, setAllCaps] = useState([]);

  const load = () => {
    const params = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (capFilter) params.capability = capFilter;
    api.agents.list(params).then(setAgents).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => { api.agents.stats().then(s => setAllCaps(s.topCapabilities || [])).catch(() => {}); }, []);

  const wsCallback = useCallback((event) => {
    if (event.type === 'agent') load();
  }, []);
  useWebSocket(wsCallback);

  const handleSearch = (e) => {
    e.preventDefault();
    load();
  };

  const copyWallet = (addr) => {
    navigator.clipboard.writeText(addr).catch(() => {});
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Agent Directory</h1>
          <p>Registered agents on the A2A network with Base Mainnet wallets</p>
        </div>
      </div>

      <form className="search-bar" onSubmit={handleSearch}>
        <input
          placeholder="Search agents by name or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={capFilter} onChange={e => setCapFilter(e.target.value)}>
          <option value="">All Capabilities</option>
          {allCaps.map(c => <option key={c.cap} value={c.cap}>{c.cap} ({c.count})</option>)}
        </select>
        <button className="btn btn-primary" type="submit"><Search size={14} /> Search</button>
      </form>

      {loading ? (
        <div className="loading">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Bot size={28} /></div>
            <h3>No Agents Registered</h3>
            <p>Use the CLI to register your first agent.</p>
            <code style={{display:'block',marginTop:12,padding:'8px 12px',background:'var(--bg-dark)',borderRadius:6,fontSize:13,color:'var(--accent-primary)'}}>
              node cli/agent-cli.js init
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
                  <th>Name</th>
                  <th>Wallet</th>
                  <th>Capabilities</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => (
                  <tr key={agent.id}>
                    <td>#{agent.id}</td>
                    <td>
                      <strong>{agent.name}</strong>
                      {agent.description && <><br/><span style={{fontSize: 12, color: 'var(--text-muted)'}}>{agent.description}</span></>}
                    </td>
                    <td>
                      {agent.wallet_address ? (
                        <span style={{display:'flex',alignItems:'center',gap:4}}>
                          <a
                            href={`https://basescan.org/address/${agent.wallet_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="wallet-addr"
                            style={{color:'var(--accent-primary)',textDecoration:'none',fontSize:13,fontFamily:'monospace'}}
                            title={agent.wallet_address}
                          >
                            {agent.wallet_address.slice(0, 6)}...{agent.wallet_address.slice(-4)}
                          </a>
                          <ExternalLink size={11} style={{color:'var(--text-muted)',flexShrink:0}} />
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {(agent.capabilities || []).length > 0
                        ? agent.capabilities.map(c => <span key={c} className="capability-tag">{c}</span>)
                        : <span style={{color:'var(--text-muted)',fontSize:12}}>none</span>
                      }
                    </td>
                    <td style={{fontSize:12,color:'var(--text-muted)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {agent.endpoint_url || '-'}
                    </td>
                    <td><span className={`badge badge-${agent.status}`}>{agent.status}</span></td>
                    <td style={{fontSize: 12, color: 'var(--text-muted)', whiteSpace:'nowrap'}}>
                      {new Date(agent.created_at).toLocaleString()}
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
