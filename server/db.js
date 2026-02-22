const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        wallet_address VARCHAR(255) UNIQUE,
        capabilities TEXT[] DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'active',
        description TEXT DEFAULT '',
        endpoint_url VARCHAR(500) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        requester_agent_id INTEGER REFERENCES agents(id),
        target_agent_id INTEGER REFERENCES agents(id),
        task_type VARCHAR(100) NOT NULL,
        payload JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'pending',
        result JSONB DEFAULT NULL,
        proof_hash VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id),
        from_agent_id INTEGER REFERENCES agents(id),
        to_agent_id INTEGER REFERENCES agents(id),
        amount NUMERIC(18, 8) DEFAULT 0,
        currency VARCHAR(20) DEFAULT 'USDC',
        status VARCHAR(50) DEFAULT 'pending',
        tx_ref VARCHAR(255) DEFAULT NULL,
        verified_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reputation (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES agents(id) UNIQUE,
        score NUMERIC(5, 2) DEFAULT 50.00,
        tasks_completed INTEGER DEFAULT 0,
        tasks_failed INTEGER DEFAULT 0,
        total_earned NUMERIC(18, 8) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS registry (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES agents(id) UNIQUE,
        nft_token_id VARCHAR(255) DEFAULT NULL,
        metadata JSONB DEFAULT '{}',
        onchain_ref VARCHAR(255) DEFAULT NULL,
        registered_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS xmtp_messages (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id),
        from_agent_id INTEGER REFERENCES agents(id),
        to_agent_id INTEGER REFERENCES agents(id),
        message_type VARCHAR(50) DEFAULT 'task_request',
        content TEXT DEFAULT '',
        status VARCHAR(50) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Database tables initialized');

    await client.query(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT DEFAULT NULL;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_token_hash VARCHAR(255) DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS content_hash VARCHAR(255) DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS encrypted_ref VARCHAR(255) DEFAULT NULL;
      ALTER TABLE registry ADD COLUMN IF NOT EXISTS contract_address VARCHAR(255) DEFAULT NULL;
      ALTER TABLE registry ADD COLUMN IF NOT EXISTS chain_id VARCHAR(50) DEFAULT 'base';
      ALTER TABLE registry ADD COLUMN IF NOT EXISTS agent_card JSONB DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255) DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS network VARCHAR(50) DEFAULT 'base';
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS permit_signature TEXT DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS permit_deadline BIGINT DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS permit_nonce BIGINT DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS permit_v INTEGER DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS permit_r VARCHAR(255) DEFAULT NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS permit_s VARCHAR(255) DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS encrypted_content TEXT DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS encryption_version VARCHAR(20) DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255) DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP DEFAULT NULL;
      ALTER TABLE xmtp_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP DEFAULT NULL;
    `);
    console.log('Database columns updated');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
