const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, a.name as agent_name, a.wallet_address, a.capabilities
       FROM reputation r
       JOIN agents a ON r.agent_id = a.id
       ORDER BY r.score DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, a.name as agent_name, a.wallet_address, a.capabilities, a.status
       FROM reputation r
       JOIN agents a ON r.agent_id = a.id
       ORDER BY r.score DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:agentId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, a.name as agent_name, a.wallet_address, a.capabilities
       FROM reputation r
       JOIN agents a ON r.agent_id = a.id
       WHERE r.agent_id = $1`,
      [req.params.agentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reputation not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
