const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const { ethers } = require('ethers');
const { calculateUsdPerCac } = require('./updatePrice');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const wallets = {
  btc: 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7',
  eth: '0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb',
  trx: 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy',
  xrp: 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf',
  usdc: '0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266',
  sol: 'C566EL3iLEmEm8GETMzHDQwMPwWmxwiuwnskDyKZpT7u',
  render: 'C5oLMbkgPHig7YX6yZwiXnpxkPyiNYMYnjz7wLbsCnL1',
  kaspa: 'kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd'
};

const RPC_URL = process.env.RPC_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const provider = new ethers.JsonRpcProvider(RPC_URL);

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Proxy endpoint for USDC balance
app.get('/api/usdc-balance', async (req, res) => {
  try {
    const usdc = new ethers.Contract("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", ERC20_ABI, provider);
    const balance = await usdc.balanceOf(wallets.usdc);
    const decimals = await usdc.decimals();
    const formatted = parseFloat(ethers.formatUnits(balance, decimals));
    res.json({ balance: formatted });
  } catch (err) {
    console.error('USDC balance proxy error:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch USDC balance' });
  }
});

app.get('/api/balances', async (req, res) => {
  const results = {};

  try {
    const btcRes = await axios.get(`https://blockstream.info/api/address/${wallets.btc}`);
    results.btc = btcRes.data.chain_stats.funded_txo_sum / 1e8 - btcRes.data.chain_stats.spent_txo_sum / 1e8;
  } catch {
    results.btc = null;
  }

  try {
    const ethRes = await axios.get(
      `https://api.etherscan.io/api?module=account&action=balance&address=${wallets.eth}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`
    );
    results.eth = parseFloat(ethRes.data.result) / 1e18;
  } catch {
    results.eth = null;
  }

  try {
    const trxRes = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${wallets.trx}`);
    results.trx = trxRes.data.balance / 1e6;
  } catch {
    results.trx = null;
  }

  try {
    const xrpRes = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [{ account: wallets.xrp, ledger_index: 'validated', strict: true }]
    });
    results.xrp = xrpRes.data.result.account_data.Balance / 1e6;
  } catch {
    results.xrp = null;
  }

  // Use proxy endpoint for USDC balance
  try {
    const usdcProxyRes = await axios.get(`http://localhost:${PORT}/api/usdc-balance`);
    results.usdc = usdcProxyRes.data.balance;
  } catch {
    results.usdc = null;
  }

  try {
    const solanaRes = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [wallets.sol]
      }
    );
    results.sol = solanaRes.data.result.value / 1e9;
  } catch {
    results.sol = null;
  }

  try {
    const renderRes = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          wallets.render,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      }
    );

    const accounts = renderRes.data.result.value;
    const mint = 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof';
    let totalRender = 0;

    for (const acc of accounts) {
      const info = acc.account.data.parsed.info;
      if (info.mint === mint) {
        totalRender += parseFloat(info.tokenAmount.uiAmount);
      }
    }

    results.rndr = totalRender;
  } catch {
    results.rndr = null;
  }

  try {
    const kaspaRes = await axios.get(`https://api.kaspa.org/addresses/${wallets.kaspa}/balance`);
    results.kaspa = kaspaRes.data.balance / 1e8;
  } catch {
    results.kaspa = null;
  }

  res.json(results);
});

app.get('/api/update-price', async (req, res) => {
  try {
    const price = await calculateUsdPerCac();
    res.json({ price: price.toFixed(6) });
  } catch {
    res.status(500).json({ error: 'Failed to calculate CAC price.' });
  }
});

app.listen(PORT, () => {
  console.log(`CAC Proof-of-Reserve Backend running on port ${PORT}`);
});
