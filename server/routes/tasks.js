const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { extractApiKey, verifyApiKey } = require('../auth');
const { executeTask } = require('../taskExecutor');

router.get('/', async (req, res) => {
  try {
    const { status, agent_id } = req.query;
    let query = `SELECT t.*, 
      ra.name as requester_name, ta.name as target_name
      FROM tasks t
      LEFT JOIN agents ra ON t.requester_agent_id = ra.id
      LEFT JOIN agents ta ON t.target_agent_id = ta.id`;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (agent_id) {
      params.push(parseInt(agent_id));
      conditions.push(`(t.requester_agent_id = $${params.length} OR t.target_agent_id = $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM tasks');
    const byStatus = await pool.query('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    const recent = await pool.query('SELECT DATE(created_at) as date, COUNT(*) as count FROM tasks WHERE created_at > NOW() - INTERVAL \'30 days\' GROUP BY DATE(created_at) ORDER BY date');
    res.json({
      total: parseInt(total.rows[0].count),
      byStatus: byStatus.rows,
      recentActivity: recent.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { requester_agent_id, target_agent_id, task_type, payload } = req.body;
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required to create tasks' });
    }
    const valid = await verifyApiKey(parseInt(requester_agent_id), apiKey);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid API key for requester agent' });
    }
    const result = await pool.query(
      `INSERT INTO tasks (requester_agent_id, target_agent_id, task_type, payload)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [requester_agent_id, target_agent_id, task_type, JSON.stringify(payload || {})]
    );
    req.app.locals.broadcast?.({ type: 'task', action: 'created', data: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, result: taskResult, proof_hash } = req.body;
    const updateResult = await pool.query(
      `UPDATE tasks SET status = $1, result = $2, proof_hash = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, taskResult ? JSON.stringify(taskResult) : null, proof_hash, req.params.id]
    );
    if (updateResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    if (status === 'completed') {
      const task = updateResult.rows[0];
      await pool.query(
        `UPDATE reputation SET score = LEAST(100, score + 1), tasks_completed = tasks_completed + 1, last_updated = NOW()
         WHERE agent_id = $1`,
        [task.target_agent_id]
      );
    } else if (status === 'failed') {
      const task = updateResult.rows[0];
      await pool.query(
        `UPDATE reputation SET score = GREATEST(0, score - 2), tasks_failed = tasks_failed + 1, last_updated = NOW()
         WHERE agent_id = $1`,
        [task.target_agent_id]
      );
    }

    req.app.locals.broadcast?.({ type: 'task', action: 'updated', data: updateResult.rows[0] });
    res.json(updateResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { task_id, task_type, input } = req.body;
    const result = await executeTask(task_type, input);
    const proofHash = '0x' + require('crypto').createHash('sha256')
      .update(JSON.stringify({ task_id, result, timestamp: Date.now() }))
      .digest('hex');

    if (task_id) {
      const status = result.status === 'completed' ? 'completed' : 'failed';
      await pool.query(
        `UPDATE tasks SET status = $1, result = $2, proof_hash = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, JSON.stringify(result), proofHash, task_id]
      );

      if (status === 'completed') {
        await pool.query(
          `UPDATE reputation SET score = LEAST(100, score + 1), tasks_completed = tasks_completed + 1, last_updated = NOW()
           WHERE agent_id = (SELECT target_agent_id FROM tasks WHERE id = $1)`,
          [task_id]
        );
      }
      req.app.locals.broadcast?.({ type: 'task', action: 'executed', data: { task_id, result } });
    }

    res.json({ result, proof_hash: proofHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
