require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");

// === CONFIG ===
const RPC_URL_SEPOLIA = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const CAC_MAINNET_CONTRACT = "0xaE811d6CE4ca45Dfd4874d95CCB949312F909a21";
const CAC_RESERVE_SEPOLIA = "0xEd9218734bb090daf07226D5B56cf1266208f943";
const ETHERSCAN_API_KEY = "NTUDA2PHU25KVX1NTD9TG6Y3HX34ZANI7Y";
const BACKEND_URL = "https://cac-backend-2i3y.onrender.com/api/balances";

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

// === Fetch CAC total supply from Ethereum mainnet ===
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

// === Main Script ===
async function main() {
  try {
    // Fetch token balances from backend
    const balancesRes = await axios.get(BACKEND_URL);
    const balances = balancesRes.data;

    // Prepare list of CoinGecko IDs for price fetch
    const ids = Object.keys(balances)
      .map((token) => COINGECKO_IDS[token.toLowerCase()])
      .filter(Boolean)
      .join(",");

    // Fetch prices
    const priceRes = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
      params: { ids, vs_currencies: "usd" },
    });

    const prices = priceRes.data;

    let totalReserveUSD = 0;
    let missingPrices = [];

    // Check and sum up reserve value
    for (const [token, balance] of Object.entries(balances)) {
      const id = COINGECKO_IDS[token.toLowerCase()];
      const price = prices[id]?.usd;

      if (!price) {
        missingPrices.push(token.toUpperCase());
        continue;
      }

      const usdValue = balance * price;
      totalReserveUSD += usdValue;
    }

    // Abort if any token price is missing
    if (missingPrices.length > 0) {
      throw new Error(`Error fetching price for tokens: ${missingPrices.join(", ")}`);
    }

    if (totalReserveUSD <= 0) throw new Error("Total reserve is zero. Aborting.");

    // Fetch total supply (raw)
    const totalSupplyRaw = await fetchTotalSupplyFromEtherscan();

    // Format total supply (8 decimals)
    const totalSupplyStr = ethers.formatUnits(totalSupplyRaw.toString(), 8);
    const totalSupplyNum = Number(totalSupplyStr);

    if (totalSupplyNum <= 0) throw new Error("Total CAC supply is zero.");

    // Calculate USD per CAC
    const usdPerCAC = totalReserveUSD / totalSupplyNum;

    // Show final USD per CAC only
    console.log(`📈 USD per CAC: $${usdPerCAC.toFixed(2)}`);

  } catch (err) {
    console.error("❌ Error:", err.message || err);
  }
}

main();
