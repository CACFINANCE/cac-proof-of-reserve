const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Your wallet addresses
const wallets = {
  BTC: "bc1qjfg46f6ru9h6wrdejkqa6um8496lpls59knsr7",
  ETH: "0xc199a4e487Fb1eB5a03f16e56CB970338f2cC0cb",
  USDC: "0xf3d71E003dD5C38B2E797a3fed0Aa1ac92dB1266",
  TRX: "TEK2WDVsMVxogtQGfVA6WwboidawRr69oy",
  XRP: "rNZKMy6YiEDZ4pbJyqCSiaA4BWs6Mq8jyf",
  KAS: "kaspa:qzmre59lsdqpd66tvz5wceaw74ez8xj7x2ldvdscxngv0ld4g237v3d4dkmnd",
  PAXG: "0x5968364A1e1aF7fAEbf8c8AD9805709eF4beb936"
};

// Fetch functions for each token
async function fetchBTCBalance() {
  try {
    const res = await axios.get(`https://api.blockchair.com/bitcoin/dashboards/address/${wallets.BTC}`);
    return res.data.data[wallets.BTC].address.balance / 1e8;
  } catch (error) {
    console.error("BTC fetch error:", error.message);
    throw new Error("BTC balance fetch failed");
  }
}

async function fetchETHBalance() {
  try {
    const res = await axios.get(`https://api.etherscan.io/api`, {
      params: {
        module: "account",
        action: "balance",
        address: wallets.ETH,
        tag: "latest",
        apikey: process.env.ETHERSCAN_API_KEY
      }
    });
    return Number(res.data.result) / 1e18;
  } catch (error) {
    console.error("ETH fetch error:", error.message);
    throw new Error("ETH balance fetch failed");
  }
}

async function fetchUSDCBalance() {
  try {
    const url = `https://api.covalenthq.com/v1/1/address/${wallets.USDC}/balances_v2/?key=${process.env.COVALENT_API_KEY}`;
    const res = await axios.get(url);
    const usdc = res.data.data.items.find(item => item.contract_ticker_symbol === "USDC");
    return usdc ? usdc.balance / 1e6 : 0;
  } catch (error) {
    console.error("USDC fetch error:", error.message);
    throw new Error("USDC balance fetch failed");
  }
}

async function fetchTRXBalance() {
  try {
    const res = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${wallets.TRX}`);
    return res.data.balance / 1e6;
  } catch (error) {
    console.error("TRX fetch error:", error.message);
    throw new Error("TRX balance fetch failed");
  }
}

async function fetchXRPBalance() {
  try {
    const res = await axios.get(`https://api.xrpscan.com/api/v1/account/${wallets.XRP}/basic-info`);
    return parseFloat(res.data.balance);
  } catch (error) {
    console.error("XRP fetch error:", error.message);
    throw new Error("XRP balance fetch failed");
  }
}

async function fetchKASBalance() {
  try {
    const res = await axios.get(`https://api.kaspa.org/addresses/${wallets.KAS}`);
    return parseFloat(res.data.balance) / 1e8;
  } catch (error) {
    console.error("KASPA fetch error:", error.message);
    throw new Error("KASPA balance fetch failed");
  }
}

async function fetchPAXGBalance() {
  try {
    const url = `https://api.etherscan.io/api`;
    const res = await axios.get(url, {
      params: {
        module: "account",
        action: "tokenbalance",
        contractaddress: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
        address: wallets.PAXG,
        tag: "latest",
        apikey: process.env.ETHERSCAN_API_KEY
      }
    });
    return Number(res.data.result) / 1e18;
  } catch (error) {
    console.error("PAXG fetch error:", error.message);
    throw new Error("PAXG balance fetch failed");
  }
}

// Route to get all balances
app.get("/api/balances", async (req, res) => {
  try {
    const [
      BTC, ETH, USDC, TRX, XRP, KAS, PAXG
    ] = await Promise.all([
      fetchBTCBalance(),
      fetchETHBalance(),
      fetchUSDCBalance(),
      fetchTRXBalance(),
      fetchXRPBalance(),
      fetchKASBalance(),
      fetchPAXGBalance()
    ]);

    res.json({
      BTC, ETH, USDC, TRX, XRP, KAS, PAXG
    });
  } catch (error) {
    console.error("Balance fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch balances" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("CAC Proof-of-Reserve Backend is running.");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
