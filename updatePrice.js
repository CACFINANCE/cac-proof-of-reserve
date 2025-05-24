const axios = require("axios");
const axiosRetry = require("axios-retry");
require("dotenv").config();

axiosRetry(axios, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;
const FALLBACK_API_URL = "https://api.coingecko.com/api/v3/simple/price";

const CAC_BACKING_ASSETS = [
  { symbol: "btc", weight: 0.25 },
  { symbol: "eth", weight: 0.20 },
  { symbol: "trx", weight: 0.10 },
  { symbol: "xrp", weight: 0.10 },
  { symbol: "usdc", weight: 0.10 },
  { symbol: "paxg", weight: 0.10 },
  { symbol: "sol", weight: 0.05 },
  { symbol: "rndr", weight: 0.05 },
  { symbol: "kaspa", weight: 0.05 }
];

async function fetchPriceCoinMarketCap(symbol) {
  const symbolMap = {
    btc: "BTC",
    eth: "ETH",
    trx: "TRX",
    xrp: "XRP",
    usdc: "USDC",
    paxg: "PAXG",
    sol: "SOL",
    rndr: "RNDR",
    kaspa: "KAS"
  };

  const slugMap = {
    kaspa: "kaspa"
  };

  const querySymbol = symbolMap[symbol] || symbol.toUpperCase();
  const querySlug = slugMap[symbol];

  const url = querySlug
    ? `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?slug=${querySlug}`
    : `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${querySymbol}`;

  const headers = {
    "X-CMC_PRO_API_KEY": COINMARKETCAP_API_KEY
  };

  const response = await axios.get(url, { headers });
  const data = response.data.data;

  const key = Object.keys(data)[0];
  return data[key].quote.USD.price;
}

async function fetchPriceCoingecko(symbol) {
  const ids = {
    btc: "bitcoin",
    eth: "ethereum",
    trx: "tron",
    xrp: "ripple",
    usdc: "usd-coin",
    paxg: "pax-gold",
    sol: "solana",
    rndr: "render-token",
    kaspa: "kaspa"
  };

  const id = ids[symbol];
  const url = `${FALLBACK_API_URL}?ids=${id}&vs_currencies=usd`;

  const response = await axios.get(url);
  return response.data[id].usd;
}

async function getAssetPrice(symbol) {
  try {
    return await fetchPriceCoinMarketCap(symbol);
  } catch (err) {
    console.warn(`⚠️ CMC failed for ${symbol}:`, err.message);
    try {
      return await fetchPriceCoingecko(symbol);
    } catch (fallbackErr) {
      console.error(`❌ Fallback also failed for ${symbol}:`, fallbackErr.message);
      throw new Error(`Failed to fetch price for ${symbol}`);
    }
  }
}

async function calculateUsdPerCac() {
  let total = 0;

  for (const asset of CAC_BACKING_ASSETS) {
    const price = await getAssetPrice(asset.symbol);
    total += price * asset.weight;
  }

  return { price: total };
}

module.exports = { calculateUsdPerCac };
