const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { extractApiKey, verifyApiKey } = require('../auth');
const { decrypt: decryptPrivateKey } = require('../crypto');

function getPublicKeyFromPrivate(privateKeyHex) {
  const { secp256k1 } = require('@noble/curves/secp256k1');
  const privBytes = privateKeyHex.replace('0x', '');
  return secp256k1.getPublicKey(privBytes, false);
}

function ecdhSharedSecret(privateKeyHex, peerPublicKeyBytes) {
  const { secp256k1 } = require('@noble/curves/secp256k1');
  const privBytes = privateKeyHex.replace('0x', '');
  const shared = secp256k1.getSharedSecret(privBytes, peerPublicKeyBytes);
  return crypto.createHash('sha256').update(Buffer.from(shared)).digest();
}

function encryptContent(plaintext, sharedKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sharedKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { encrypted: iv.toString('hex') + ':' + tag + ':' + encrypted, version: 'aes-256-gcm-v1' };
}

function decryptContent(encryptedStr, sharedKey) {
  const [ivHex, tagHex, cipherHex] = encryptedStr.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sharedKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function generateThreadId(fromId, toId, taskId) {
  const key = taskId ? `task-${taskId}` : `dm-${[fromId, toId].sort().join('-')}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

router.get('/', async (req, res) => {
  try {
    const { task_id, agent_id, thread_id } = req.query;
    let query = `SELECT m.id, m.task_id, m.from_agent_id, m.to_agent_id, m.message_type,
      m.content_hash, m.encryption_version, m.thread_id, m.status,
      m.delivered_at, m.read_at, m.created_at,
      fa.name as from_agent_name, ta.name as to_agent_name
      FROM xmtp_messages m
      LEFT JOIN agents fa ON m.from_agent_id = fa.id
      LEFT JOIN agents ta ON m.to_agent_id = ta.id`;
    const conditions = [];
    const params = [];

    if (task_id) {
      params.push(parseInt(task_id));
      conditions.push(`m.task_id = $${params.length}`);
    }
    if (agent_id) {
      params.push(parseInt(agent_id));
      conditions.push(`(m.from_agent_id = $${params.length} OR m.to_agent_id = $${params.length})`);
    }
    if (thread_id) {
      params.push(thread_id);
      conditions.push(`m.thread_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY m.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { task_id, from_agent_id, to_agent_id, message_type, content } = req.body;
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required to send messages' });
    }
    const valid = await verifyApiKey(parseInt(from_agent_id), apiKey);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid API key for sender agent' });
    }

    const fromAgent = await pool.query('SELECT wallet_address, encrypted_private_key FROM agents WHERE id = $1', [from_agent_id]);
    const toAgent = await pool.query('SELECT wallet_address, encrypted_private_key FROM agents WHERE id = $1', [to_agent_id]);
    if (fromAgent.rows.length === 0 || toAgent.rows.length === 0) {
      return res.status(404).json({ error: 'Sender or receiver agent not found' });
    }

    const contentHash = crypto.createHash('sha256').update(content || '').digest('hex');
    const threadId = generateThreadId(from_agent_id, to_agent_id, task_id);

    let encryptedContent = null;
    let encryptionVersion = null;

    if (fromAgent.rows[0].encrypted_private_key && toAgent.rows[0].encrypted_private_key) {
      const senderPrivKey = decryptPrivateKey(fromAgent.rows[0].encrypted_private_key);
      const receiverPrivKey = decryptPrivateKey(toAgent.rows[0].encrypted_private_key);
      const receiverPubKey = getPublicKeyFromPrivate(receiverPrivKey);
      const sharedKey = ecdhSharedSecret(senderPrivKey, receiverPubKey);
      const enc = encryptContent(content || '', sharedKey);
      encryptedContent = enc.encrypted;
      encryptionVersion = enc.version;
    }

    const result = await pool.query(
      `INSERT INTO xmtp_messages (task_id, from_agent_id, to_agent_id, message_type, content, content_hash, encrypted_content, encryption_version, thread_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING
       id, task_id, from_agent_id, to_agent_id, message_type, content_hash, encryption_version, thread_id, status, created_at`,
      [task_id, from_agent_id, to_agent_id, message_type || 'task_request',
       encryptedContent ? null : content,
       contentHash, encryptedContent, encryptionVersion, threadId]
    );
    req.app.locals.broadcast?.({ type: 'message', action: 'created', data: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/decrypt', async (req, res) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required to decrypt messages' });
    }

    const msg = await pool.query(
      `SELECT m.*, fa.wallet_address as from_wallet, fa.encrypted_private_key as from_enc_key,
              ta.wallet_address as to_wallet, ta.encrypted_private_key as to_enc_key
       FROM xmtp_messages m
       LEFT JOIN agents fa ON m.from_agent_id = fa.id
       LEFT JOIN agents ta ON m.to_agent_id = ta.id
       WHERE m.id = $1`, [req.params.id]
    );
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const message = msg.rows[0];
    const isSender = await verifyApiKey(message.from_agent_id, apiKey);
    const isReceiver = await verifyApiKey(message.to_agent_id, apiKey);
    if (!isSender && !isReceiver) {
      return res.status(403).json({ error: 'Only sender or receiver can decrypt messages' });
    }

    if (!message.encrypted_content) {
      return res.json({ id: message.id, content: message.content, encrypted: false });
    }

    let sharedKey;
    if (isSender && message.from_enc_key && message.to_enc_key) {
      const myPrivKey = decryptPrivateKey(message.from_enc_key);
      const peerPubKey = getPublicKeyFromPrivate(decryptPrivateKey(message.to_enc_key));
      sharedKey = ecdhSharedSecret(myPrivKey, peerPubKey);
    } else if (isReceiver && message.to_enc_key && message.from_enc_key) {
      const myPrivKey = decryptPrivateKey(message.to_enc_key);
      const peerPubKey = getPublicKeyFromPrivate(decryptPrivateKey(message.from_enc_key));
      sharedKey = ecdhSharedSecret(myPrivKey, peerPubKey);
    } else {
      return res.status(500).json({ error: 'Cannot derive decryption key — private keys not available' });
    }

    const decrypted = decryptContent(message.encrypted_content, sharedKey);

    res.json({ id: message.id, content: decrypted, encrypted: true, encryption_version: message.encryption_version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const msg = await pool.query('SELECT * FROM xmtp_messages WHERE id = $1', [req.params.id]);
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const validReceiver = await verifyApiKey(msg.rows[0].to_agent_id, apiKey);
    if (!validReceiver) {
      return res.status(403).json({ error: 'Only the receiver can update message status' });
    }

    const updates = [];
    const params = [req.params.id];

    if (status === 'delivered') {
      params.push(new Date());
      updates.push(`status = 'delivered'`, `delivered_at = $${params.length}`);
    } else if (status === 'read') {
      params.push(new Date());
      params.push(new Date());
      updates.push(`status = 'read'`, `delivered_at = COALESCE(delivered_at, $${params.length - 1})`, `read_at = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Invalid status. Use: delivered, read' });
    }

    const result = await pool.query(
      `UPDATE xmtp_messages SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/threads', async (req, res) => {
  try {
    const { agent_id } = req.query;
    let query = `SELECT thread_id, 
      MIN(created_at) as started_at,
      MAX(created_at) as last_message_at,
      COUNT(*) as message_count,
      array_agg(DISTINCT from_agent_id) as participants_from,
      array_agg(DISTINCT to_agent_id) as participants_to
      FROM xmtp_messages`;

    const params = [];
    if (agent_id) {
      params.push(parseInt(agent_id));
      query += ` WHERE from_agent_id = $1 OR to_agent_id = $1`;
    }
    query += ` GROUP BY thread_id ORDER BY last_message_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows.filter(r => r.thread_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM xmtp_messages');
    const byType = await pool.query('SELECT message_type, COUNT(*) as count FROM xmtp_messages GROUP BY message_type');
    const byStatus = await pool.query('SELECT status, COUNT(*) as count FROM xmtp_messages GROUP BY status');
    const encrypted = await pool.query("SELECT COUNT(*) as count FROM xmtp_messages WHERE encrypted_content IS NOT NULL");
    res.json({
      total: parseInt(total.rows[0].count),
      encrypted: parseInt(encrypted.rows[0].count),
      byType: byType.rows,
      byStatus: byStatus.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
