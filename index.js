const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/api/balances', async (req, res) => {
  try {
    const balances = {};

    // BTC
    const btcAddress = 'bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7';
    try {
      const btcRes = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${btcAddress}/balance`);
      balances.BTC = btcRes.data.final_balance / 1e8;
    } catch (err) {
      console.error('BTC fetch error:', err.message);
      balances.BTC = 'Error';
    }

    // ETH
    const ethAddress = '0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb';
    try {
      const ethRes = await axios.get(`https://api.etherscan.io/api?module=account&action=balance&address=${ethAddress}&tag=latest&apikey=YourEtherscanAPIKey`);
      balances.ETH = parseFloat(ethRes.data.result) / 1e18;
    } catch (err) {
      console.error('ETH fetch error:', err.message);
      balances.ETH = 'Error';
    }

    // USDC
    const usdcAddress = '0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266';
    try {
      const usdcRes = await axios.get(`https://api.covalenthq.com/v1/1/address/${usdcAddress}/balances_v2/?key=YourCovalentAPIKey`);
      const usdcData = usdcRes.data.data.items.find(item => item.contract_ticker_symbol === 'USDC');
      balances.USDC = usdcData ? usdcData.balance / 10 ** usdcData.contract_decimals : 0;
    } catch (err) {
      console.error('USDC fetch error:', err.message);
      balances.USDC = 'Error';
    }

    // TRX
    const trxAddress = 'TEK2WDVsMVxogtQGfVA6WwboidawRr69oy';
    try {
      const trxRes = await axios.get(`https://apilist.tronscan.org/api/account?address=${trxAddress}`);
      balances.TRX = trxRes.data.balance / 1e6;
    } catch (err) {
      console.error('TRX fetch error:', err.message);
      balances.TRX = 'Error';
    }

    // XRP (using Ripple JSON-RPC)
    const xrpAddress = 'rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf';
    try {
      const xrpRes = await axios.post('https://s1.ripple.com:51234/', {
        method: 'account_info',
        params: [
          {
            account: xrpAddress,
            strict: true,
            ledger_index: 'validated',
            queue: true
          }
        ]
      });
      const xrpBalance = xrpRes.data.result.account_data.Balance;
      balances.XRP = parseFloat(xrpBalance) / 1e6;
    } catch (err) {
      console.error('XRP fetch error:', err.message);
      balances.XRP = 'Error';
    }

    // KASPA
    const kaspaAddress = 'kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd';
    try {
      const kaspaRes = await axios.get(`https://explorer.kaspa.org/api/addresses/${kaspaAddress}`);
      balances.KASPA = parseFloat(kaspaRes.data.balance);
    } catch (err) {
      console.error('KASPA fetch error:', err.message);
      balances.KASPA = 'Error';
    }

    // PAXG
    const paxgAddress = '0x5968364A1e1aF7fAEbf8c8AD9805709eF4beb936';
    try {
      const paxgRes = await axios.get(`https://api.ethplorer.io/getAddressInfo/${paxgAddress}?apiKey=freekey`);
      const paxgData = paxgRes.data.tokens.find(token => token.tokenInfo.symbol === 'PAXG');
      balances.PAXG = paxgData ? paxgData.balance / 10 ** paxgData.tokenInfo.decimals : 0;
    } catch (err) {
      console.error('PAXG fetch error:', err.message);
      balances.PAXG = 'Error';
    }

    // SOL
    const solAddress = 'C566EL3iLEmEm8GETMzHDQwMPwWmxwiuwnskDyKZpT7u';
    try {
      const solRes = await axios.get(`https://api.helius.xyz/v0/addresses/${solAddress}/balances?api-key=YourHeliusAPIKey`);
      balances.SOL = solRes.data.nativeBalance / 1e9;
    } catch (err) {
      console.error('SOL fetch error:', err.message);
      balances.SOL = 'Error';
    }

    // RNDR on Solana
    const solanaRenderWallet = 'C5oLMbkgPHig7YX6yZwiXnpxkPyiNYMYnjz7wLbsCnL1';
    try {
      const tokenRes = await axios.get(`https://api.helius.xyz/v0/addresses/${solanaRenderWallet}/tokens?api-key=YourHeliusAPIKey`);
      const renderToken = tokenRes.data.find(t => t.mint === 'RnDR1bZo7P8WmSoN1NJefYjKaY7FZHpzKzMvM6z6FeK');
      balances.RNDR = renderToken ? renderToken.amount / 10 ** renderToken.decimals : 0;
    } catch (err) {
      console.error('RNDR fetch error:', err.message);
      balances.RNDR = 'Error';
    }

    res.json(balances);
  } catch (err) {
    console.error('Balance fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

app.listen(PORT, () => {
  console.log(`CAC Proof-of-Reserve Backend is running on port ${PORT}`);
});
