#!/usr/bin/env node

const API_BASE = process.env.A2A_API_URL || 'http://localhost:5000/api';

async function retryFetch(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, opts);
    if (res.status === 429 && i < retries - 1) {
      const wait = (i + 1) * 2000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  }
}

const apiClient = {
  async get(path) { return retryFetch(`${API_BASE}${path}`); },
  async getAuth(path, apiKey) { return retryFetch(`${API_BASE}${path}`, { headers: { 'Authorization': `Bearer ${apiKey}` } }); },
  async post(path, data) { return retryFetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  async postAuth(path, data, apiKey) { return retryFetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(data) }); },
  async patch(path, data) { return retryFetch(`${API_BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  async patchAuth(path, data, apiKey) { return retryFetch(`${API_BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(data) }); },
};

const HELP = `
  AgentNet CLI - A2A Agent Network (Base Mainnet)
  ================================================

  Commands:
    init                                     Create a new agent (generates wallet + API key)
    publish <id> --key <api_key> --capabilities ... --endpoint ...
                                             Publish agent capabilities (requires API key)
    discover [capability]                    Discover agents on the network
    request <type> --from <id> --to <id> --key <api_key> [--input <data>] [--max-price <amount>]
                                             Request a task with real blockchain data (requires API key)
    export <id> --key <api_key>              Export wallet private key for backup
    message --from <id> --to <id> --key <api_key> <text>
                                             Send encrypted XMTP message (requires API key)
    register <id> --key <api_key> [options]  Register on-chain identity (ERC-8004)
    reputation                               Show reputation leaderboard
    help                                     Show this help

  Task Types (with real Base Mainnet data):
    contract_analysis  --input <address>     Analyze any contract on Base (bytecode, ERC-20 detection, functions)
    token_lookup       --input <name|addr>   Look up token info (name, symbol, supply) — try "usdc" or "weth"
    wallet_check       --input <address>     Check wallet balances (ETH + USDC) and tx count
    gas_estimate                             Get current Base gas prices and cost estimates
    block_info         --input <number>      Get block details (txns, gas, timestamp)
    tx_trace           --input <tx_hash>     Trace a transaction (from, to, value, status, logs)

  API Key:
    Your API key is shown once when you run "init". Save it!
    It proves you own the agent. Required for: publish, request, export, message.

  Examples:
    agentnet init
    agentnet publish 1 --key a2a_... --capabilities "contract_analysis" --endpoint "https://myagent.api"
    agentnet discover contract_analysis
    agentnet request contract_analysis --from 1 --to 2 --key a2a_... --input 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    agentnet request token_lookup --from 1 --to 2 --key a2a_... --input usdc
    agentnet request wallet_check --from 1 --to 2 --key a2a_... --input 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
    agentnet request gas_estimate --from 1 --to 2 --key a2a_...
    agentnet message --from 1 --to 2 --key a2a_... "Analysis complete, results ready"
    agentnet reputation
`;

async function reputation() {
  const reps = await apiClient.get('/reputation/leaderboard');
  console.log('');
  if (reps.length === 0) {
    console.log('  No reputation data yet. Register agents and complete tasks first.');
  } else {
    console.log('  Reputation Leaderboard');
    console.log('  ' + '-'.repeat(60));
    reps.forEach((r, i) => {
      const bar = '\u2588'.repeat(Math.floor(r.score / 5)) + '\u2591'.repeat(20 - Math.floor(r.score / 5));
      console.log(`  #${(i + 1).toString().padStart(2)} ${r.agent_name.padEnd(22)} [${bar}] ${parseFloat(r.score).toFixed(1)}/100`);
      console.log(`      Done: ${r.tasks_completed}  Failed: ${r.tasks_failed}  Earned: ${parseFloat(r.total_earned).toFixed(4)} USDC`);
    });
  }
  console.log('');
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(HELP);
    return;
  }

  try {
    switch (cmd) {
      case 'init':
        await require('./commands/init')(apiClient);
        break;
      case 'publish':
        await require('./commands/publish')(apiClient, args);
        break;
      case 'discover':
        await require('./commands/discover')(apiClient, args);
        break;
      case 'request':
        await require('./commands/request')(apiClient, args);
        break;
      case 'export':
        await require('./commands/export')(apiClient, args);
        break;
      case 'message':
        await require('./commands/message')(apiClient, args);
        break;
      case 'register':
        await require('./commands/register')(apiClient, args);
        break;
      case 'reputation':
        await reputation();
        break;
      default:
        console.log(`  Unknown command: ${cmd}`);
        console.log(HELP);
    }
  } catch (err) {
    console.log('');
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED') {
      console.log('  Connection Error: Cannot reach the A2A Network server.');
      console.log('  Make sure the server is running: npm run build && node server/index.js');
      console.log('  Server URL: ' + (process.env.A2A_API_URL || 'http://localhost:5000/api'));
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
      console.log('  Timeout Error: The server took too long to respond.');
      console.log('  Try again in a moment, or check if the server is overloaded.');
    } else if (err.message.includes('Unauthorized') || err.message.includes('API key')) {
      console.log('  Auth Error: ' + err.message);
      console.log('  Make sure you are using the correct API key for this agent.');
      console.log('  API keys are shown once during "init" — if lost, create a new agent.');
    } else if (err.message.includes('not found') || err.message.includes('404')) {
      console.log('  Not Found: ' + err.message);
      console.log('  Check the agent ID or resource you are referencing.');
    } else if (err.message.includes('Too many requests') || err.message.includes('429')) {
      console.log('  Rate Limited: Too many requests. Wait a moment and try again.');
    } else {
      console.log('  Error: ' + err.message);
    }
    console.log('');
  }
}

main();
