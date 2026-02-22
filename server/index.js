const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const { initDB, pool } = require('./db');
const { seed } = require('./seed');

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required.');
  console.error('Set it in your .env file or environment. See .env.example for details.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors({
  exposedHeaders: ['payment-response', 'x-payment-response']
}));
app.use(express.json());

const apiLimiter = rateLimit({ windowMs: 60000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Rate limited. Wait a moment and try again.' } });

app.use('/api', apiLimiter);

app.use('/api/agents', require('./routes/agents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reputation', require('./routes/reputation'));
app.use('/api/registry', require('./routes/registry'));
app.use('/api/xmtp', require('./routes/xmtp'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use(express.static(path.join(__dirname, '..', 'client', 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }
});

async function start() {
  await initDB();
  await seed();

  let x402Active = false;

  try {
    const { paymentMiddleware, x402ResourceServer } = await import('@x402/express');
    const { ExactEvmScheme } = await import('@x402/evm/exact/server');
    const { HTTPFacilitatorClient } = await import('@x402/core/server');
    const { facilitator } = await import('@coinbase/x402');

    const receiverAddress = process.env.PAYMENT_RECEIVER_ADDRESS;

    if (!receiverAddress || receiverAddress === '0x0000000000000000000000000000000000000001') {
      console.log('x402: No PAYMENT_RECEIVER_ADDRESS set. Will resolve dynamically from target agent.');
    }

    const facilitatorClient = new HTTPFacilitatorClient(facilitator);
    const server = new x402ResourceServer(facilitatorClient)
      .register("eip155:8453", new ExactEvmScheme());

    app.post('/api/tasks/execute',
      async (req, res, next) => {
        let payTo = receiverAddress;
        if (!payTo || payTo === '0x0000000000000000000000000000000000000001') {
          try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (body.to_agent_id) {
              const result = await pool.query('SELECT wallet_address FROM agents WHERE id = $1', [body.to_agent_id]);
              if (result.rows.length > 0) {
                payTo = result.rows[0].wallet_address;
              }
            }
          } catch (e) {
            console.log('x402 payTo lookup error:', e.message);
          }
        }

        if (!payTo) {
          return res.status(400).json({ error: 'No receiver wallet found for payment' });
        }

        const mw = paymentMiddleware(
          {
            "POST /api/tasks/execute": {
              accepts: [{
                scheme: "exact",
                price: "$0.001",
                network: "eip155:8453",
                asset: "USDC",
                payTo: payTo,
              }],
              description: "A2A task execution fee",
            }
          },
          server
        );

        mw(req, res, next);
      },
      async (req, res) => {
        const { task_id, from_agent_id, to_agent_id, task_type, input } = req.body;
        const proofHash = '0x' + crypto.createHash('sha256')
          .update(JSON.stringify({ task_id, input, timestamp: Date.now() }))
          .digest('hex');

        let txHash = null;

        const allHeaders = Object.entries(req.headers);
        const paymentHeaders = allHeaders.filter(([k]) =>
          k.toLowerCase().includes('payment') || k.toLowerCase().includes('x-')
        );
        console.log('x402 request headers:', paymentHeaders.map(([k,v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 80) : v}`));

        for (const headerName of ['payment-response', 'x-payment-response']) {
          const val = res.getHeader(headerName);
          if (val) {
            try {
              const decoded = JSON.parse(Buffer.from(val, 'base64').toString());
              txHash = decoded.transaction || decoded.transactionHash || decoded.txHash || decoded.transaction_hash || null;
              console.log('x402 decoded response header:', decoded);
            } catch (e) {
              if (typeof val === 'string' && val.startsWith('0x') && val.length === 66) txHash = val;
            }
          }
        }

        console.log('x402 execute result:', { task_id, txHash });

        res.json({
          success: true,
          task_id,
          proof_hash: proofHash,
          tx_hash: txHash
        });
      }
    );
    x402Active = true;
    console.log('x402 payment middleware active (Base Mainnet, eip155:8453)');
  } catch (err) {
    console.log('x402 middleware not loaded:', err.message);
    console.log(err.stack);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const wsClients = new Set();
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
  });

  function broadcast(event) {
    const msg = JSON.stringify(event);
    for (const client of wsClients) {
      if (client.readyState === 1) client.send(msg);
    }
  }

  app.locals.broadcast = broadcast;

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentNet server running on port ${PORT}`);
    if (x402Active) console.log('Payments: x402 via CDP facilitator on Base Mainnet');
  });
}

start().catch(console.error);
