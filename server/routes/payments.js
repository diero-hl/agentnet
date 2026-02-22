const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

router.get('/', async (req, res) => {
  try {
    const { status, agent_id } = req.query;
    let query = `SELECT p.*, 
      fa.name as from_agent_name, ta.name as to_agent_name
      FROM payments p
      LEFT JOIN agents fa ON p.from_agent_id = fa.id
      LEFT JOIN agents ta ON p.to_agent_id = ta.id`;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (agent_id) {
      params.push(parseInt(agent_id));
      conditions.push(`(p.from_agent_id = $${params.length} OR p.to_agent_id = $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM payments');
    const byStatus = await pool.query('SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments GROUP BY status');
    const recent = await pool.query('SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE created_at > NOW() - INTERVAL \'30 days\' GROUP BY DATE(created_at) ORDER BY date');
    res.json({
      total: parseInt(total.rows[0].count),
      totalAmount: parseFloat(total.rows[0].total_amount),
      byStatus: byStatus.rows,
      recentActivity: recent.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { task_id, from_agent_id, to_agent_id, amount, currency, tx_hash, network, payment_method,
            permit_signature, permit_deadline, permit_nonce, permit_v, permit_r, permit_s } = req.body;

    if (permit_signature) {
      const dup = await pool.query(
        `SELECT id, status FROM payments WHERE permit_signature = $1 AND status = 'verified'`,
        [permit_signature]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: `Duplicate permit — this signature was already verified (payment #${dup.rows[0].id})` });
      }
    }

    const status = payment_method === 'gasless_permit' ? 'signed' : 'pending';

    const result = await pool.query(
      `INSERT INTO payments (task_id, from_agent_id, to_agent_id, amount, currency, tx_hash, network, payment_method, status,
       permit_signature, permit_deadline, permit_nonce, permit_v, permit_r, permit_s)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [task_id, from_agent_id, to_agent_id, amount, currency || 'USDC', tx_hash || null, network || 'base',
       payment_method || 'x402', status,
       permit_signature || null, permit_deadline || null, permit_nonce || null,
       permit_v || null, permit_r || null, permit_s || null]
    );

    req.app.locals.broadcast?.({ type: 'payment', action: 'created', data: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/permit/verify', async (req, res) => {
  try {
    const { owner, spender, value, deadline, v, r, s, from_agent_id } = req.body;

    if (!owner || !spender || !value || !deadline || v === undefined || !r || !s) {
      return res.status(400).json({ error: 'Missing permit parameters' });
    }

    const agent = await pool.query('SELECT wallet_address FROM agents WHERE id = $1', [from_agent_id]);
    if (agent.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    if (agent.rows[0].wallet_address.toLowerCase() !== owner.toLowerCase()) {
      return res.status(403).json({ error: 'Permit owner does not match agent wallet' });
    }

    const fullSig = `0x${r.slice(2)}${s.slice(2)}${v.toString(16).padStart(2, '0')}`;
    const existing = await pool.query(
      `SELECT id, status FROM payments WHERE permit_signature = $1 AND status = 'verified'`,
      [fullSig]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Duplicate permit — this signature was already verified (payment #${existing.rows[0].id})` });
    }

    const { createPublicClient, http, verifyTypedData } = await import('viem');
    const { base } = await import('viem/chains');
    const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });

    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: BASE_CHAIN_ID,
      verifyingContract: USDC_BASE,
    };
    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const onChainNonce = await client.readContract({
      address: USDC_BASE,
      abi: [{ inputs: [{ name: 'owner', type: 'address' }], name: 'nonces', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'nonces',
      args: [owner]
    });

    const signature = `0x${r.slice(2)}${s.slice(2)}${v.toString(16).padStart(2, '0')}`;
    const message = {
      owner,
      spender,
      value: BigInt(value),
      nonce: onChainNonce,
      deadline: BigInt(deadline),
    };

    const recoveredValid = await verifyTypedData({
      address: owner,
      domain,
      types,
      primaryType: 'Permit',
      message,
      signature,
    });

    if (!recoveredValid) {
      return res.status(403).json({ error: 'Invalid permit signature — EIP-712 verification failed' });
    }

    const [balanceData] = await Promise.all([
      client.readContract({
        address: USDC_BASE,
        abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
        functionName: 'balanceOf',
        args: [owner]
      }),
    ]);
    const balanceUsdc = Number(balanceData) / 1e6;
    const amountUsdc = Number(BigInt(value)) / 1e6;

    if (balanceUsdc < amountUsdc) {
      return res.status(400).json({ error: `Insufficient USDC balance: have ${balanceUsdc}, need ${amountUsdc}` });
    }

    const now = Math.floor(Date.now() / 1000);
    if (Number(deadline) < now) {
      return res.status(400).json({ error: 'Permit deadline has expired' });
    }

    const permitHash = require('crypto').createHash('sha256')
      .update(JSON.stringify({ owner, spender, value: value.toString(), nonce: onChainNonce.toString(), deadline: deadline.toString(), v, r, s, chain: BASE_CHAIN_ID }))
      .digest('hex');

    res.json({
      valid: true,
      signature_verified: true,
      owner,
      spender,
      amount_usdc: amountUsdc,
      balance_usdc: balanceUsdc,
      nonce: Number(onChainNonce),
      deadline: Number(deadline),
      deadline_utc: new Date(Number(deadline) * 1000).toISOString(),
      permit_hash: '0x' + permitHash,
      chain: 'Base Mainnet',
      token: 'USDC',
      gasless: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/verify', async (req, res) => {
  try {
    const { tx_ref } = req.body;
    const result = await pool.query(
      `UPDATE payments SET status = 'verified', tx_ref = $1, verified_at = NOW()
       WHERE id = $2 RETURNING *`,
      [tx_ref, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });

    const payment = result.rows[0];
    await pool.query(
      `UPDATE reputation SET total_earned = total_earned + $1, last_updated = NOW()
       WHERE agent_id = $2`,
      [payment.amount, payment.to_agent_id]
    );

    req.app.locals.broadcast?.({ type: 'payment', action: 'verified', data: result.rows[0] });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
