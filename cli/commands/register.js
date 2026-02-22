async function register(api, args) {
  const keyIdx = args.indexOf('--key');
  const nameIdx = args.indexOf('--name');
  const descIdx = args.indexOf('--description');
  const urlIdx = args.indexOf('--url');
  const nftIdx = args.indexOf('--nft-token');
  const contractIdx = args.indexOf('--contract');

  const agentId = args[0];
  if (!agentId || agentId.startsWith('--')) {
    console.log('');
    console.log('  Usage: agentnet register <agent_id> --key <api_key> [options]');
    console.log('');
    console.log('  Options:');
    console.log('    --name <name>            Display name for agent card');
    console.log('    --description <desc>     Agent description');
    console.log('    --url <endpoint>         Agent service URL');
    console.log('    --nft-token <id>         ERC-8004 NFT token ID (if minted)');
    console.log('    --contract <address>     NFT contract address on Base');
    console.log('');
    console.log('  Example:');
    console.log('    agentnet register 1 --key a2a_... --name "DataBot" --description "Blockchain data analysis" --url https://mybot.api');
    console.log('');
    return;
  }

  const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : null;
  if (!apiKey) {
    console.log('');
    console.log('  Error: API key required for registry.');
    console.log(`  Usage: agentnet register ${agentId} --key <your_api_key>`);
    console.log('');
    return;
  }

  const agent = await api.get(`/agents/${agentId}`);

  const name = nameIdx !== -1 ? args[nameIdx + 1] : agent.name;
  const description = descIdx !== -1 ? args[descIdx + 1] : (agent.description || '');
  const url = urlIdx !== -1 ? args[urlIdx + 1] : (agent.endpoint_url || '');
  const nftToken = nftIdx !== -1 ? args[nftIdx + 1] : null;
  const contractAddr = contractIdx !== -1 ? args[contractIdx + 1] : null;

  const agentCard = {
    version: '1.0',
    name,
    description,
    url: url || `https://a2a-network.agent/${agentId}`,
    capabilities: (agent.capabilities || []).map(cap => ({
      name: cap,
      description: `${cap} capability`,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' }
    })),
    walletAddress: agent.wallet_address,
    chainId: 'base',
    authentication: { type: 'wallet', address: agent.wallet_address },
    registeredAt: new Date().toISOString()
  };

  const reg = await api.postAuth('/registry', {
    agent_id: parseInt(agentId),
    nft_token_id: nftToken,
    contract_address: contractAddr,
    metadata: { name, description, url },
    agent_card: agentCard,
    chain_id: 'base',
  }, apiKey);

  console.log('');
  console.log('  ERC-8004 Identity Registered');
  console.log(`  Agent:      ${agent.name} (#${agentId})`);
  console.log(`  Wallet:     ${agent.wallet_address}`);
  console.log(`  Chain:      Base Mainnet`);
  if (nftToken) console.log(`  NFT Token:  ${nftToken}`);
  if (contractAddr) console.log(`  Contract:   ${contractAddr}`);
  console.log(`  Card:       ${JSON.stringify(agentCard).slice(0, 60)}...`);
  console.log(`  Registry:   entry #${reg.id}`);
  console.log('');

  if (nftToken && contractAddr) {
    console.log('  Verifying on-chain ownership...');
    try {
      const resolution = await api.get(`/registry/${agentId}/resolve`);
      if (resolution.onchain_verification?.matches_wallet) {
        console.log('  On-chain:   NFT ownership verified');
      } else if (resolution.onchain_verification?.error) {
        console.log(`  On-chain:   ${resolution.onchain_verification.error}`);
      } else {
        console.log('  On-chain:   NFT owner does not match agent wallet');
      }
    } catch (err) {
      console.log(`  On-chain:   Verification failed (${err.message})`);
    }
    console.log('');
  }
}

module.exports = register;
