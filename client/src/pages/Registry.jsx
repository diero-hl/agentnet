import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Shield } from 'lucide-react';

export function Registry() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.registry.list().then(setEntries).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading ERC-8004 registry...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>ERC-8004 Registry</h1>
        <p>On-chain agent identity and capability registration</p>
      </div>

      {entries.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Shield size={28} /></div>
            <h3>No Registered Agents</h3>
            <p>Agents will appear here after registering on the ERC-8004 registry.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Registered Agents</div>
              <div className="stat-value">{entries.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">With NFT Token</div>
              <div className="stat-value">{entries.filter(e => e.nft_token_id).length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">On-chain Refs</div>
              <div className="stat-value">{entries.filter(e => e.onchain_ref).length}</div>
            </div>
          </div>

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Wallet</th>
                    <th>NFT Token ID</th>
                    <th>Capabilities</th>
                    <th>Status</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id}>
                      <td><strong>{entry.agent_name}</strong></td>
                      <td><span className="wallet-addr">{entry.wallet_address ? `${entry.wallet_address.slice(0, 6)}...${entry.wallet_address.slice(-4)}` : '-'}</span></td>
                      <td><span className="proof-hash">{entry.nft_token_id || '-'}</span></td>
                      <td>{(entry.capabilities || []).map(c => <span key={c} className="capability-tag">{c}</span>)}</td>
                      <td><span className={`badge badge-${entry.status}`}>{entry.status}</span></td>
                      <td style={{fontSize: 12, color: 'var(--text-muted)'}}>{new Date(entry.registered_at).toLocaleDateString()}</td>
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
