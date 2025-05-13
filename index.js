const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// WALLET ADDRESSES
const wallets = {
  BTC: 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7',
  ETH: '0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb',
  USDC: '0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266',
  TRX: 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy',
  XRP: 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf',
  KASPA: 'kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd',
  PAXG: '0x5968364A1e1aF7fAEbf8c8AD9805709eF4beb936',
  SOL: 'C566EL3iLEmEm8GETMzHDQwMPwWmxwiuwnskDyKZpT7u',
  RENDER: 'C5oLMbkgPHig7YX6yZwiXnpxkPyiNYMYnjz7wLbsCnL1'
};

// Root route - for health check
app.get('/', (req, res) => {
  res.send('CAC Proof-of-Reserve Backend is running.');
});

// Proof-of-Reserve API Route
app.get('/api/balances', async (req, res) => {
  try {
    const [
      btc, eth, usdc, trx, xrp,
      kaspa, paxg, sol, render
    ] = await Promise.all([
      fetchBTC(),
      fetchETH(),
      fetchUSDC(),
      fetchTRX(),
      fetchXRP(),
      fetchKASPA(),
      fetchPAXG(),
      fetchSOL(),
      fetchRENDER()
    ]);

    res.json({
      BTC: btc,
      ETH: eth,
      USDC: usdc,
      TRX: trx,
      XRP: xrp,
      KASPA: kaspa,
      PAXG: paxg,
      SOL: sol,
      RENDER: render
    });
  } catch (error) {
    console.error('Balance fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

// === INDIVIDUAL FETCH FUNCTIONS ===

async function fetchBTC() {
  const url = `https://api.blockchair.com/bitcoin/dashboards/address/${wallets.BTC}?key=${process.env.BLOCKCHAIR_API_KEY}`;
  const res = await axios.get(url);
  const satoshis = res.data.data[wallets.BTC].address.balance;
  return satoshis / 1e8;
}

async function fetchETH() {
  const url = `https://api.blockchair.com/ethereum/dashboards/address/${wallets.ETH}?key=${process.env.BLOCKCHAIR_API_KEY}`;
  const res = await axios.get(url);
  const wei = res.data.data[wallets.ETH].address.balance;
  return wei / 1e18;
}

async function fetchUSDC() {
  const url = `https://api.covalenthq.com/v1/1/address/${wallets.USDC}/balances_v2/?key=${process.env.COVALENT_API_KEY}`;
  const res = await axios.get(url);
  const usdc = res.data.data.items.find(t => t.contract_ticker_symbol === 'USDC');
  return usdc ? usdc.balance / 1e6 : 0;
}

async function fetchTRX() {
  const url = `https://apilist.tronscanapi.com/api/account?address=${wallets.TRX}`;
  const res = await axios.get(url);
  return res.data.balance / 1e6;
}

async function fetchXRP() {
  const url = `https://api.xrpscan.com/api/v1/account/${wallets.XRP}`;
  const res = await axios.get(url);
  return res.data.balance / 1e6;
}

async function fetchKASPA() {
  const address = wallets.KASPA.replace('kaspa:', '');
  const url = `https://api.kaspa.org/addresses/${address}`;
  const res = await axios.get(url);
  return res.data.balance / 1e8;
}

async function fetchPAXG() {
  const url = `https://api.covalenthq.com/v1/1/address/${wallets.PAXG}/balances_v2/?key=${process.env.COVALENT_API_KEY}`;
  const res = await axios.get(url);
  const paxg = res.data.data.items.find(t => t.contract_ticker_symbol === 'PAXG');
  return paxg ? paxg.balance / 1e18 : 0;
}

async function fetchSOL() {
  const url = `https://api.helius.xyz/v0/addresses/${wallets.SOL}/balances?api-key=${process.env.HELIUS_API_KEY}`;
  const res = await axios.get(url);
  const sol = res.data.nativeBalance;
  return sol ? sol.lamports / 1e9 : 0;
}

async function fetchRENDER() {
  const url = `https://api.helius.xyz/v0/addresses/${wallets.RENDER}/tokens?api-key=${process.env.HELIUS_API_KEY}`;
  const res = await axios.get(url);
  const render = res.data.find(t => t.tokenInfo.symbol === 'RNDR');
  return render ? render.tokenAmount.uiAmount : 0;
}

// Start the server
app.listen(PORT, () => {
  console.log(`✅ CAC Proof-of-Reserve Backend is running on port ${PORT}`);
});
