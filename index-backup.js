require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// Wallet Addresses
const wallets = {
  btc: 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7',
  eth: '0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb',
  tron: 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy',
  xrp: 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf',
  kaspa: 'kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd',
  paxg: '0x5968364A1e1aF7fAEbf8c8AD9805709eF4beb936',
  usdc: '0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266',
};

// === BTC Balance ===
app.get('/btc', async (req, res) => {
  try {
    const response = await axios.get(`https://mempool.space/api/address/${wallets.btc}`);
    const balance = response.data.chain_stats.funded_txo_sum - response.data.chain_stats.spent_txo_sum;
    res.json({ balance: balance / 1e8 });
  } catch (err) {
    console.error('BTC fetch error:', err.message);
    res.status(500).json({ error: 'BTC balance fetch failed' });
  }
});

// === ETH Balance ===
app.get('/eth', async (req, res) => {
  try {
    const response = await axios.get(`https://api.etherscan.io/api?module=account&action=balance&address=${wallets.eth}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`);
    res.json({ balance: Number(response.data.result) / 1e18 });
  } catch (err) {
    console.error('ETH fetch error:', err.message);
    res.status(500).json({ error: 'ETH balance fetch failed' });
  }
});

// === USDC Balance ===
app.get('/usdc', async (req, res) => {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${wallets.usdc}/balances_v2/?&key=${process.env.COVALENT_API_KEY}`;
    const response = await axios.get(url);
    const usdc = response.data.data.items.find(token => token.contract_ticker_symbol === 'USDC');
    res.json({ balance: usdc ? usdc.balance / 1e6 : 0 });
  } catch (err) {
    console.error('USDC fetch error:', err.message);
    res.status(500).json({ error: 'USDC balance fetch failed' });
  }
});

// === XRP Balance ===
app.get('/xrp', async (req, res) => {
  try {
    const url = 'https://s1.ripple.com:51234/';
    const requestData = {
      method: "account_info",
      params: [{
        account: wallets.xrp,
        ledger_index: "validated",
        strict: true
      }]
    };
    const response = await axios.post(url, requestData, {
      headers: { 'Content-Type': 'application/json' }
    });
    const balanceData = response.data.result.account_data;
    const xrpBalance = parseFloat(balanceData.Balance) / 1e6;
    res.json({ balance: xrpBalance });
  } catch (err) {
    console.error('XRP fetch error:', err.message);
    res.status(500).json({ error: 'XRP balance fetch failed' });
  }
});

// === PAXG Balance ===
app.get('/paxg', async (req, res) => {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${wallets.paxg}/balances_v2/?&key=${process.env.COVALENT_API_KEY}`;
    const response = await axios.get(url);
    const paxg = response.data.data.items.find(token => token.contract_ticker_symbol === 'PAXG');
    res.json({ balance: paxg ? paxg.balance / 1e18 : 0 });
  } catch (err) {
    console.error('PAXG fetch error:', err.message);
    res.status(500).json({ error: 'PAXG balance fetch failed' });
  }
});

// === TRON Balance ===
app.get('/tron', async (req, res) => {
  try {
    const url = `https://api.trongrid.io/v1/accounts/${wallets.tron}`;
    const response = await axios.get(url, {
      headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
    });
    const balance = response.data.data[0]?.balance || 0;
    res.json({ balance: balance / 1e6 });
  } catch (err) {
    console.error('TRON fetch error:', err.message);
    res.status(500).json({ error: 'TRON balance fetch failed' });
  }
});

// === KASPA Balance using Kaspa REST API ===
app.get('/kaspa', async (req, res) => {
  try {
    const address = wallets.kaspa; // Ensure this includes the 'kaspa:' prefix
    const response = await axios.get(`https://api.kaspa.org/addresses/kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd/balance
`);
    
    // Log the full response data for debugging
    console.log('Kaspa response:', response.data);

    if (response.data && response.data.balance) {
      const balance = response.data.balance; // Balance is in sompi
      res.json({ balance: balance / 1e8 });  // Convert to KAS
    } else {
      res.status(500).json({ error: 'Kaspa balance data not found' });
    }
  } catch (err) {
    console.error('KASPA fetch error:', err.message);
    res.status(500).json({ error: 'KASPA balance fetch failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
