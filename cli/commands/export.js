async function exportKey(api, args) {
  const agentId = parseInt(args[0]);
  const keyIdx = args.indexOf('--key');
  const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : null;

  if (!agentId) {
    console.log('Usage: agentnet export <agent_id> --key <your_api_key>');
    console.log('  Exports the private key for wallet backup and recovery.');
    console.log('  Requires your API key (given during init) to prove ownership.');
    return;
  }

  if (!apiKey) {
    console.log('');
    console.log('  Error: API key required to export wallet.');
    console.log('  Usage: agentnet export ' + agentId + ' --key <your_api_key>');
    console.log('  Your API key was shown when you created this agent with "init".');
    console.log('');
    return;
  }

  const agent = await api.get(`/agents/${agentId}`);
  const keyData = await api.getAuth(`/agents/${agentId}/key`, apiKey);

  console.log('');
  console.log('  =============================================');
  console.log('  WALLET EXPORT — KEEP THIS PRIVATE');
  console.log('  =============================================');
  console.log('');
  console.log(`  Agent:       ${agent.name} (#${agent.id})`);
  console.log(`  Wallet:      ${agent.wallet_address}`);
  console.log(`  Network:     Base Mainnet (Chain ID: 8453)`);
  console.log('');

  if (keyData.private_key) {
    console.log(`  Private Key: ${keyData.private_key}`);
    console.log('');
    console.log('  HOW TO RECOVER / USE THIS WALLET:');
    console.log('  1. Open MetaMask, Coinbase Wallet, or any EVM wallet');
    console.log('  2. Choose "Import Wallet" or "Import Account"');
    console.log('  3. Paste the private key above');
    console.log('  4. Add Base Mainnet network (Chain ID: 8453, RPC: https://mainnet.base.org)');
    console.log('  5. Your USDC balance and payments will be visible');
    console.log('');
    console.log('  IMPORTANT:');
    console.log('  - Save this key in a password manager or paper backup');
    console.log('  - Anyone with this key controls the wallet and all funds');
    console.log('  - Never share this key with anyone');
  } else {
    console.log('  No private key stored for this agent.');
    console.log('  This agent may have been created with an external wallet.');
  }
  console.log('');
}

module.exports = exportKey;
