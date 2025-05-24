require('dotenv').config();
const axios = require('axios');
const Redis = require('ioredis');

// Connect to Upstash Redis
const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
});

const CACHE_KEY = 'cac_price_cache';
const CACHE_TTL = 60; // Cache price for 60 seconds

// Wallet addresses
const solanaWallet = 'C566EL3iLEmEm8GETMzHDQwMPwWmxwiuwnskDyKZpT7u';
const renderWallet = 'C5oLMbkgPHig7YX6yZwiXnpxkPyiNYMYnjz7wLbsCnL1';
const renderMint = 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof';
const btcWallet = 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7';
const ethWallet = '0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb';
const tronWallet = 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy';
const xrpWallet = 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf';
const kasWallet = 'qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd';
const paxgWallet = '0x5968364A1e1aF7fAEbf8c8AD9805709eF4beb936';
const usdcWallet = '0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266';

// API Keys
const COVALENT_API_KEY = process.env.COVALENT_API_KEY;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// --- BALANCE FETCH FUNCTIONS ---

// SOLANA balance via Helius RPC
async function fetchSolanaBalance() {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  try {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [solanaWallet],
    };
    const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
    return res.data.result.value / 1e9;
  } catch (err) {
    console.error('SOL fetch error:', err.message);
    throw new Error('SOL balance fetch failed');
  }
}

// Render token balance on Solana
async function fetchRenderBalance() {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  try {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        renderWallet,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ],
    };
    const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
    const accounts = res.data.result.value;
    let total = 0;
    for (const acc of accounts) {
      const info = acc.account.data.parsed.info;
      if (info.mint === renderMint) {
        total += parseFloat(info.tokenAmount.uiAmount);
      }
    }
    return total;
  } catch (err) {
    console.error('RNDR fetch error:', err.message);
    throw new Error('RNDR balance fetch failed');
  }
}

// USDC balance on Ethereum (via Covalent)
async function fetchUSDCBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${usdcWallet}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const usdcData = res.data.data.items.find((item) => item.contract_ticker_symbol === 'USDC');
    return usdcData ? parseFloat(usdcData.balance) / 1e6 : 0;
  } catch (err) {
    console.error('USDC fetch error:', err.message);
    throw new Error('USDC balance fetch failed');
  }
}

// BTC balance (via BlockCypher)
async function fetchBTCBalance() {
  try {
    const res = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${btcWallet}/balance`);
    return res.data.final_balance / 1e8;
  } catch (err) {
    console.error('BTC fetch error:', err.message);
    throw new Error('BTC balance fetch failed');
  }
}

// ETH balance (via Covalent)
async function fetchETHBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/eth-mainnet/address/${ethWallet}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const ethData = res.data.data.items.find((item) => item.contract_ticker_symbol === 'ETH');
    return ethData ? parseFloat(ethData.balance) / 1e18 : 0;
  } catch (err) {
    console.error('ETH fetch error:', err.message);
    throw new Error('ETH balance fetch failed');
  }
}

// TRX balance (via Tronscan)
async function fetchTRXBalance() {
  try {
    const url = `https://apilist.tronscanapi.com/api/account?address=${tronWallet}`;
    const res = await axios.get(url);
    return parseFloat(res.data.balance) / 1e6;
  } catch (err) {
    console.error('TRX fetch error:', err.message);
    throw new Error('TRX balance fetch failed');
  }
}

// XRP balance (via Ripple API)
async function fetchXRPBalance() {
  try {
    const url = 'https://s1.ripple.com:51234/';
    const res = await axios.post(url, {
      method: 'account_info',
      params: [{ account: xrpWallet, ledger_index: 'validated' }],
    });
    const drops = res.data.result?.account_data?.Balance;
    return drops ? parseFloat(drops) / 1e6 : 0;
  } catch (err) {
    console.error('XRP fetch error:', err.message);
    throw new Error('XRP balance fetch failed');
  }
}

// KASPA balance (via kaspa.org API)
async function fetchKASBalance() {
  try {
    const res = await axios.get(`https://api.kaspa.org/addresses/${kasWallet}`);
    return parseFloat(res.data.balance.confirmed);
  } catch (err) {
    console.error('KASPA fetch error:', err.message);
    throw new Error('KASPA balance fetch failed');
  }
}

// PAXG balance (via Covalent)
async function fetchPAXGBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${paxgWallet}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const paxgData = res.data.data.items.find((item) => item.contract_ticker_symbol === 'PAXG');
    return paxgData ? parseFloat(paxgData.balance) / 1e18 : 0;
  } catch (err) {
    console.error('PAXG fetch error:', err.message);
    throw new Error('PAXG balance fetch failed');
  }
}

// --- PRICE FETCH FUNCTIONS ---

// Fetch price for given CoinGecko id
async function fetchPrice(id) {
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    return res.data[id]?.usd || 0;
  } catch (err) {
    console.error(`Price fetch error for ${id}:`, err.message);
    return 0;
  }
}

// --- CAC PRICE CALCULATION ---

async function calculateUsdPerCac() {
  // Fetch all balances in parallel
  const [
    sol,
    render,
    usdc,
    btc,
    eth,
    trx,
    xrp,
    kas,
    paxg,
  ] = await Promise.all([
    fetchSolanaBalance(),
    fetchRenderBalance(),
    fetchUSDCBalance(),
    fetchBTCBalance(),
    fetchETHBalance(),
    fetchTRXBalance(),
    fetchXRPBalance(),
    fetchKASBalance(),
    fetchPAXGBalance(),
  ]);

  // Fetch all prices in parallel (CoinGecko IDs)
  const [
    solPrice,
    renderPrice,
    usdcPrice,
    btcPrice,
    ethPrice,
    trxPrice,
    xrpPrice,
    kasPrice,
    paxgPrice,
  ] = await Promise.all([
    fetchPrice('solana'),
    fetchPrice('render-token'),
    fetchPrice('usd-coin'),
    fetchPrice('bitcoin'),
    fetchPrice('ethereum'),
    fetchPrice('tron'),
    fetchPrice('ripple'),
    fetchPrice('kaspa'),
    fetchPrice('pax-gold'),
  ]);

  // Calculate total USD value of all assets backing CAC
  const totalUsdValue =
    sol * solPrice +
    render * renderPrice +
    usdc * usdcPrice +
    btc * btcPrice +
    eth * ethPrice +
    trx * trxPrice +
    xrp * xrpPrice +
    kas * kasPrice +
    paxg * paxgPrice;

  // TODO: Replace this with actual CAC total supply fetch from your contract/backend
  // For now, hardcode or fetch externally
  const cacTotalSupply = 1000000; // <-- Replace with real supply

  if (!cacTotalSupply || cacTotalSupply <= 0) {
    throw new Error('Invalid CAC total supply');
  }

  // Calculate CAC price = total backing USD / total supply tokens
  const price = totalUsdValue / cacTotalSupply;

  return { price };
}

// --- REDIS CACHE LAYER ---

async function getCachedCacPrice() {
  try {
    // Try to get cached price
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const { price, timestamp } = JSON.parse(cached);
      // Return cached if fresh
      if (Date.now() - timestamp < CACHE_TTL * 1000) {
        return { price, cached: true };
      }
    }

    // Otherwise calculate fresh price
    const { price } = await calculateUsdPerCac();

    // Cache price with timestamp and TTL
    await redis.set(
      CACHE_KEY,
      JSON.stringify({ price, timestamp: Date.now() }),
      'EX',
      CACHE_TTL
    );

    return { price, cached: false };
  } catch (err) {
    console.error('Error fetching cached price:', err.message);

    // Fallback to last cached price ignoring TTL
    try {
      const fallback = await redis.get(CACHE_KEY);
      if (fallback) {
        const { price, timestamp } = JSON.parse(fallback);
        return { price, cached: true, timestamp };
      }
    } catch (fallbackErr) {
      console.error('Redis fallback error:', fallbackErr.message);
    }

    throw new Error('Failed to get CAC price');
  }
}

module.exports = {
  calculateUsdPerCac,
  getCachedCacPrice,
};
