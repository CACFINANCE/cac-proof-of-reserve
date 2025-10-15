const express = require('express'); 
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const { ethers } = require('ethers');
const { calculateUsdPerCac } = require('./updatePrice');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

const wallets = {
  btc: 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7',
  eth: '0x809B74f23e0E40Ec6ebeBAf9035825328Cec387E',
  trx: 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy',
  xrp: 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf',
  usdcAllocation: '0x809B74f23e0E40Ec6ebeBAf9035825328Cec387E',
  usdcTreasury: '0x2d97f2285bcFBf8c9500FAEaA79e09739c3d8Eaf',
  sol: '6fpb9EqAk35VfCWSSu3Qdp6BCFwZTfLszzdvYBEFuBRH',
  bnb: '0x809B74f23e0E40Ec6ebeBAf9035825328Cec387E'
};

const RPC_URL = process.env.RPC_URL;
const BSC_RPC_URL = process.env.BSC_RPC_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const CAC_CONTRACT = '0x50f3C527e5772BB24897591C20f7430ea8c34437';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// ========================================
// CACHE CONFIGURATION
// ========================================
let cachedPrice = null;
let lastPriceUpdate = 0;
const PRICE_CACHE_DURATION = 60000; // 1 minute

// NEW: Portfolio data cache (shared by all users)
let cachedPortfolioData = null;
let lastPortfolioFetch = 0;
const PORTFOLIO_CACHE_DURATION = 60000; // 1 minute

// Load cached price from disk on startup
try {
  const data = fs.readFileSync('cac-price.json', 'utf-8');
  const parsed = JSON.parse(data);
  if (parsed?.price) {
    cachedPrice = parsed.price;
    console.log(`Loaded cached price: ${cachedPrice}`);
  }
} catch (err) {
  console.log('No cached price file found');
}

// ========================================
// HELPER FUNCTIONS
// ========================================

// Extract balance fetching logic into reusable function
async function fetchAllBalances() {
  const results = {};

  try {
    const btcRes = await axios.get(`https://blockstream.info/api/address/${wallets.btc}`, { timeout: 10000 });
    results.btc = btcRes.data.chain_stats.funded_txo_sum / 1e8 - btcRes.data.chain_stats.spent_txo_sum / 1e8;
    console.log(`BTC balance: ${results.btc} BTC`);
  } catch (err) {
    console.error('BTC balance error:', err.message);
    results.btc = null;
  }

  try {
    const ethRes = await axios.get(`https://api.etherscan.io/v2/api`, {
      params: {
        chainid: 1,
        module: 'account',
        action: 'balance',
        address: wallets.eth,
        tag: 'latest',
        apikey: process.env.ETHERSCAN_API_KEY
      },
      timeout: 10000
    });
    
    if (ethRes.data.status === "1" && ethRes.data.result) {
      const rawBalance = String(ethRes.data.result).trim();
      const ethBalanceWei = BigInt(rawBalance);
      results.eth = parseFloat(ethers.formatEther(ethBalanceWei));
      console.log(`ETH balance: ${results.eth} ETH`);
    } else {
      throw new Error(`Etherscan v2 error: ${ethRes.data.message}`);
    }
  } catch (err) {
    console.error('ETH Etherscan error:', err.message);
    try {
      const balance = await provider.getBalance(wallets.eth);
      results.eth = parseFloat(ethers.formatEther(balance));
      console.log(`ETH balance from RPC: ${results.eth} ETH`);
    } catch (rpcErr) {
      console.error('ETH RPC fallback error:', rpcErr.message);
      results.eth = null;
    }
  }

  try {
    const trxRes = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${wallets.trx}`, { timeout: 10000 });
    results.trx = trxRes.data.balance / 1e6;
    console.log(`TRX balance: ${results.trx} TRX`);
  } catch (err) {
    console.error('TRX balance error:', err.message);
    results.trx = null;
  }

  try {
    const xrpRes = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [{ account: wallets.xrp, ledger_index: 'validated', strict: true }]
    }, { timeout: 10000 });
    results.xrp = xrpRes.data.result.account_data.Balance / 1e6;
    console.log(`XRP balance: ${results.xrp} XRP`);
  } catch (err) {
    console.error('XRP balance error:', err.message);
    results.xrp = null;
  }

  // Fetch USDC Allocation balance
  try {
    const usdc = new ethers.Contract("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", ERC20_ABI, provider);
    const balance = await usdc.balanceOf(wallets.usdcAllocation);
    const decimals = await usdc.decimals();
    results.usdcAllocation = parseFloat(ethers.formatUnits(balance, decimals));
    console.log(`USDC Allocation balance: ${results.usdcAllocation} USDC`);
  } catch (err) {
    console.error('USDC Allocation balance error:', err.message);
    results.usdcAllocation = null;
  }

  // Fetch USDC Treasury balance
  try {
    const usdc = new ethers.Contract("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", ERC20_ABI, provider);
    const balance = await usdc.balanceOf(wallets.usdcTreasury);
    const decimals = await usdc.decimals();
    results.usdcTreasury = parseFloat(ethers.formatUnits(balance, decimals));
    console.log(`USDC Treasury balance: ${results.usdcTreasury} USDC`);
  } catch (err) {
    console.error('USDC Treasury balance error:', err.message);
    results.usdcTreasury = null;
  }

  try {
    const solanaRes = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [wallets.sol]
      },
      { timeout: 10000 }
    );
    results.sol = solanaRes.data.result.value / 1e9;
    console.log(`SOL balance: ${results.sol} SOL`);
  } catch (err) {
    console.error('SOL balance error:', err.message);
    results.sol = null;
  }

  try {
    const bnbRes = await axios.get(`https://api.etherscan.io/v2/api`, {
      params: {
        chainid: 56,
        module: 'account',
        action: 'balance',
        address: wallets.bnb,
        tag: 'latest',
        apikey: process.env.ETHERSCAN_API_KEY
      },
      timeout: 10000
    });

    if (bnbRes.data.status === "1" && bnbRes.data.result) {
      results.bnb = parseFloat(ethers.formatEther(bnbRes.data.result));
      console.log(`BNB balance: ${results.bnb} BNB`);
    } else {
      const balance = await bscProvider.getBalance(wallets.bnb);
      results.bnb = parseFloat(ethers.formatEther(balance));
      console.log(`BNB balance from RPC: ${results.bnb} BNB`);
    }
  } catch (err) {
    console.error('BNB balance error:', err.message);
    try {
      const balance = await bscProvider.getBalance(wallets.bnb);
      results.bnb = parseFloat(ethers.formatEther(balance));
      console.log(`BNB balance from RPC fallback: ${results.bnb} BNB`);
    } catch (err2) {
      console.error('BNB fallback error:', err2.message);
      results.bnb = null;
    }
  }

  console.log('Final balances:', results);
  return results;
}

// Fetch prices from CoinGecko
async function fetchPrices() {
  const ids = 'bitcoin,ethereum,binancecoin,usd-coin,ripple,solana,tron';
  console.log('Fetching prices from CoinGecko...');
  
  const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: { ids, vs_currencies: 'usd' },
    timeout: 15000
  });
  
  console.log('✓ Prices fetched');
  return response.data;
}

// Fetch CAC total supply
async function fetchCACSupply() {
  console.log('Fetching CAC total supply...');
  
  try {
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: 1,
        module: 'stats',
        action: 'tokensupply',
        contractaddress: CAC_CONTRACT,
        apikey: process.env.ETHERSCAN_API_KEY
      },
      timeout: 10000
    });
    
    if (response.data.status === "1" && response.data.result) {
      const supply = parseFloat(ethers.formatUnits(response.data.result, 8));
      console.log('✓ CAC supply fetched:', supply);
      return supply;
    }
    throw new Error('Invalid Etherscan response');
    
  } catch (error) {
    console.warn('Etherscan failed, trying Ethplorer...');
    
    const response = await axios.get(`https://api.ethplorer.io/getTokenInfo/${CAC_CONTRACT}`, {
      params: { apiKey: 'freekey' },
      timeout: 10000
    });
    
    if (response.data.totalSupply) {
      const supply = parseFloat(response.data.totalSupply) / 1e8;
      console.log('✓ CAC supply fetched from Ethplorer:', supply);
      return supply;
    }
    
    throw new Error('Failed to fetch CAC supply from all sources');
  }
}

// ========================================
// API ENDPOINTS
// ========================================

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'CAC Reserve API',
    endpoints: {
      balances: '/api/balances',
      portfolioData: '/api/portfolio-data',
      updatePrice: '/api/update-price',
      cacheStatus: '/api/cache-status'
    }
  });
});

// Original balances endpoint (kept for backwards compatibility)
app.get('/api/balances', async (req, res) => {
  try {
    const results = await fetchAllBalances();
    res.json(results);
  } catch (error) {
    console.error('Error in /api/balances:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// NEW: Cached portfolio data endpoint (ALL USERS GET SAME DATA)
app.get('/api/portfolio-data', async (req, res) => {
  const now = Date.now();
  const cacheAge = now - lastPortfolioFetch;
  
  // Return cached data if still fresh
  if (cachedPortfolioData && cacheAge < PORTFOLIO_CACHE_DURATION) {
    console.log(`✓ Serving cached portfolio data (${Math.floor(cacheAge / 1000)}s old)`);
    return res.json({
      ...cachedPortfolioData,
      cached: true,
      age: Math.floor(cacheAge / 1000)
    });
  }
  
  // Fetch fresh data
  console.log('Cache expired, fetching fresh portfolio data...');
  
  try {
    const [balances, prices, cacSupply] = await Promise.all([
      fetchAllBalances(),
      fetchPrices(),
      fetchCACSupply()
    ]);
    
    cachedPortfolioData = {
      balances,
      prices,
      cacSupply,
      timestamp: now
    };
    lastPortfolioFetch = now;
    
    console.log('✓ Portfolio data cached successfully');
    
    res.json({
      ...cachedPortfolioData,
      cached: false,
      age: 0
    });
    
  } catch (error) {
    console.error('Error fetching portfolio data:', error.message);
    
    // Return stale cache if available
    if (cachedPortfolioData) {
      console.log('Returning stale cache due to error');
      return res.json({
        ...cachedPortfolioData,
        cached: true,
        stale: true,
        age: Math.floor(cacheAge / 1000),
        error: error.message
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// CAC Price endpoint (already existed, keeping your version)
app.get('/api/update-price', async (req, res) => {
  const now = Date.now();
  
  // Return cached price if updated recently
  if (cachedPrice && (now - lastPriceUpdate) < PRICE_CACHE_DURATION) {
    console.log(`Serving cached price (${Math.floor((now - lastPriceUpdate) / 1000)}s old): ${cachedPrice}`);
    return res.json({ 
      price: cachedPrice, 
      cached: true, 
      age: Math.floor((now - lastPriceUpdate) / 1000) 
    });
  }
  
  console.log('Price update requested...');
  
  try {
    const price = await calculateUsdPerCac();
    cachedPrice = price.toFixed(6);
    lastPriceUpdate = now;

    fs.writeFileSync('cac-price.json', JSON.stringify({
      price: cachedPrice,
      updatedAt: new Date().toISOString()
    }));

    console.log(`Price updated successfully: ${cachedPrice}`);
    res.json({ price: cachedPrice, updated: true });
    
  } catch (err) {
    console.error('Price calculation failed:', err.message);
    
    if (cachedPrice) {
      console.log(`Serving cached price after error: ${cachedPrice}`);
      res.json({ price: cachedPrice, updated: false, cached: true, error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to calculate CAC price and no cache available.' });
    }
  }
});

// NEW: Cache status endpoint (for debugging)
app.get('/api/cache-status', (req, res) => {
  const now = Date.now();
  
  res.json({
    portfolio: {
      cached: !!cachedPortfolioData,
      age: cachedPortfolioData ? Math.floor((now - lastPortfolioFetch) / 1000) : null,
      isStale: cachedPortfolioData ? (now - lastPortfolioFetch) > PORTFOLIO_CACHE_DURATION : null,
      lastFetch: lastPortfolioFetch ? new Date(lastPortfolioFetch).toISOString() : null
    },
    cacPrice: {
      cached: !!cachedPrice,
      price: cachedPrice,
      age: cachedPrice ? Math.floor((now - lastPriceUpdate) / 1000) : null,
      isStale: cachedPrice ? (now - lastPriceUpdate) > PRICE_CACHE_DURATION : null,
      lastFetch: lastPriceUpdate ? new Date(lastPriceUpdate).toISOString() : null
    },
    cacheDuration: PORTFOLIO_CACHE_DURATION / 1000
  });
});

// NEW: Force cache refresh (for manual testing)
app.post('/api/refresh-cache', (req, res) => {
  console.log('Manual cache refresh requested');
  lastPortfolioFetch = 0;
  lastPriceUpdate = 0;
  res.json({ 
    success: true, 
    message: 'Cache cleared. Will refresh on next request.' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 CAC Proof-of-Reserve Backend running on port ${PORT}`);
  console.log(`📊 Portfolio cache duration: ${PORTFOLIO_CACHE_DURATION / 1000} seconds`);
  console.log(`💰 Price cache duration: ${PRICE_CACHE_DURATION / 1000} seconds`);
});
