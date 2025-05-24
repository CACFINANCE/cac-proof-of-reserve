require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Redis = require('ioredis');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Redis setup (Upstash)
const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
});
const CACHE_KEY = 'cached_balances';
const CACHE_TTL = 60; // seconds

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

// (All your fetch functions remain exactly the same, no changes here)

// --- API ROUTE ---
app.get('/api/balances', async (req, res) => {
  const forceRefresh = req.query.force === 'true';

  if (!forceRefresh) {
    try {
      // Try to serve cached balances first if available
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return res.json({ ...parsed, cached: true });
      }
    } catch (err) {
      console.warn('Redis get error:', err.message);
      // continue to fetch fresh if Redis fails
    }
  }

  // Fetch fresh balances
  try {
    const [
      sol, render, usdc, btc, eth,
      trx, xrp, kas, paxg
    ] = await Promise.all([
      fetchSolanaBalance(),
      fetchRenderBalance(),
      fetchUSDCBalance(),
      fetchBTCBalance(),
      fetchETHBalance(),
      fetchTRXBalance(),
      fetchXRPBalance(),
      fetchKASBalance(),
      fetchPAXGBalance()
    ]);

    const balances = {
      SOL: sol,
      RNDR: render,
      USDC: usdc,
      BTC: btc,
      ETH: eth,
      TRX: trx,
      XRP: xrp,
      KAS: kas,
      PAXG: paxg
    };

    // Cache in Redis
    try {
      await redis.set(CACHE_KEY, JSON.stringify(balances), 'EX', CACHE_TTL);
    } catch (err) {
      console.warn('Redis set error:', err.message);
    }

    return res.json(balances);
  } catch (err) {
    console.error('Balance fetch error:', err.message);

    // If fetching fresh fails, try to return cached from Redis one more time
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return res.json({ ...parsed, cached: true });
      }
    } catch (err2) {
      console.warn('Redis fallback error:', err2.message);
    }

    return res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

app.listen(PORT, () => {
  console.log(`CAC Proof-of-Reserve Backend is running on port ${PORT}`);
});
