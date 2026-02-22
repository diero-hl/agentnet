const crypto = require('crypto');

async function publish(api, args) {
  const capsIdx = args.indexOf('--capabilities');
  const endIdx = args.indexOf('--endpoint');
  const keyIdx = args.indexOf('--key');

  if (capsIdx === -1) {
    console.log('Usage: agentnet publish <agent_id> --key <api_key> --capabilities "cap1" "cap2" --endpoint "https://..."');
    return;
  }

  const agentId = args[0];
  if (!agentId || agentId.startsWith('--')) {
    console.log('Usage: agentnet publish <agent_id> --key <api_key> --capabilities "cap1" "cap2" --endpoint "https://..."');
    return;
  }

  const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : null;
  if (!apiKey) {
    console.log('');
    console.log('  Error: API key required to publish capabilities.');
    console.log(`  Usage: agentnet publish ${agentId} --key <your_api_key> --capabilities "cap1" --endpoint "https://..."`);
    console.log('');
    return;
  }

  let capabilities = [];
  let endpoint = '';

  for (let i = capsIdx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    capabilities.push(args[i]);
  }

  if (endIdx !== -1 && args[endIdx + 1]) {
    endpoint = args[endIdx + 1];
  }

  const agent = await api.patchAuth(`/agents/${agentId}`, {
    capabilities,
    endpoint_url: endpoint
  }, apiKey);

  const agentCard = {
    version: '1.0',
    name: agent.name,
    description: agent.description || '',
    url: endpoint || null,
    capabilities: capabilities.map(cap => ({
      name: cap,
      description: `${cap} capability`,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' }
    })),
    walletAddress: agent.wallet_address,
    chainId: 'base',
    paymentInfo: {
      currency: 'USDC',
      network: 'base',
      protocol: 'x402'
    },
    authentication: {
      type: 'wallet',
      address: agent.wallet_address
    },
    publishedAt: new Date().toISOString()
  };

  const cardHash = crypto.createHash('sha256')
    .update(JSON.stringify(agentCard))
    .digest('hex');

  await api.postAuth('/registry', {
    agent_id: parseInt(agentId),
    metadata: { capabilities, endpoint, publishedAt: agentCard.publishedAt },
    agent_card: agentCard,
    chain_id: 'base',
    onchain_ref: `0x${cardHash}`
  }, apiKey);

  console.log('');
  console.log('  Capabilities published successfully');
  console.log(`  Agent:    ${agent.name}`);
  console.log(`  Wallet:   ${agent.wallet_address}`);
  console.log(`  Caps:     ${capabilities.join(', ')}`);
  if (endpoint) console.log(`  Endpoint: ${endpoint}`);
  console.log(`  Chain:    Base Mainnet`);
  console.log(`  Card:     ERC-8004 (${cardHash.slice(0, 12)}...)`);
  console.log(`  Registry: updated`);
  console.log('');
}

module.exports = publish;
