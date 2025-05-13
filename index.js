require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

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

// --- SOLANA ---
async function fetchSolanaBalance() {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  try {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [solanaWallet]
    };
    const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
    return res.data.result.value / 1e9;
  } catch (err) {
    console.error('SOL fetch error:', err.message);
    throw new Error('SOL balance fetch failed');
  }
}

async function fetchRenderBalance() {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        renderWallet,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" }
      ]
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

// --- USDC (Ethereum) ---
async function fetchUSDCBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${usdcWallet}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const usdcData = res.data.data.items.find(item => item.contract_ticker_symbol === 'USDC');
    return usdcData ? parseFloat(usdcData.balance) / 1e6 : 0;
  } catch (err) {
    console.error('USDC fetch error:', err.message);
    throw new Error('USDC balance fetch failed');
  }
}

// --- BTC ---
async function fetchBTCBalance() {
  try {
    const res = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${btcWallet}/balance`);
    return res.data.final_balance / 1e8;
  } catch (err) {
    console.error('BTC fetch error:', err.message);
    throw new Error('BTC balance fetch failed');
  }
}

// --- ETH ---
async function fetchETHBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/eth-mainnet/address/${ethWallet}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const ethData = res.data.data.items.find(item => item.contract_ticker_symbol === 'ETH');
    return ethData ? parseFloat(ethData.balance) / 1e18 : 0;
  } catch (err) {
    console.error('ETH fetch error:', err.message);
    throw new Error('ETH balance fetch failed');
  }
}

// --- TRX ---
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

// --- XRP ---
async function fetchXRPBalance() {
  try {
    const url = 'https://s1.ripple.com:51234/';
    const res = await axios.post(url, {
      method: 'account_info',
      params: [{ account: xrpWallet, ledger_index: 'validated' }]
    });
    const drops = res.data.result?.account_data?.Balance;
    return drops ? parseFloat(drops) / 1e6 : 0;
  } catch (err) {
    console.error('XRP fetch error:', err.message);
    throw new Error('XRP balance fetch failed');
  }
}

// --- KASPA ---
async function fetchKASBalance() {
  try {
    const res = await axios.get(`https://api.kaspa.org/addresses/${kasWallet}`);
    return parseFloat(res.data.balance.confirmed);
  } catch (err) {
    console.error('KASPA fetch error:', err.message);
    throw new Error('KASPA balance fetch failed');
  }
}

// --- PAXG (Ethereum) ---
async function fetchPAXGBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${paxgWallet}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const paxgData = res.data.data.items.find(item => item.contract_ticker_symbol === 'PAXG');
    return paxgData ? parseFloat(paxgData.balance) / 1e18 : 0;
  } catch (err) {
    console.error('PAXG fetch error:', err.message);
    throw new Error('PAXG balance fetch failed');
  }
}

// --- API ROUTE ---
app.get('/api/balances', async (req, res) => {
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

    res.json({
      SOL: sol,
      RNDR: render,
      USDC: usdc,
      BTC: btc,
      ETH: eth,
      TRX: trx,
      XRP: xrp,
      KAS: kas,
      PAXG: paxg
    });
  } catch (err) {
    console.error('Balance fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

app.listen(PORT, () => {
  console.log(`CAC Proof-of-Reserve Backend is running on port ${PORT}`);
});
