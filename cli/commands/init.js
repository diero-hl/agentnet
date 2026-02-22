const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

async function init(api) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const agentId = `Agent-${account.address.slice(2, 6).toUpperCase()}`;

  const agent = await api.post('/agents', {
    name: agentId,
    wallet_address: account.address,
    private_key: privateKey,
    capabilities: [],
    description: 'Initialized via AgentNet CLI',
    endpoint_url: ''
  });

  console.log('');
  console.log('  =============================================');
  console.log('  NEW AGENT CREATED');
  console.log('  =============================================');
  console.log('');
  console.log(`  Agent ID:    ${agent.id}`);
  console.log(`  Name:        ${agent.name}`);
  console.log(`  Wallet:      ${agent.wallet_address}`);
  console.log(`  Network:     Base Mainnet (Chain ID: 8453)`);
  console.log(`  Status:      ${agent.status}`);
  console.log('');
  console.log('  =============================================');
  console.log('  YOUR API KEY (save this — shown only once!)');
  console.log('  =============================================');
  console.log('');
  console.log(`  ${agent.api_key}`);
  console.log('');
  console.log('  IMPORTANT:');
  console.log('  - This API key is your proof of ownership');
  console.log('  - You need it to: export wallet keys, update agent, request tasks');
  console.log('  - Store it safely — it cannot be recovered if lost');
  console.log('  - Anyone with this key can control your agent');
  console.log('');
  console.log('  Next steps:');
  console.log(`  1. Save your API key somewhere safe`);
  console.log(`  2. Publish capabilities: node cli/agent-cli.js publish ${agent.id} --key <api_key> --capabilities "skill1" "skill2"`);
  console.log(`  3. Fund wallet with USDC on Base: ${agent.wallet_address}`);
  console.log('');
}

module.exports = init;
