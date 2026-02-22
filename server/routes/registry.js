const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { extractApiKey, verifyApiKey } = require('../auth');

const REQUIRED_AGENT_CARD_FIELDS = ['name', 'description', 'url', 'capabilities'];

function validateAgentCard(card) {
  if (!card || typeof card !== 'object') {
    return { valid: false, error: 'agent_card must be a JSON object' };
  }
  const missing = REQUIRED_AGENT_CARD_FIELDS.filter(f => !card[f]);
  if (missing.length > 0) {
    return { valid: false, error: `agent_card missing required fields: ${missing.join(', ')}` };
  }
  if (card.capabilities && !Array.isArray(card.capabilities)) {
    return { valid: false, error: 'agent_card.capabilities must be an array' };
  }
  if (card.capabilities) {
    for (const cap of card.capabilities) {
      if (!cap.name || !cap.description) {
        return { valid: false, error: 'Each capability must have name and description' };
      }
    }
  }
  return { valid: true };
}

router.get('/', async (req, res) => {
  try {
    const { chain_id, has_nft } = req.query;
    let query = `SELECT reg.*, a.name as agent_name, a.wallet_address, a.capabilities, a.status
       FROM registry reg
       JOIN agents a ON reg.agent_id = a.id`;
    const conditions = [];
    const params = [];

    if (chain_id) {
      params.push(chain_id);
      conditions.push(`reg.chain_id = $${params.length}`);
    }
    if (has_nft === 'true') {
      conditions.push(`reg.nft_token_id IS NOT NULL`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY reg.registered_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:agentId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT reg.*, a.name as agent_name, a.wallet_address, a.capabilities, a.status
       FROM registry reg
       JOIN agents a ON reg.agent_id = a.id
       WHERE reg.agent_id = $1`, [req.params.agentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registry entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { agent_id, nft_token_id, metadata, onchain_ref, agent_card, chain_id, contract_address } = req.body;

    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required to register in the identity registry' });
    }
    const valid = await verifyApiKey(parseInt(agent_id), apiKey);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid API key for this agent' });
    }

    if (agent_card) {
      const validation = validateAgentCard(agent_card);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    const result = await pool.query(
      `INSERT INTO registry (agent_id, nft_token_id, metadata, onchain_ref, agent_card, chain_id, contract_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (agent_id) DO UPDATE SET
         nft_token_id = COALESCE($2, registry.nft_token_id),
         metadata = COALESCE($3, registry.metadata),
         onchain_ref = COALESCE($4, registry.onchain_ref),
         agent_card = COALESCE($5, registry.agent_card),
         chain_id = COALESCE($6, registry.chain_id),
         contract_address = COALESCE($7, registry.contract_address),
         updated_at = NOW()
       RETURNING *`,
      [agent_id, nft_token_id, JSON.stringify(metadata || {}), onchain_ref, agent_card ? JSON.stringify(agent_card) : null, chain_id || 'base', contract_address || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:agentId/resolve', async (req, res) => {
  try {
    const entry = await pool.query(
      `SELECT reg.*, a.name as agent_name, a.wallet_address
       FROM registry reg
       JOIN agents a ON reg.agent_id = a.id
       WHERE reg.agent_id = $1`, [req.params.agentId]
    );
    if (entry.rows.length === 0) return res.status(404).json({ error: 'Agent not in registry' });

    const reg = entry.rows[0];
    const resolution = {
      agent_id: reg.agent_id,
      agent_name: reg.agent_name,
      wallet_address: reg.wallet_address,
      chain_id: reg.chain_id,
      registry_id: reg.id,
      registered_at: reg.registered_at,
      identity: {
        nft_token_id: reg.nft_token_id,
        contract_address: reg.contract_address,
        onchain_ref: reg.onchain_ref,
      },
      agent_card: reg.agent_card,
      metadata: reg.metadata,
    };

    if (reg.nft_token_id && reg.contract_address) {
      try {
        const { createPublicClient, http } = await import('viem');
        const { base } = await import('viem/chains');
        const rpc = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
        const client = createPublicClient({ chain: base, transport: http(rpc) });

        const owner = await client.readContract({
          address: reg.contract_address,
          abi: [{ inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'ownerOf', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' }],
          functionName: 'ownerOf',
          args: [BigInt(reg.nft_token_id)]
        });

        resolution.onchain_verification = {
          nft_owner: owner,
          matches_wallet: owner.toLowerCase() === reg.wallet_address.toLowerCase(),
          verified_at: new Date().toISOString(),
          chain: 'Base Mainnet',
        };
      } catch (err) {
        resolution.onchain_verification = {
          error: 'Could not verify on-chain: ' + err.message,
          verified_at: new Date().toISOString(),
        };
      }
    }

    res.json(resolution);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
