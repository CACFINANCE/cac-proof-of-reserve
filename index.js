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
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

let provider;
let bscProvider;

try {
  provider = new ethers.JsonRpcProvider(RPC_URL);
} catch (err) {
  console.error('❌ Ethereum RPC init failed:', err.message);
  provider = null;
}

try {
  bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
} catch (err) {
  console.error('❌ BSC RPC init failed:', err.message);
  bscProvider = null;
}

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// ========================================
// CACHE CONFIGURATION - INCREASED TO 5 MINUTES
// ========================================
let cachedPrice = null;
let lastPriceUpdate = 0;
const PRICE_CACHE_DURATION = 300000; // 5 minutes

let cachedPortfolioData = null;
let lastPortfolioFetch = 0;
const PORTFOLIO_CACHE_DURATION = 300000; // 5 minutes

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

async function fetchAllBalances() {
  const results = {};

  // BTC
  try {
    console.log('Fetching BTC balance...');
    const btcRes = await axios.get(`https://blockstream.info/api/address/${wallets.btc}`, { timeout: 10000 });
    results.btc = btcRes.data.chain_stats.funded_txo_sum / 1e8 - btcRes.data.chain_stats.spent_txo_sum / 1e8;
    console.log(`✓ BTC: ${results.btc}`);
  } catch (err) {
    console.error('❌ BTC error:', err.message);
    results.btc = 0;
  }

  // ETH
  try {
    console.log('Fetching ETH balance...');
    if (!provider) throw new Error('No RPC provider');
    
    const balance = await provider.getBalance(wallets.eth);
    results.eth = parseFloat(ethers.formatEther(balance));
    console.log(`✓ ETH: ${results.eth}`);
  } catch (err) {
    console.error('❌ ETH error:', err.message);
    results.eth = 0;
  }

  // TRX - with retry logic
  try {
    console.log('Fetching TRX balance...');
    const trxRes = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${wallets.trx}`, { 
      timeout: 10000,
      headers: { 'User-Agent': 'CAC-Reserve-API' }
    });
    results.trx = trxRes.data.balance / 1e6;
    console.log(`✓ TRX: ${results.trx}`);
  } catch (err) {
    if (err.response?.status === 429) {
      console.error('⚠️ TRX rate limited, using 0');
    } else {
      console.error('❌ TRX error:', err.message);
    }
    results.trx = 0;
  }

  // XRP
  try {
    console.log('Fetching XRP balance...');
    const xrpRes = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [{ account: wallets.xrp, ledger_index: 'validated', strict: true }]
    }, { timeout: 10000 });
    results.xrp = xrpRes.data.result.account_data.Balance / 1e6;
    console.log(`✓ XRP: ${results.xrp}`);
  } catch (err) {
    console.error('❌ XRP error:', err.message);
    results.xrp = 0;
  }

  // USDC Allocation
  try {
    console.log('Fetching USDC Allocation...');
    if (!provider) throw new Error('No RPC provider');
    
    const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
    const balance = await usdcContract.balanceOf(wallets.usdcAllocation);
    results.usdcAllocation = parseFloat(ethers.formatUnits(balance, 6));
    console.log(`✓ USDC Allocation: ${results.usdcAllocation}`);
  } catch (err) {
    console.error('❌ USDC Allocation error:', err.message);
    results.usdcAllocation = 0;
  }

  // USDC Treasury
  try {
    console.log('Fetching USDC Treasury...');
    if (!provider) throw new Error('No RPC provider');
    
    const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
    const balance = await usdcContract.balanceOf(wallets.usdcTreasury);
    results.usdcTreasury = parseFloat(ethers.formatUnits(balance, 6));
    console.log(`✓ USDC Treasury: ${results.usdcTreasury}`);
  } catch (err) {
    console.error('❌ USDC Treasury error:', err.message);
    results.usdcTreasury = 0;
  }

  // SOL
  try {
    console.log('Fetching SOL balance...');
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
    console.log(`✓ SOL: ${results.sol}`);
  } catch (err) {
    console.error('❌ SOL error:', err.message);
    results.sol = 0;
  }

  // BNB
  try {
    console.log('Fetching BNB balance...');
    if (!bscProvider) throw new Error('No BSC RPC provider');
    
    const balance = await bscProvider.getBalance(wallets.bnb);
    results.bnb = parseFloat(ethers.formatEther(balance));
    console.log(`✓ BNB: ${results.bnb}`);
  } catch (err) {
    console.error('❌ BNB error:', err.message);
    results.bnb = 0;
  }

  // CRITICAL: Add combined USDC for backwards compatibility
  results.usdc = results.usdcAllocation + results.usdcTreasury;
  console.log(`✓ Total USDC: ${results.usdc}`);

  console.log('========================================');
  console.log('Final balances:', results);
  console.log('========================================');
  return results;
}

async function fetchPrices() {
  const ids = 'bitcoin,ethereum,binancecoin,usd-coin,ripple,solana,tron';
  console.log('Fetching prices from CoinGecko...');
  
  const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: { ids, vs_currencies: 'usd' },
    timeout: 20000 // Increased timeout
  });
  
  console.log('✓ Prices fetched');
  return response.data;
}

async function fetchCACSupply() {
  console.log('Fetching CAC supply...');
  
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
      console.log('✓ CAC supply:', supply);
      return supply;
    }
    throw new Error('Invalid Etherscan response');
    
  } catch (error) {
    console.warn('⚠️ Etherscan failed, trying Ethplorer...');
    
    const response = await axios.get(`https://api.ethplorer.io/getTokenInfo/${CAC_CONTRACT}`, {
      params: { apiKey: 'freekey' },
      timeout: 10000
    });
    
    if (response.data.totalSupply) {
      const supply = parseFloat(response.data.totalSupply) / 1e8;
      console.log('✓ CAC supply from Ethplorer:', supply);
      return supply;
    }
    
    throw new Error('Failed to fetch CAC supply');
  }
}

// ========================================
// API ENDPOINTS
// ========================================

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

app.get('/api/balances', async (req, res) => {
  const now = Date.now();
  const cacheAge = now - lastPortfolioFetch;
  
  // Return cached if available
  if (cachedPortfolioData && cacheAge < PORTFOLIO_CACHE_DURATION) {
    console.log(`✓ Serving cached balances (${Math.floor(cacheAge / 1000)}s old)`);
    return res.json({
      ...cachedPortfolioData.balances,
      _cached: true,
      _age: Math.floor(cacheAge / 1000)
    });
  }
  
  try {
    const results = await fetchAllBalances();
    
    // Update cache
    if (!cachedPortfolioData) cachedPortfolioData = {};
    cachedPortfolioData.balances = results;
    lastPortfolioFetch = now;
    
    res.json(results);
  } catch (error) {
    console.error('Error in /api/balances:', error.message);
    
    // Return stale cache if available
    if (cachedPortfolioData?.balances) {
      return res.json({
        ...cachedPortfolioData.balances,
        _cached: true,
        _stale: true,
        _error: error.message
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/portfolio-data', async (req, res) => {
  const now = Date.now();
  const cacheAge = now - lastPortfolioFetch;
  
  if (cachedPortfolioData && cacheAge < PORTFOLIO_CACHE_DURATION) {
    console.log(`✓ Serving cached portfolio (${Math.floor(cacheAge / 1000)}s old)`);
    return res.json({
      ...cachedPortfolioData,
      cached: true,
      age: Math.floor(cacheAge / 1000)
    });
  }
  
  console.log('Fetching fresh portfolio data...');
  
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
    
    console.log('✓ Portfolio cached');
    
    res.json({
      ...cachedPortfolioData,
      cached: false,
      age: 0
    });
    
  } catch (error) {
    console.error('❌ Portfolio fetch error:', error.message);
    
    if (cachedPortfolioData) {
      console.log('⚠️ Returning stale cache');
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

app.get('/api/update-price', async (req, res) => {
  const now = Date.now();
  
  if (cachedPrice && (now - lastPriceUpdate) < PRICE_CACHE_DURATION) {
    console.log(`Serving cached price (${Math.floor((now - lastPriceUpdate) / 1000)}s old): ${cachedPrice}`);
    return res.json({ 
      price: cachedPrice, 
      cached: true, 
      age: Math.floor((now - lastPriceUpdate) / 1000) 
    });
  }
  
  console.log('Calculating CAC price...');
  
  try {
    const price = await calculateUsdPerCac();
    cachedPrice = price.toFixed(6);
    lastPriceUpdate = now;

    fs.writeFileSync('cac-price.json', JSON.stringify({
      price: cachedPrice,
      updatedAt: new Date().toISOString()
    }));

    console.log(`✓ Price updated: ${cachedPrice}`);
    res.json({ price: cachedPrice, updated: true });
    
  } catch (err) {
    console.error('❌ Price calculation failed:', err.message);
    
    if (cachedPrice) {
      console.log(`⚠️ Serving cached price: ${cachedPrice}`);
      res.json({ price: cachedPrice, updated: false, cached: true, error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to calculate price' });
    }
  }
});

app.get('/api/cache-status', (req, res) => {
  const now = Date.now();
  
  res.json({
    portfolio: {
      cached: !!cachedPortfolioData,
      age: cachedPortfolioData ? Math.floor((now - lastPortfolioFetch) / 1000) : null,
      isStale: cachedPortfolioData ? (now - lastPortfolioFetch) > PORTFOLIO_CACHE_DURATION : null
    },
    cacPrice: {
      cached: !!cachedPrice,
      price: cachedPrice,
      age: cachedPrice ? Math.floor((now - lastPriceUpdate) / 1000) : null,
      isStale: cachedPrice ? (now - lastPriceUpdate) > PRICE_CACHE_DURATION : null
    },
    cacheDuration: PORTFOLIO_CACHE_DURATION / 1000
  });
});

app.post('/api/refresh-cache', (req, res) => {
  console.log('Manual cache refresh');
  lastPortfolioFetch = 0;
  lastPriceUpdate = 0;
  res.json({ success: true, message: 'Cache cleared' });
});

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 CAC Reserve API on port ${PORT}`);
  console.log(`📊 Cache: ${PORTFOLIO_CACHE_DURATION / 1000}s`);
  console.log(`========================================`);
});
