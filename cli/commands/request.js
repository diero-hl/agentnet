const crypto = require('crypto');

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;
const USDC_ABI = [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }];

async function checkUSDCBalance(address) {
  try {
    const { createPublicClient, http, formatUnits } = await import('viem');
    const { base } = await import('viem/chains');
    const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
    const balance = await client.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [address] });
    return parseFloat(formatUnits(balance, 6));
  } catch (err) { return null; }
}

async function getUsdcNonce(ownerAddress) {
  try {
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');
    const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
    const nonce = await client.readContract({
      address: USDC_ADDRESS,
      abi: [{ inputs: [{ name: 'owner', type: 'address' }], name: 'nonces', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'nonces',
      args: [ownerAddress]
    });
    return nonce;
  } catch { return 0n; }
}

async function signGaslessPermit(privateKey, ownerAddress, spenderAddress, amountUsdc) {
  const { privateKeyToAccount } = await import('viem/accounts');

  const account = privateKeyToAccount(privateKey);
  const value = BigInt(Math.round(amountUsdc * 1e6));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = await getUsdcNonce(ownerAddress);

  const domain = {
    name: 'USD Coin',
    version: '2',
    chainId: BASE_CHAIN_ID,
    verifyingContract: USDC_ADDRESS,
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const message = {
    owner: ownerAddress,
    spender: spenderAddress,
    value,
    nonce,
    deadline,
  };

  const signature = await account.signTypedData({ domain, types, primaryType: 'Permit', message });

  const r = '0x' + signature.slice(2, 66);
  const s = '0x' + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    owner: ownerAddress,
    spender: spenderAddress,
    value: value.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    v, r, s,
    signature,
    amount_usdc: amountUsdc,
  };
}

const TASK_TYPES = {
  contract_analysis: { label: 'Contract Analysis', inputHint: 'contract address (0x...)', example: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  token_lookup:      { label: 'Token Lookup',      inputHint: 'token address or name (usdc, weth)', example: 'usdc' },
  wallet_check:      { label: 'Wallet Check',      inputHint: 'wallet address (0x...)', example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  gas_estimate:      { label: 'Gas Estimate',       inputHint: 'none required', example: '' },
  block_info:        { label: 'Block Info',         inputHint: 'block number (optional)', example: 'latest' },
  tx_trace:          { label: 'Transaction Trace',  inputHint: 'transaction hash (0x...)', example: '0x...' },
};

function printResult(result, indent = '  ') {
  if (!result || typeof result !== 'object') {
    console.log(`${indent}${result}`);
    return;
  }
  for (const [key, val] of Object.entries(result)) {
    if (key === 'status' || key === 'executedAt' || key === 'duration_ms') continue;
    if (val === null || val === undefined) continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (typeof val === 'object' && !Array.isArray(val)) {
      console.log(`${indent}${label}:`);
      for (const [k2, v2] of Object.entries(val)) {
        if (typeof v2 === 'object' && v2 !== null) {
          const subLabel = k2.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          console.log(`${indent}  ${subLabel}: ${Object.entries(v2).map(([a, b]) => `${a}=${b}`).join(', ')}`);
        } else {
          console.log(`${indent}  ${k2.replace(/_/g, ' ')}: ${v2}`);
        }
      }
    } else if (Array.isArray(val)) {
      console.log(`${indent}${label}: ${val.join(', ')}`);
    } else {
      console.log(`${indent}${label}: ${val}`);
    }
  }
}

async function request(api, args) {
  const taskType = args[0];
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const inputIdx = args.indexOf('--input');
  const priceIdx = args.indexOf('--max-price');
  const keyIdx = args.indexOf('--key');

  if (!taskType || fromIdx === -1 || toIdx === -1) {
    console.log('');
    console.log('  Usage: agentnet request <task_type> --from <id> --to <id> --key <api_key> [options]');
    console.log('');
    console.log('  Options:');
    console.log('    --input <data>       Input data for the task (contract address, token name, etc.)');
    console.log('    --max-price <amount> Maximum USDC to pay (default: 0.001)');
    console.log('    --key <api_key>      Your agent API key');
    console.log('');
    console.log('  Available task types with real blockchain data:');
    for (const [type, info] of Object.entries(TASK_TYPES)) {
      console.log(`    ${type.padEnd(22)} ${info.label} — input: ${info.inputHint}`);
    }
    console.log('');
    console.log('  Payment: Gasless EIP-2612 USDC permit (no ETH needed for gas)');
    console.log('');
    console.log('  Examples:');
    console.log('    agentnet request contract_analysis --from 1 --to 2 --key a2a_... --input 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    console.log('    agentnet request token_lookup --from 1 --to 2 --key a2a_... --input usdc');
    console.log('    agentnet request wallet_check --from 1 --to 2 --key a2a_... --input 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    console.log('    agentnet request gas_estimate --from 1 --to 2 --key a2a_...');
    console.log('');
    return;
  }

  const fromId = parseInt(args[fromIdx + 1]);
  const toId = parseInt(args[toIdx + 1]);
  const input = inputIdx !== -1 ? args[inputIdx + 1] : '';
  const maxPrice = priceIdx !== -1 ? parseFloat(args[priceIdx + 1]) : 0.001;
  const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : null;

  if (!apiKey) {
    console.log('');
    console.log('  Error: API key required to send task requests.');
    console.log('  Usage: agentnet request ' + taskType + ' --from ' + fromId + ' --to ' + toId + ' --key <your_api_key>');
    console.log('');
    return;
  }

  const taskInfo = TASK_TYPES[taskType];
  if (taskInfo && taskInfo.inputHint !== 'none required' && !input) {
    console.log('');
    console.log(`  Warning: No --input provided for ${taskType}.`);
    console.log(`  Expected: ${taskInfo.inputHint}`);
    console.log(`  Example:  agentnet request ${taskType} --from ${fromId} --to ${toId} --key <key> --input ${taskInfo.example}`);
    console.log(`  Continuing with defaults...`);
    console.log('');
  }

  const fromAgent = await api.get(`/agents/${fromId}`);
  const toAgent = await api.get(`/agents/${toId}`);

  console.log('');
  console.log(`  ┌─ Task Request ───────────────────────────────`);
  console.log(`  │ Type:    ${taskInfo ? taskInfo.label : taskType}`);
  console.log(`  │ Input:   ${input || '(default)'}`);
  console.log(`  │ From:    ${fromAgent.name} (#${fromId})`);
  console.log(`  │ To:      ${toAgent.name} (#${toId})`);
  console.log(`  │ Price:   ${maxPrice} USDC`);
  console.log(`  │ Payment: Gasless EIP-2612 Permit`);
  console.log(`  │ Chain:   Base Mainnet`);
  console.log(`  └─────────────────────────────────────────────`);
  console.log('');

  const balance = await checkUSDCBalance(fromAgent.wallet_address);
  if (balance !== null) {
    console.log(`  USDC Balance: ${balance} USDC`);
  }

  if (balance !== null && balance < maxPrice) {
    console.log(`  Payment FAILED: Insufficient USDC (need ${maxPrice}, have ${balance})`);
    console.log(`  Fund wallet: ${fromAgent.wallet_address}`);
    console.log('');
    return;
  }

  const task = await api.postAuth('/tasks', {
    requester_agent_id: fromId,
    target_agent_id: toId,
    task_type: taskType,
    payload: { input, max_price: maxPrice }
  }, apiKey);

  console.log(`  Task Created: #${task.id}`);
  console.log('');

  let permitData = null;
  let paymentMethod = 'none';
  let paymentStatus = 'failed';

  try {
    const keyData = await api.getAuth(`/agents/${fromId}/key`, apiKey);
    if (keyData.private_key) {
      console.log(`  Signing gasless USDC permit (EIP-2612)...`);
      console.log(`  No ETH needed — off-chain signature only`);

      permitData = await signGaslessPermit(
        keyData.private_key,
        fromAgent.wallet_address,
        toAgent.wallet_address,
        maxPrice
      );

      paymentMethod = 'gasless_permit';
      paymentStatus = 'signed';

      console.log(`  Permit signed successfully`);
      console.log(`  Owner:    ${permitData.owner}`);
      console.log(`  Spender:  ${permitData.spender}`);
      console.log(`  Value:    ${maxPrice} USDC (${permitData.value} wei)`);
      console.log(`  Nonce:    ${permitData.nonce}`);
      console.log(`  Deadline: ${new Date(Number(permitData.deadline) * 1000).toISOString()}`);
      console.log(`  Sig:      ${permitData.signature.slice(0, 22)}...`);
    } else {
      console.log(`  Could not retrieve private key for permit signing`);
      paymentMethod = 'no_key';
    }
  } catch (err) {
    console.log(`  Permit signing error: ${err.message}`);
    paymentMethod = 'error';
  }

  console.log('');
  console.log(`  Executing ${taskInfo ? taskInfo.label : taskType} on Base Mainnet...`);

  const execResult = await api.post('/tasks/execute', {
    task_id: task.id,
    task_type: taskType,
    input: input
  });

  const result = execResult.result;
  const proofHash = execResult.proof_hash;

  const paymentPayload = {
    task_id: task.id,
    from_agent_id: fromId,
    to_agent_id: toId,
    amount: maxPrice,
    currency: 'USDC',
    network: 'base',
    payment_method: paymentMethod,
  };

  if (permitData) {
    paymentPayload.permit_signature = permitData.signature;
    paymentPayload.permit_deadline = Number(permitData.deadline);
    paymentPayload.permit_nonce = Number(permitData.nonce);
    paymentPayload.permit_v = permitData.v;
    paymentPayload.permit_r = permitData.r;
    paymentPayload.permit_s = permitData.s;
  }

  const payment = await api.post('/payments', paymentPayload);

  if (permitData) {
    const verifyResult = await api.post('/payments/permit/verify', {
      owner: permitData.owner,
      spender: permitData.spender,
      value: permitData.value,
      deadline: permitData.deadline,
      v: permitData.v,
      r: permitData.r,
      s: permitData.s,
      from_agent_id: fromId,
    });

    if (verifyResult.valid) {
      await api.post(`/payments/${payment.id}/verify`, {
        tx_ref: verifyResult.permit_hash
      });
      paymentStatus = 'verified';
      console.log(`  Permit verified: balance confirmed (${verifyResult.balance_usdc} USDC)`);
    }
  }

  console.log('');
  if (result && result.status === 'completed') {
    console.log(`  ┌─ Task Result (Real Blockchain Data) ────────`);
    console.log(`  │`);
    printResult(result, '  │ ');
    console.log(`  │`);
    console.log(`  └─────────────────────────────────────────────`);
  } else if (result && result.error) {
    console.log(`  Task Failed: ${result.error}`);
  }

  console.log('');
  console.log(`  ┌─ Summary ────────────────────────────────────`);
  console.log(`  │ Task ID:    #${task.id}`);
  console.log(`  │ Status:     ${result?.status || 'unknown'}`);
  if (paymentStatus === 'verified' && permitData) {
    console.log(`  │ Payment:    ${maxPrice} USDC (gasless permit — verified)`);
    console.log(`  │ Method:     EIP-2612 Permit (no gas needed)`);
    console.log(`  │ Permit Sig: ${permitData.signature.slice(0, 22)}...`);
  } else if (permitData) {
    console.log(`  │ Payment:    ${maxPrice} USDC (gasless permit — signed)`);
    console.log(`  │ Method:     EIP-2612 Permit (no gas needed)`);
  } else {
    console.log(`  │ Payment:    ${maxPrice} USDC (${paymentMethod})`);
  }
  console.log(`  │ Proof Hash: ${proofHash ? proofHash.slice(0, 22) + '...' : 'none'}`);
  console.log(`  └─────────────────────────────────────────────`);
  console.log('');
}

module.exports = request;
