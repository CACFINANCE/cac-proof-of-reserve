require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");

// === CONFIG ===
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

// === Fetch CAC total supply from Etherscan ===
async function fetchTotalSupplyFromEtherscan() {
  const res = await axios.get("https://api.etherscan.io/api", {
    params: {
      module: "stats",
      action: "tokensupply",
      contractaddress: CAC_MAINNET_CONTRACT,
      apikey: ETHERSCAN_API_KEY,
    },
  });

  if (res.data.status !== "1" || !res.data.result) {
    throw new Error(`Etherscan error: ${res.data.message || "Unknown error"}`);
  }

  return BigInt(res.data.result);
}

// === Calculate USD per CAC token ===
async function calculateUsdPerCac() {
  // Connect to provider (for optional on-chain update)
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CAC_RESERVE_SEPOLIA, CAC_RESERVE_ABI, signer);

  // Fetch token balances from backend
  const balancesRes = await axios.get(BACKEND_URL);
  const balances = balancesRes.data;

  // Build CoinGecko request
  const ids = Object.keys(balances)
    .map((token) => COINGECKO_IDS[token.toLowerCase()])
    .filter(Boolean)
    .join(",");

  const priceRes = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
    params: { ids, vs_currencies: "usd" },
  });

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

  if (totalReserveUSD <= 0) {
    throw new Error("Total reserve is zero.");
  }

  // Get CAC total supply
  const totalSupplyRaw = await fetchTotalSupplyFromEtherscan();
  const totalSupply = parseFloat(ethers.formatUnits(totalSupplyRaw, 8));

  if (totalSupply <= 0) {
    throw new Error("Total CAC supply is zero.");
  }

  // Final USD price per CAC
  return totalReserveUSD / totalSupply;
}

// === CLI run support ===
if (require.main === module) {
  calculateUsdPerCac()
    .then((price) => {
      console.log(`📈 USD per CAC: $${price.toFixed(4)}`);
    })
    .catch((err) => {
      console.error("❌ Error:", err.message || err);
    });
}

// === Export for reuse in index.js
module.exports = { calculateUsdPerCac };
