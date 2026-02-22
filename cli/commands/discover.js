async function discover(api, args) {
  const capability = args[0];
  const params = capability ? `?capability=${capability}` : '';

  const agents = await api.get(`/agents${params}`);

  console.log('');
  if (agents.length === 0) {
    console.log('  No agents found' + (capability ? ` with capability "${capability}"` : ''));
  } else {
    console.log(`  Found ${agents.length} agent${agents.length > 1 ? 's' : ''}:`);
    console.log('');
    agents.forEach((a, i) => {
      const caps = (a.capabilities || []).join(', ');
      console.log(`  ${i + 1}. ${a.name.padEnd(24)} ID: ${a.id}  Status: ${a.status}`);
      console.log(`     Wallet: ${a.wallet_address ? a.wallet_address.slice(0, 6) + '...' + a.wallet_address.slice(-4) : 'N/A'}`);
      if (caps) console.log(`     Capabilities: ${caps}`);
    });
  }
  console.log('');
}

module.exports = discover;
