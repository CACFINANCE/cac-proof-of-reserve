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

async function fetchAllBalances() {
  const results = {};

  // BTC
  try {
    console.log('Fetching BTC balance...');
    const btcRes = await axios.get(`https://blockstream.info/api/address/${wallets.btc}`, { timeout: 10000 });
    results.btc = btcRes.data.chain_stats.funded_txo_sum / 1e8 - btcRes.data.chain_stats.spent_txo_sum / 1e8;
    console.log(`✓ BTC balance: ${results.btc}`);
  } catch (err) {
    console.error('❌ BTC balance error:', err.message);
    results.btc = null;
  }

  // ETH
  try {
    console.log('Fetching ETH balance...');
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
      console.log(`✓ ETH balance: ${results.eth}`);
    } else {
      throw new Error(`Etherscan error: ${ethRes.data.message}`);
    }
  } catch (err) {
    console.error('⚠️ ETH Etherscan error, trying RPC:', err.message);
    try {
      const balance = await provider.getBalance(wallets.eth);
      results.eth = parseFloat(ethers.formatEther(balance));
      console.log(`✓ ETH balance from RPC: ${results.eth}`);
    } catch (rpcErr) {
      console.error('❌ ETH RPC error:', rpcErr.message);
      results.eth = null;
    }
  }

  // TRX
  try {
    console.log('Fetching TRX balance...');
    const trxRes = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${wallets.trx}`, { timeout: 10000 });
    results.trx = trxRes.data.balance / 1e6;
    console.log(`✓ TRX balance: ${results.trx}`);
  } catch (err) {
    console.error('❌ TRX balance error:', err.message);
    results.trx = null;
  }

  // XRP
  try {
    console.log('Fetching XRP balance...');
    const xrpRes = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [{ account: wallets.xrp, ledger_index: 'validated', strict: true }]
    }, { timeout: 10000 });
    results.xrp = xrpRes.data.result.account_data.Balance / 1e6;
    console.log(`✓ XRP balance: ${results.xrp}`);
  } catch (err) {
    console.error('❌ XRP balance error:', err.message);
    results.xrp = null;
  }

  // USDC Allocation
  try {
    console.log('Fetching USDC Allocation balance...');
    const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
    const balance = await usdcContract.balanceOf(wallets.usdcAllocation);
    results.usdcAllocation = parseFloat(ethers.formatUnits(balance, 6));
    console.log(`✓ USDC Allocation: ${results.usdcAllocation}`);
  } catch (err) {
    console.error('❌ USDC Allocation error:', err.message);
    results.usdcAllocation = null;
  }

  // USDC Treasury
  try {
    console.log('Fetching USDC Treasury balance...');
    const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
    const balance = await usdcContract.balanceOf(wallets.usdcTreasury);
    results.usdcTreasury = parseFloat(ethers.formatUnits(balance, 6));
    console.log(`✓ USDC Treasury: ${results.usdcTreasury}`);
  } catch (err) {
    console.error('❌ USDC Treasury error:', err.message);
    results.usdcTreasury = null;
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
    console.log(`✓ SOL balance: ${results.sol}`);
  } catch (err) {
    console.error('❌ SOL balance error:', err.message);
    results.sol = null;
  }

  // BNB
  try {
    console.log('Fetching BNB balance...');
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
      console.log(`✓ BNB balance: ${results.bnb}`);
    } else {
      throw new Error('Etherscan BNB error');
    }
  } catch (err) {
    console.error('⚠️ BNB Etherscan error, trying RPC:', err.message);
    try {
      const balance = await bscProvider.getBalance(wallets.bnb);
      results.bnb = parseFloat(ethers.formatEther(balance));
      console.log(`✓ BNB balance from RPC: ${results.bnb}`);
    } catch (err2) {
      console.error('❌ BNB RPC error:', err2.message);
      results.bnb = null;
    }
  }

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
    timeout: 15000
  });
  
  console.log('✓ Prices fetched successfully');
  return response.data;
}

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
  try {
    const results = await fetchAllBalances();
    res.json(results);
  } catch (error) {
    console.error('Error in /api/balances:', error.message);
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
  
  console.log('Cache expired, fetching fresh data...');
  
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
    
    console.log('✓ Portfolio data cached');
    
    res.json({
      ...cachedPortfolioData,
      cached: false,
      age: 0
    });
    
  } catch (error) {
    console.error('❌ Error fetching portfolio:', error.message);
    
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
  
  console.log('Calculating fresh CAC price...');
  
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
      console.log(`⚠️ Serving cached price after error: ${cachedPrice}`);
      res.json({ price: cachedPrice, updated: false, cached: true, error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to calculate CAC price' });
    }
  }
});

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

app.post('/api/refresh-cache', (req, res) => {
  console.log('Manual cache refresh requested');
  lastPortfolioFetch = 0;
  lastPriceUpdate = 0;
  res.json({ 
    success: true, 
    message: 'Cache cleared' 
  });
});

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 CAC Reserve API running on port ${PORT}`);
  console.log(`📊 Cache duration: ${PORTFOLIO_CACHE_DURATION / 1000}s`);
  console.log(`========================================`);
});
