require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");

// === CONFIG ===
const RPC_URL_SEPOLIA = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CAC_MAINNET_CONTRACT = "0xaE811d6CE4ca45Dfd4874d95CCB949312F909a21";
const CAC_RESERVE_SEPOLIA = "0xEd9218734bb090daf07226D5B56cf1266208f943";
const ETHERSCAN_API_KEY = "NTUDA2PHU25KVX1NTD9TG6Y3HX34ZANI7Y";
const CMC_API_KEY = process.env.CMC_API_KEY;
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

// === SYMBOL & ID MAPPING ===
const SYMBOL_MAP = {
  rndr: "RENDER",
  kaspa: "KAS",
};
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

// === Fetch prices from CoinMarketCap ===
async function fetchCMCPrices(tokens) {
  const symbols = tokens.map((t) => SYMBOL_MAP[t.toLowerCase()] || t.toUpperCase()).join(",");

  try {
    const res = await axios.get("https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest", {
      headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY },
      params: { symbol: symbols, convert: "USD" },
    });

    return tokens.reduce((acc, token) => {
      const cmcSymbol = SYMBOL_MAP[token.toLowerCase()] || token.toUpperCase();
      const price = res.data.data?.[cmcSymbol]?.quote?.USD?.price;
      if (price) acc[token.toLowerCase()] = { price, source: "CMC" };
      return acc;
    }, {});
  } catch (e) {
    console.warn("⚠️ CMC failed:", e.response?.data || e.message);
    return {};
  }
}

// === Fallback to CoinGecko ===
async function fetchCoinGeckoPrices(tokens) {
  const ids = tokens
    .map((t) => COINGECKO_IDS[t.toLowerCase()])
    .filter(Boolean)
    .join(",");

  try {
    const res = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
      params: { ids, vs_currencies: "usd" },
    });

    return tokens.reduce((acc, token) => {
      const id = COINGECKO_IDS[token.toLowerCase()];
      const price = res.data?.[id]?.usd;
      if (price) acc[token.toLowerCase()] = { price, source: "CoinGecko" };
      return acc;
    }, {});
  } catch (e) {
    console.warn("⚠️ CoinGecko failed:", e.response?.data || e.message);
    return {};
  }
}

// === Main Script ===
async function main() {
  try {
    const balancesRes = await axios.get(BACKEND_URL);
    const balances = balancesRes.data;
    const tokens = Object.keys(balances);

    const cmcPrices = await fetchCMCPrices(tokens);
    const missingTokens = tokens.filter((t) => !cmcPrices[t.toLowerCase()]);

    const fallbackPrices = await fetchCoinGeckoPrices(missingTokens);
    const combinedPrices = { ...cmcPrices, ...fallbackPrices };

    const stillMissing = tokens.filter((t) => !combinedPrices[t.toLowerCase()]);
    if (stillMissing.length > 0) {
      throw new Error(
        `❌ Failed to fetch USD prices for: ${stillMissing.join(", ")}`
      );
    }

    // Total reserve USD
    let totalReserveUSD = 0;
    for (const [token, balance] of Object.entries(balances)) {
      const { price, source } = combinedPrices[token.toLowerCase()];
      const usdValue = balance * price;
      totalReserveUSD += usdValue;
      console.log(`💰 ${token.toUpperCase()} = $${price.toFixed(2)} (from ${source})`);
    }

    if (totalReserveUSD <= 0) throw new Error("Total reserve is zero. Aborting.");

    // Fetch total CAC supply
    const totalSupplyRaw = await fetchTotalSupplyFromEtherscan();
    const totalSupplyStr = ethers.formatUnits(totalSupplyRaw.toString(), 8);
    const totalSupplyNum = Number(totalSupplyStr);

    if (totalSupplyNum <= 0) throw new Error("Total CAC supply is zero.");

    // Calculate and log USD per CAC
    const usdPerCAC = totalReserveUSD / totalSupplyNum;
    console.log(`📈 USD per CAC: $${usdPerCAC.toFixed(2)}`);

  } catch (err) {
    console.error("❌ Error:", err.message || err);
  }
}

main();
