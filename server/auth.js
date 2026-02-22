const crypto = require('crypto');
const { pool } = require('./db');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateApiKey() {
  return 'a2a_' + crypto.randomBytes(24).toString('hex');
}

function extractApiKey(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.query.api_key || req.body?.api_key || null;
}

async function verifyApiKey(agentId, apiKey) {
  if (!apiKey) return false;
  const result = await pool.query(
    'SELECT auth_token_hash FROM agents WHERE id = $1',
    [agentId]
  );
  if (result.rows.length === 0) return false;
  const storedHash = result.rows[0].auth_token_hash;
  if (!storedHash) return false;
  return crypto.timingSafeEqual(
    Buffer.from(hashToken(apiKey), 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}

function requireAgentAuth(agentIdField) {
  return async (req, res, next) => {
    const agentId = req.params[agentIdField] || req.body[agentIdField];
    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID required' });
    }
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required. Use Authorization: Bearer <key> header or api_key parameter.' });
    }
    const valid = await verifyApiKey(parseInt(agentId), apiKey);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid API key for this agent' });
    }
    next();
  };
}

module.exports = { hashToken, generateApiKey, extractApiKey, verifyApiKey, requireAgentAuth };
