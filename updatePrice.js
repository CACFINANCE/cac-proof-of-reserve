require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL_PRIMARY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CAC_MAINNET_CONTRACT = "0xaE811d6CE4ca45Dfd4874d95CCB949312F909a21";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const BACKEND_URL = "https://cac-backend-2i3y.onrender.com/api/balances";

const COINGECKO_IDS = {
  btc: "bitcoin",
  eth: "ethereum",
  trx: "tron",
  xrp: "ripple",
  usdc: "usd-coin",
  paxg: "pax-gold",
  sol: "solana",
  rndr: "render-token",
  kaspa: "kaspa",
};

const CAC_RESERVE_SEPOLIA = "0xEd9218734bb090daf07226D5B56cf1266208f943";
const CAC_RESERVE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "usdPerToken", type: "uint256" }],
    name: "setUsdPerToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

// Cache setup: 3 minutes TTL
let cachedPrice = null;
let cachedAt = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

async function retry(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((res) => setTimeout(res, delay * attempt));
    }
  }
}

async function fetchTotalSupplyFromEtherscan() {
  const res = await retry(() =>
    axios.get("https://api.etherscan.io/api", {
      params: {
        module: "stats",
        action: "tokensupply",
        contractaddress: CAC_MAINNET_CONTRACT,
        apikey: ETHERSCAN_API_KEY,
      },
    })
  );

  if (res.data.status !== "1" || !res.data.result) {
    throw new Error(`Etherscan error: ${res.data.message || "Unknown error"}`);
  }

  return BigInt(res.data.result);
}

/**
 * Calculates USD price per CAC token.
 * Uses caching for 3 minutes.
 * On failure, returns stale cached price if available with stale=true.
 * 
 * @returns {Promise<{price: number, stale: boolean}>}
 */
async function calculateUsdPerCac() {
  const now = Date.now();

  // Return cached if fresh
  if (cachedPrice && now - cachedAt < CACHE_TTL) {
    return { price: cachedPrice, stale: false };
  }

  try {
    // Fetch balances from backend
    const balancesRes = await retry(() => axios.get(BACKEND_URL));
    const balances = balancesRes.data;

    // Prepare CoinGecko ids
    const ids = Object.keys(balances)
      .map((token) => COINGECKO_IDS[token.toLowerCase()])
      .filter(Boolean)
      .join(",");

    // Fetch prices from CoinGecko
    const priceRes = await retry(() =>
      axios.get("https://api.coingecko.com/api/v3/simple/price", {
        params: { ids, vs_currencies: "usd" },
      })
    );

    const prices = priceRes.data;
    let totalReserveUSD = 0;
    let missingPrices = [];

    for (const [token, balance] of Object.entries(balances)) {
      const id = COINGECKO_IDS[token.toLowerCase()];
      const price = prices[id]?.usd;
      if (!price) {
        missingPrices.push(token.toUpperCase());
        continue;
      }
      totalReserveUSD += balance * price;
    }

    if (missingPrices.length > 0) {
      throw new Error(`Missing prices for: ${missingPrices.join(", ")}`);
    }

    if (totalReserveUSD <= 0) throw new Error("Total reserve is zero.");

    // Fetch total supply from Etherscan
    const totalSupplyRaw = await fetchTotalSupplyFromEtherscan();
    const totalSupply = parseFloat(ethers.formatUnits(totalSupplyRaw, 8));
    if (totalSupply <= 0) throw new Error("Total CAC supply is zero.");

    const finalPrice = totalReserveUSD / totalSupply;

    // Update cache
    cachedPrice = finalPrice;
    cachedAt = Date.now();

    return { price: finalPrice, stale: false };
  } catch (err) {
    console.error("❌ Price calculation error:", err.message);

    // Return stale cached price if available
    if (cachedPrice) {
      return { price: cachedPrice, stale: true };
    }

    // No cached price, rethrow
    throw err;
  }
}

// CLI support - outputs clean JSON with only price string (6 decimals)
if (require.main === module) {
  calculateUsdPerCac()
    .then(({ price }) => {
      console.log(JSON.stringify({ price: price.toFixed(6) }));
    })
    .catch((err) => {
      console.error(JSON.stringify({ error: err.message || err.toString() }));
      process.exit(1);
    });
}

// === Export for reuse in index.js
module.exports = { calculateUsdPerCac };
