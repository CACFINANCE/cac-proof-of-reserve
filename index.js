const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const { ethers } = require('ethers');

const { calculateUsdPerCac } = require('./updatePrice');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

const wallets = {
  btc: 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7',
  eth: '0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb',
  trx: 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy',
  xrp: 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf',
  usdc: '0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266',
  paxg: '0x5968364A1e1aF7fAEbf8c8AD9805709eF4beb936',
  sol: 'C566EL3iLEmEm8GETMzHDQwMPwWmxwiuwnskDyKZpT7u',
  render: 'C5oLMbkgPHig7YX6yZwiXnpxkPyiNYMYnjz7wLbsCnL1',
  kaspa: 'kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd'
};

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

app.get('/api/balances', async (req, res) => {
  const results = {};

  try {
    const btcRes = await axios.get(`https://blockstream.info/api/address/${wallets.btc}`);
    results.btc = btcRes.data.chain_stats.funded_txo_sum / 1e8 - btcRes.data.chain_stats.spent_txo_sum / 1e8;
  } catch (err) {
    console.error('BTC fetch error:', err.message);
    results.btc = null;
  }

  try {
    const ethRes = await axios.get(
      `https://api.etherscan.io/api?module=account&action=balance&address=${wallets.eth}&tag=latest&apikey=${ETHERSCAN_API_KEY}`
    );
    results.eth = parseFloat(ethRes.data.result) / 1e18;
  } catch (err) {
    console.error('ETH fetch error:', err.message);
    results.eth = null;
  }

  try {
    const trxRes = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${wallets.trx}`);
    results.trx = trxRes.data.balance / 1e6;
  } catch (err) {
    console.error('TRX fetch error:', err.message);
    results.trx = null;
  }

  try {
    const xrpRes = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [{ account: wallets.xrp, ledger_index: 'validated', strict: true }]
    });
    results.xrp = xrpRes.data.result.account_data.Balance / 1e6;
  } catch (err) {
    console.error('XRP fetch error:', err.message);
    results.xrp = null;
  }

  // === USDC via Etherscan ===
  try {
    const usdcRes = await axios.get(
      `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&address=${wallets.usdc}&tag=latest&apikey=${ETHERSCAN_API_KEY}`
    );
    results.usdc = parseFloat(usdcRes.data.result) / 1e6;
  } catch (err) {
    console.error('USDC fetch error:', err.message);
    results.usdc = null;
  }

  // === PAXG via Etherscan ===
  try {
    const paxgRes = await axios.get(
      `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0x45804880De22913dAFE09f4980848ECE6EcbAf78&address=${wallets.paxg}&tag=latest&apikey=${ETHERSCAN_API_KEY}`
    );
    results.paxg = parseFloat(paxgRes.data.result) / 1e18;
  } catch (err) {
    console.error('PAXG fetch error:', err.message);
    results.paxg = null;
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
  } catch (err) {
    console.error('SOL fetch error:', err.message);
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
  } catch (err) {
    console.error('RNDR fetch error:', err.message);
    results.rndr = null;
  }

  try {
    const kaspaRes = await axios.get(`https://api.kaspa.org/addresses/${wallets.kaspa}/balance`);
    if (kaspaRes.data && kaspaRes.data.balance) {
      results.kaspa = kaspaRes.data.balance / 1e8;
    } else {
      results.kaspa = null;
    }
  } catch (err) {
    console.error('KASPA fetch error:', err.message);
    results.kaspa = null;
  }

  res.json(results);
});

// === USD per CAC Endpoint ===
app.get('/api/update-price', async (req, res) => {
  try {
    const price = await calculateUsdPerCac();
    res.json({ price: price.toFixed(6) });
  } catch (err) {
    console.error('Update price error:', err.message);
    res.status(500).json({ error: 'Failed to calculate CAC price.' });
  }
});

app.listen(PORT, () => {
  console.log(`CAC Proof-of-Reserve Backend running on port ${PORT}`);
});
