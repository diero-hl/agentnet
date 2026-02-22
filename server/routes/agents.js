const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { hashToken, generateApiKey, extractApiKey, verifyApiKey } = require('../auth');

router.get('/', async (req, res) => {
  try {
    const { capability, search, status } = req.query;
    let query = 'SELECT id, name, wallet_address, capabilities, status, description, endpoint_url, created_at, updated_at FROM agents';
    const conditions = [];
    const params = [];

    if (capability) {
      params.push(capability);
      conditions.push(`$${params.length} = ANY(capabilities)`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM agents');
    const active = await pool.query("SELECT COUNT(*) as count FROM agents WHERE status = 'active'");
    const capabilities = await pool.query('SELECT UNNEST(capabilities) as cap, COUNT(*) as count FROM agents GROUP BY cap ORDER BY count DESC LIMIT 10');
    res.json({
      total: parseInt(total.rows[0].count),
      active: parseInt(active.rows[0].count),
      topCapabilities: capabilities.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, wallet_address, capabilities, status, description, endpoint_url, created_at, updated_at FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/key', async (req, res) => {
  try {
    const apiKey = extractApiKey(req);
    const verified = await verifyApiKey(req.params.id, apiKey);

    if (!verified) {
      return res.status(401).json({
        error: 'Unauthorized. Provide your API key to access wallet private key.',
        hint: 'Use --key <your_api_key> in CLI or Authorization: Bearer <key> header'
      });
    }

    const result = await pool.query(
      'SELECT encrypted_private_key FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const encKey = result.rows[0].encrypted_private_key;
    if (!encKey) return res.json({ private_key: null });

    const privateKey = decrypt(encKey);
    res.json({ private_key: privateKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, wallet_address, capabilities, description, endpoint_url, private_key } = req.body;

    let encryptedKey = null;
    if (private_key) {
      encryptedKey = encrypt(private_key);
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashToken(apiKey);

    const result = await pool.query(
      `INSERT INTO agents (name, wallet_address, capabilities, description, endpoint_url, encrypted_private_key, auth_token_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, wallet_address, capabilities, status, description, endpoint_url, created_at, updated_at`,
      [name, wallet_address, capabilities || [], description || '', endpoint_url || '', encryptedKey, apiKeyHash]
    );
    await pool.query(
      `INSERT INTO reputation (agent_id) VALUES ($1) ON CONFLICT (agent_id) DO NOTHING`,
      [result.rows[0].id]
    );

    const agent = result.rows[0];
    agent.api_key = apiKey;
    req.app.locals.broadcast?.({ type: 'agent', action: 'created', data: { id: agent.id, name: agent.name } });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const apiKey = extractApiKey(req);
    const verified = await verifyApiKey(req.params.id, apiKey);

    if (!verified) {
      return res.status(401).json({
        error: 'Unauthorized. Provide your API key to update this agent.',
        hint: 'Use --key <your_api_key> in CLI or Authorization: Bearer <key> header'
      });
    }

    const { name, capabilities, status, description, endpoint_url } = req.body;
    const result = await pool.query(
      `UPDATE agents SET
        name = COALESCE($1, name),
        capabilities = COALESCE($2, capabilities),
        status = COALESCE($3, status),
        description = COALESCE($4, description),
        endpoint_url = COALESCE($5, endpoint_url),
        updated_at = NOW()
       WHERE id = $6 RETURNING id, name, wallet_address, capabilities, status, description, endpoint_url, created_at, updated_at`,
      [name, capabilities, status, description, endpoint_url, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    req.app.locals.broadcast?.({ type: 'agent', action: 'updated', data: result.rows[0] });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
