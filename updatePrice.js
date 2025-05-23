
require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");

// === CONFIG ===
const RPC_URL = process.env.RPC_URL_PRIMARY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CAC_MAINNET_CONTRACT = "0xaE811d6CE4ca45Dfd4874d95CCB949312F909a21";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const BACKEND_URL = "https://cac-backend-2i3y.onrender.com/api/balances";
const CAC_RESERVE_SEPOLIA = "0xEd9218734bb090daf07226D5B56cf1266208f943";
const CAC_RESERVE_ABI = [
  { inputs: [{ internalType: "uint256", name: "usdPerToken", type: "uint256" }], name: "setUsdPerToken", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "owner", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" }
];
const COINGECKO_IDS = {
  btc: "bitcoin", eth: "ethereum", trx: "tron", xrp: "ripple",
  usdc: "usd-coin", paxg: "pax-gold", sol: "solana",
  rndr: "render-token", kaspa: "kaspa"
};
const COINPAPRIKA_SYMBOLS = {
  btc: "btc-bitcoin", eth: "eth-ethereum", trx: "trx-tron", xrp: "xrp-xrp",
  usdc: "usdc-usd-coin", paxg: "paxg-pax-gold", sol: "sol-solana",
  rndr: "rndr-render-token", kaspa: "kas-kaspa"
};

let cachedPrice = null;
let lastFetched = 0;
const CACHE_DURATION_MS = 3 * 60 * 1000;

async function retry(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        console.warn("Rate limited (429) - retrying...");
        await new Promise(res => setTimeout(res, 10000));
      } else if (attempt < maxAttempts) {
        await new Promise(res => setTimeout(res, delay * attempt));
      } else {
        throw err;
      }
    }
  }
}

async function fetchTotalSupplyFromEtherscan() {
  const res = await axios.get("https://api.etherscan.io/api", {
    params: {
      module: "stats",
      action: "tokensupply",
      contractaddress: CAC_MAINNET_CONTRACT,
      apikey: ETHERSCAN_API_KEY
    }
  });
  if (res.data.status !== "1" || !res.data.result) throw new Error(`Etherscan error: ${res.data.message || "Unknown error"}`);
  return BigInt(res.data.result);
}

async function fetchPricesFromCoinGecko(balances) {
  const ids = Object.keys(balances).map(token => COINGECKO_IDS[token.toLowerCase()]).filter(Boolean).join(",");
  const res = await retry(() =>
    axios.get("https://api.coingecko.com/api/v3/simple/price", {
      params: { ids, vs_currencies: "usd" },
      timeout: 8000
    })
  );
  return Object.fromEntries(Object.entries(COINGECKO_IDS).map(([sym, id]) => [sym, res.data[id]?.usd]));
}

async function fetchPricesFromCoinPaprika(balances) {
  const results = {};
  for (const token of Object.keys(balances)) {
    const id = COINPAPRIKA_SYMBOLS[token.toLowerCase()];
    if (!id) continue;
    try {
      const res = await axios.get(`https://api.coinpaprika.com/v1/tickers/${id}`);
      results[token.toLowerCase()] = res.data.quotes.USD.price;
    } catch (err) {
      console.warn(`Fallback failed for ${token}:`, err.message);
    }
  }
  return results;
}

async function calculateUsdPerCac() {
  const now = Date.now();
  if (cachedPrice && now - lastFetched < CACHE_DURATION_MS) return { price: cachedPrice };

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CAC_RESERVE_SEPOLIA, CAC_RESERVE_ABI, signer);

  const balancesRes = await retry(() => axios.get(BACKEND_URL, { timeout: 8000 }));
  const balances = balancesRes.data;

  let prices = {};
  try {
    prices = await fetchPricesFromCoinGecko(balances);
  } catch (e) {
    console.warn("CoinGecko failed. Falling back to CoinPaprika...");
    prices = await fetchPricesFromCoinPaprika(balances);
  }

  let totalReserveUSD = 0;
  for (const [token, balance] of Object.entries(balances)) {
    const price = prices[token.toLowerCase()];
    if (!price) throw new Error(`Missing price for ${token}`);
    totalReserveUSD += balance * price;
  }

  const totalSupplyRaw = await fetchTotalSupplyFromEtherscan();
  const totalSupply = parseFloat(ethers.formatUnits(totalSupplyRaw, 8));
  if (totalSupply <= 0) throw new Error("Total CAC supply is zero.");

  const finalPrice = totalReserveUSD / totalSupply;
  cachedPrice = finalPrice;
  lastFetched = Date.now();

  return { price: finalPrice };
}

if (require.main === module) {
  calculateUsdPerCac()
    .then(({ price }) => {
      console.log(JSON.stringify({ price: price.toFixed(6) }));
    })
    .catch((err) => {
      console.error("Update price error:", err.message || err);
      console.log(JSON.stringify({ error: "Failed to calculate CAC price." }));
    });
}

module.exports = { calculateUsdPerCac };
