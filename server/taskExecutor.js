const crypto = require('crypto');

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

async function rpcCall(method, params = []) {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function hexToDecimal(hex) {
  return parseInt(hex, 16);
}

function weiToEth(weiHex) {
  const wei = BigInt(weiHex);
  return Number(wei) / 1e18;
}

function decodeString(hex) {
  if (!hex || hex === '0x' || hex.length < 66) return null;
  try {
    const stripped = hex.slice(2);
    const firstWord = stripped.slice(0, 64);
    const firstWordInt = parseInt(firstWord, 16);

    if (firstWordInt === 32 || firstWordInt === 64) {
      const offset = firstWordInt * 2;
      if (stripped.length >= offset + 64) {
        const length = parseInt(stripped.slice(offset, offset + 64), 16);
        if (length > 0 && length < 256 && stripped.length >= offset + 64 + length * 2) {
          const bytes = stripped.slice(offset + 64, offset + 64 + length * 2);
          const decoded = Buffer.from(bytes, 'hex').toString('utf8');
          if (/^[\x20-\x7E]+$/.test(decoded)) return decoded;
        }
      }
    }

    const bytes32 = Buffer.from(firstWord, 'hex');
    const nullIdx = bytes32.indexOf(0);
    const trimmed = nullIdx > 0 ? bytes32.slice(0, nullIdx) : bytes32;
    const decoded = trimmed.toString('utf8');
    if (decoded.length > 0 && /^[\x20-\x7E]+$/.test(decoded)) return decoded;

    for (let i = 0; i < Math.min(stripped.length / 64, 4); i++) {
      const word = stripped.slice(i * 64, (i + 1) * 64);
      const wordBytes = Buffer.from(word, 'hex');
      const wordNull = wordBytes.indexOf(0);
      const wordTrimmed = wordNull > 0 ? wordBytes.slice(0, wordNull) : wordBytes;
      const wordDecoded = wordTrimmed.toString('utf8');
      if (wordDecoded.length >= 2 && /^[\x20-\x7E]+$/.test(wordDecoded)) return wordDecoded;
    }

    return null;
  } catch { return null; }
}

const KNOWN_SELECTORS = {
  '06fdde03': 'name()',
  '95d89b41': 'symbol()',
  '313ce567': 'decimals()',
  '18160ddd': 'totalSupply()',
  '70a08231': 'balanceOf(address)',
  'dd62ed3e': 'allowance(address,address)',
  'a9059cbb': 'transfer(address,uint256)',
  '23b872dd': 'transferFrom(address,address,uint256)',
  '095ea7b3': 'approve(address,uint256)',
  '8da5cb5b': 'owner()',
  '5c975abb': 'paused()',
  'f2fde38b': 'transferOwnership(address)',
  '715018a6': 'renounceOwnership()',
  '3644e515': 'DOMAIN_SEPARATOR()',
  'd505accf': 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
};

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

async function executeTask(taskType, input) {
  const startTime = Date.now();

  try {
    let result;
    switch (taskType) {
      case 'contract_analysis':
        result = await analyzeContract(input);
        break;
      case 'token_lookup':
        result = await tokenLookup(input);
        break;
      case 'wallet_check':
        result = await walletCheck(input);
        break;
      case 'gas_estimate':
        result = await gasEstimate(input);
        break;
      case 'block_info':
        result = await blockInfo(input);
        break;
      case 'tx_trace':
        result = await txTrace(input);
        break;
      default:
        result = {
          status: 'completed',
          output: `Task type "${taskType}" executed`,
          input: input || '',
          note: `Supported types: contract_analysis, token_lookup, wallet_check, gas_estimate, block_info, tx_trace`,
        };
    }
    result.duration_ms = Date.now() - startTime;
    result.executedAt = new Date().toISOString();
    return result;
  } catch (err) {
    return {
      status: 'failed',
      error: err.message,
      input: input || '',
      executedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    };
  }
}

async function getUsdcBalance(address) {
  try {
    const paddedAddr = address.slice(2).toLowerCase().padStart(64, '0');
    const callData = '0x70a08231' + paddedAddr;
    const result = await rpcCall('eth_call', [{ to: USDC_BASE, data: callData }, 'latest']);
    if (result && result !== '0x') {
      return Number(BigInt(result)) / 1e6;
    }
  } catch {}
  return null;
}

async function analyzeContract(address) {
  if (!address || !address.startsWith('0x')) {
    address = USDC_BASE;
  }

  const [code, balance, txCount, block] = await Promise.all([
    rpcCall('eth_getCode', [address, 'latest']),
    rpcCall('eth_getBalance', [address, 'latest']),
    rpcCall('eth_getTransactionCount', [address, 'latest']),
    rpcCall('eth_blockNumber'),
  ]);

  const isContract = code && code !== '0x' && code.length > 2;
  const codeSize = isContract ? (code.length - 2) / 2 : 0;

  let tokenInfo = null;
  if (isContract) {
    try {
      const [nameResult, symbolResult, decimalsResult, supplyResult] = await Promise.all([
        rpcCall('eth_call', [{ to: address, data: '0x06fdde03' }, 'latest']).catch(() => null),
        rpcCall('eth_call', [{ to: address, data: '0x95d89b41' }, 'latest']).catch(() => null),
        rpcCall('eth_call', [{ to: address, data: '0x313ce567' }, 'latest']).catch(() => null),
        rpcCall('eth_call', [{ to: address, data: '0x18160ddd' }, 'latest']).catch(() => null),
      ]);

      const name = decodeString(nameResult);
      const symbol = decodeString(symbolResult);
      const decimals = decimalsResult && decimalsResult !== '0x' ? parseInt(decimalsResult, 16) : null;
      const totalSupplyRaw = supplyResult && supplyResult !== '0x' ? BigInt(supplyResult) : null;
      let totalSupply = null;
      if (totalSupplyRaw !== null && decimals !== null) {
        totalSupply = (Number(totalSupplyRaw / BigInt(10 ** Math.max(0, decimals - 2))) / 100).toLocaleString();
      } else if (totalSupplyRaw !== null) {
        totalSupply = totalSupplyRaw.toString();
      }

      if (name || symbol) {
        tokenInfo = {};
        if (name) tokenInfo.name = name;
        if (symbol) tokenInfo.symbol = symbol;
        if (decimals !== null) tokenInfo.decimals = decimals;
        if (totalSupply) tokenInfo.total_supply = totalSupply;
      }
    } catch {}
  }

  const detectedSelectors = [];
  if (isContract) {
    for (const [sel, fn] of Object.entries(KNOWN_SELECTORS)) {
      if (code.includes(sel)) {
        detectedSelectors.push(fn);
      }
    }
  }

  const isErc20 = detectedSelectors.includes('transfer(address,uint256)') && detectedSelectors.includes('balanceOf(address)');

  const result = {
    status: 'completed',
    chain: 'Base Mainnet',
    address,
    type: isContract ? (isErc20 ? 'ERC-20 Token Contract' : 'Smart Contract') : 'EOA (Wallet)',
    bytecode_size: isContract ? `${codeSize.toLocaleString()} bytes` : 'N/A',
    eth_balance: `${weiToEth(balance).toFixed(6)} ETH`,
    transaction_count: hexToDecimal(txCount),
    block_analyzed: hexToDecimal(block),
  };

  if (tokenInfo) {
    result.token_name = tokenInfo.name || 'Unknown';
    result.token_symbol = tokenInfo.symbol || 'Unknown';
    if (tokenInfo.decimals !== undefined) result.token_decimals = tokenInfo.decimals;
    if (tokenInfo.total_supply) result.token_total_supply = tokenInfo.total_supply;
  }

  if (detectedSelectors.length > 0) {
    result.detected_functions = detectedSelectors;
    result.function_count = detectedSelectors.length;
  }

  result.is_erc20 = isErc20;
  result.basescan = `https://basescan.org/address/${address}`;

  return result;
}

async function tokenLookup(input) {
  let address = input;
  if (!address || !address.startsWith('0x')) {
    const tokenMap = {
      'usdc': USDC_BASE,
      'weth': WETH_BASE,
      'eth': WETH_BASE,
    };
    address = tokenMap[(input || '').toLowerCase()] || USDC_BASE;
  }

  const [nameResult, symbolResult, decimalsResult, supplyResult, code, balance] = await Promise.all([
    rpcCall('eth_call', [{ to: address, data: '0x06fdde03' }, 'latest']).catch(() => null),
    rpcCall('eth_call', [{ to: address, data: '0x95d89b41' }, 'latest']).catch(() => null),
    rpcCall('eth_call', [{ to: address, data: '0x313ce567' }, 'latest']).catch(() => null),
    rpcCall('eth_call', [{ to: address, data: '0x18160ddd' }, 'latest']).catch(() => null),
    rpcCall('eth_getCode', [address, 'latest']).catch(() => null),
    rpcCall('eth_getBalance', [address, 'latest']).catch(() => '0x0'),
  ]);

  const name = decodeString(nameResult);
  const symbol = decodeString(symbolResult);
  const decimals = decimalsResult && decimalsResult !== '0x' ? parseInt(decimalsResult, 16) : null;
  const totalSupplyRaw = supplyResult && supplyResult !== '0x' ? BigInt(supplyResult) : null;
  let totalSupply = null;
  if (totalSupplyRaw !== null && decimals !== null) {
    totalSupply = (Number(totalSupplyRaw / BigInt(10 ** Math.max(0, decimals - 2))) / 100).toLocaleString();
  } else if (totalSupplyRaw !== null) {
    totalSupply = totalSupplyRaw.toString();
  }

  const isContract = code && code !== '0x' && code.length > 2;
  const codeSize = isContract ? (code.length - 2) / 2 : 0;

  const detectedFns = [];
  if (isContract) {
    for (const [sel, fn] of Object.entries(KNOWN_SELECTORS)) {
      if (code.includes(sel)) detectedFns.push(fn);
    }
  }

  const isErc20 = detectedFns.includes('transfer(address,uint256)') && detectedFns.includes('balanceOf(address)');
  const hasPermit = detectedFns.includes('permit(address,address,uint256,uint256,uint8,bytes32,bytes32)');

  const result = {
    status: 'completed',
    chain: 'Base Mainnet',
    address,
    name: name || 'Unknown',
    symbol: symbol || 'Unknown',
    decimals,
    total_supply: totalSupply,
    is_erc20: isErc20,
    has_permit: hasPermit,
    contract_size: `${codeSize.toLocaleString()} bytes`,
    eth_balance: `${weiToEth(balance).toFixed(6)} ETH`,
    function_count: detectedFns.length,
    basescan: `https://basescan.org/token/${address}`,
  };

  return result;
}

async function walletCheck(address) {
  if (!address || !address.startsWith('0x')) {
    return { status: 'failed', error: 'Provide a valid wallet address starting with 0x' };
  }

  const [balance, txCount, code] = await Promise.all([
    rpcCall('eth_getBalance', [address, 'latest']),
    rpcCall('eth_getTransactionCount', [address, 'latest']),
    rpcCall('eth_getCode', [address, 'latest']),
  ]);

  const usdcBalance = await getUsdcBalance(address);
  const isContract = code && code !== '0x' && code.length > 2;

  return {
    status: 'completed',
    chain: 'Base Mainnet',
    address,
    type: isContract ? 'Smart Contract / Smart Wallet' : 'EOA (Regular Wallet)',
    eth_balance: `${weiToEth(balance).toFixed(6)} ETH`,
    usdc_balance: usdcBalance !== null ? `${usdcBalance.toFixed(2)} USDC` : 'unable to fetch',
    transaction_count: hexToDecimal(txCount),
    basescan: `https://basescan.org/address/${address}`,
  };
}

async function gasEstimate(input) {
  const [gasPrice, block] = await Promise.all([
    rpcCall('eth_gasPrice'),
    rpcCall('eth_getBlockByNumber', ['latest', false]),
  ]);

  const gasPriceGwei = Number(BigInt(gasPrice)) / 1e9;
  const baseFee = block.baseFeePerGas ? Number(BigInt(block.baseFeePerGas)) / 1e9 : null;

  const transferGas = 21000;
  const erc20Gas = 65000;
  const swapGas = 180000;
  const nftMint = 120000;

  const costEth = (gas) => (gasPriceGwei * gas / 1e9).toFixed(8);

  const utilization = (hexToDecimal(block.gasUsed) / hexToDecimal(block.gasLimit)) * 100;

  return {
    status: 'completed',
    chain: 'Base Mainnet',
    block_number: hexToDecimal(block.number),
    timestamp: new Date(hexToDecimal(block.timestamp) * 1000).toISOString(),
    gas_price: `${gasPriceGwei.toFixed(4)} Gwei`,
    base_fee: baseFee ? `${baseFee.toFixed(4)} Gwei` : null,
    cost_estimates: {
      eth_transfer: `${costEth(transferGas)} ETH (${transferGas.toLocaleString()} gas)`,
      erc20_transfer: `${costEth(erc20Gas)} ETH (${erc20Gas.toLocaleString()} gas)`,
      nft_mint: `${costEth(nftMint)} ETH (${nftMint.toLocaleString()} gas)`,
      dex_swap: `${costEth(swapGas)} ETH (${swapGas.toLocaleString()} gas)`,
    },
    block_gas_used: hexToDecimal(block.gasUsed).toLocaleString(),
    block_gas_limit: hexToDecimal(block.gasLimit).toLocaleString(),
    utilization: `${utilization.toFixed(1)}%`,
    txns_in_block: block.transactions.length,
  };
}

async function blockInfo(input) {
  let blockTag = 'latest';
  if (input && /^\d+$/.test(input)) {
    blockTag = '0x' + parseInt(input).toString(16);
  }

  const block = await rpcCall('eth_getBlockByNumber', [blockTag, false]);

  const gasUsed = hexToDecimal(block.gasUsed);
  const gasLimit = hexToDecimal(block.gasLimit);

  return {
    status: 'completed',
    chain: 'Base Mainnet',
    block_number: hexToDecimal(block.number),
    hash: block.hash,
    parent_hash: block.parentHash,
    timestamp: new Date(hexToDecimal(block.timestamp) * 1000).toISOString(),
    transaction_count: block.transactions.length,
    gas_used: gasUsed.toLocaleString(),
    gas_limit: gasLimit.toLocaleString(),
    utilization: `${((gasUsed / gasLimit) * 100).toFixed(1)}%`,
    base_fee: block.baseFeePerGas ? `${(Number(BigInt(block.baseFeePerGas)) / 1e9).toFixed(4)} Gwei` : null,
    miner: block.miner,
    basescan: `https://basescan.org/block/${hexToDecimal(block.number)}`,
  };
}

async function txTrace(txHash) {
  if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
    return { status: 'failed', error: 'Provide a valid transaction hash (0x... 66 chars)' };
  }

  const [tx, receipt] = await Promise.all([
    rpcCall('eth_getTransactionByHash', [txHash]),
    rpcCall('eth_getTransactionReceipt', [txHash]),
  ]);

  if (!tx) return { status: 'failed', error: 'Transaction not found on Base Mainnet' };

  const value = tx.value ? weiToEth(tx.value) : 0;
  const gasUsed = receipt ? hexToDecimal(receipt.gasUsed) : null;
  const gasPrice = tx.gasPrice ? Number(BigInt(tx.gasPrice)) / 1e9 : null;
  const fee = gasUsed && gasPrice ? (gasUsed * gasPrice / 1e9) : null;

  const inputSize = tx.input ? (tx.input.length - 2) / 2 : 0;
  let methodSig = null;
  if (tx.input && tx.input.length >= 10) {
    const selector = tx.input.slice(2, 10);
    methodSig = KNOWN_SELECTORS[selector] || `0x${selector}`;
  }

  return {
    status: 'completed',
    chain: 'Base Mainnet',
    tx_hash: txHash,
    from: tx.from,
    to: tx.to || 'Contract Creation',
    value: `${value.toFixed(6)} ETH`,
    method: methodSig || (inputSize === 0 ? 'ETH Transfer' : 'Contract Call'),
    gas_used: gasUsed ? gasUsed.toLocaleString() : null,
    gas_price: gasPrice ? `${gasPrice.toFixed(4)} Gwei` : null,
    fee: fee ? `${fee.toFixed(8)} ETH` : null,
    block_number: tx.blockNumber ? hexToDecimal(tx.blockNumber) : null,
    success: receipt ? (receipt.status === '0x1' ? 'Yes' : 'No (Reverted)') : 'Pending',
    logs_count: receipt ? receipt.logs.length : null,
    input_data: `${inputSize.toLocaleString()} bytes`,
    basescan: `https://basescan.org/tx/${txHash}`,
  };
}

module.exports = { executeTask };
