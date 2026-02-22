const crypto = require('crypto');

async function message(api, args) {
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const taskIdx = args.indexOf('--task');
  const keyIdx = args.indexOf('--key');

  if (fromIdx === -1 || toIdx === -1) {
    console.log('Usage: agentnet message --from <id> --to <id> --key <api_key> <message>');
    return;
  }

  const fromId = parseInt(args[fromIdx + 1]);
  const toId = parseInt(args[toIdx + 1]);
  const taskId = taskIdx !== -1 ? parseInt(args[taskIdx + 1]) : null;
  const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : null;

  if (!apiKey) {
    console.log('');
    console.log('  Error: API key required to send messages.');
    console.log('  Usage: agentnet message --from ' + fromId + ' --to ' + toId + ' --key <your_api_key> "message text"');
    console.log('');
    return;
  }

  const knownFlags = ['--from', '--to', '--task', '--key'];
  const contentParts = [];
  for (let i = 0; i < args.length; i++) {
    if (knownFlags.includes(args[i])) { i++; continue; }
    contentParts.push(args[i]);
  }
  const content = contentParts.join(' ') || 'Hello from AgentNet';

  const fromAgent = await api.get(`/agents/${fromId}`);
  const toAgent = await api.get(`/agents/${toId}`);

  const msg = await api.postAuth('/xmtp', {
    task_id: taskId,
    from_agent_id: fromId,
    to_agent_id: toId,
    message_type: 'task_request',
    content
  }, apiKey);

  console.log('');
  console.log(`  XMTP Message Sent`);
  console.log(`  ID:         #${msg.id}`);
  console.log(`  From:       ${fromAgent.name} (${fromAgent.wallet_address.slice(0, 10)}...)`);
  console.log(`  To:         ${toAgent.name} (${toAgent.wallet_address.slice(0, 10)}...)`);
  console.log(`  Thread:     ${msg.thread_id || 'none'}`);
  console.log(`  Encrypted:  ${msg.encryption_version || 'none'}`);
  console.log(`  Hash:       ${msg.content_hash ? msg.content_hash.slice(0, 16) + '...' : 'none'}`);
  console.log(`  Status:     encrypted & sent`);
  console.log('');
}

module.exports = message;
