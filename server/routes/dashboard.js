const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/overview', async (req, res) => {
  try {
    const agents = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM agents');
    const tasks = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'completed\') as completed, COUNT(*) FILTER (WHERE status = \'pending\') as pending, COUNT(*) FILTER (WHERE status = \'in_progress\') as in_progress FROM tasks');
    const payments = await pool.query('SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) FILTER (WHERE status = \'verified\') as verified FROM payments');
    const messages = await pool.query('SELECT COUNT(*) as total FROM xmtp_messages');
    const recentTasks = await pool.query(`SELECT t.*, ra.name as requester_name, ta.name as target_name FROM tasks t LEFT JOIN agents ra ON t.requester_agent_id = ra.id LEFT JOIN agents ta ON t.target_agent_id = ta.id ORDER BY t.created_at DESC LIMIT 5`);
    const topAgents = await pool.query(`SELECT r.*, a.name as agent_name FROM reputation r JOIN agents a ON r.agent_id = a.id ORDER BY r.score DESC LIMIT 5`);
    const taskActivity = await pool.query("SELECT DATE(created_at) as date, COUNT(*) as count FROM tasks WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date");
    const paymentActivity = await pool.query("SELECT DATE(created_at) as date, COUNT(*) as count FROM payments WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date");

    res.json({
      agents: { total: parseInt(agents.rows[0].total), active: parseInt(agents.rows[0].active) },
      tasks: { total: parseInt(tasks.rows[0].total), completed: parseInt(tasks.rows[0].completed), pending: parseInt(tasks.rows[0].pending), inProgress: parseInt(tasks.rows[0].in_progress), recentActivity: taskActivity.rows },
      payments: { total: parseInt(payments.rows[0].total), totalAmount: parseFloat(payments.rows[0].total_amount), verified: parseInt(payments.rows[0].verified), recentActivity: paymentActivity.rows },
      messages: { total: parseInt(messages.rows[0].total) },
      recentTasks: recentTasks.rows,
      topAgents: topAgents.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
