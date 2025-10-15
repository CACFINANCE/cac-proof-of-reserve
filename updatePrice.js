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
  usdcallocation: "usd-coin",  // NEW: Map allocation to USDC price
  usdctreasury: "usd-coin",    // NEW: Map treasury to USDC price
  paxg: "pax-gold",
  sol: "solana",
  rndr: "render-token",
  kaspa: "kaspa",
  bnb: "binancecoin"  // NEW: Added BNB
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
  console.log('Fetching CAC total supply from Etherscan...');
  const res = await axios.get("https://api.etherscan.io/api", {
    params: {
      module: "stats",
      action: "tokensupply",
      contractaddress: CAC_MAINNET_CONTRACT,
      apikey: ETHERSCAN_API_KEY,
    },
    timeout: 10000
  });
  
  if (res.data.status !== "1" || !res.data.result) {
    throw new Error(`Etherscan error: ${res.data.message || "Unknown error"}`);
  }
  
  const supply = BigInt(res.data.result);
  console.log(`✓ CAC supply: ${ethers.formatUnits(supply, 8)}`);
  return supply;
}

// === Calculate USD per CAC token ===
async function calculateUsdPerCac() {
  console.log('========================================');
  console.log('Starting CAC Price Calculation');
  console.log('========================================');
  
  try {
    // Step 1: Fetch reserve balances
    console.log('Step 1: Fetching reserve balances...');
    const balancesRes = await axios.get(BACKEND_URL, { timeout: 15000 });
    const rawBalances = balancesRes.data;
    
    console.log('Received balances:', JSON.stringify(rawBalances, null, 2));
    
    // Step 2: Normalize balances (combine USDC wallets, handle nulls)
    const balances = {};
    
    for (const [key, value] of Object.entries(rawBalances)) {
      // Skip metadata fields
      if (key.startsWith('_')) continue;
      
      // Convert null to 0
      const balance = value === null ? 0 : value;
      
      // Handle USDC special case
      if (key === 'usdcAllocation' || key === 'usdcTreasury') {
        // Add to combined USDC total
        balances.usdc = (balances.usdc || 0) + balance;
        console.log(`  + ${key}: ${balance} USDC`);
      } else if (key !== 'usdc') {
        // Regular asset (skip if backend already includes combined 'usdc')
        balances[key] = balance;
      }
    }
    
    // If backend didn't provide separate USDC fields, use the combined value
    if (!rawBalances.usdcAllocation && !rawBalances.usdcTreasury && rawBalances.usdc !== undefined) {
      balances.usdc = rawBalances.usdc;
    }
    
    console.log('✓ Normalized balances:', JSON.stringify(balances, null, 2));
    
    // Step 3: Validate balances
    const zeroBalances = [];
    for (const [token, balance] of Object.entries(balances)) {
      if (balance === 0 || balance === null) {
        zeroBalances.push(token.toUpperCase());
      }
    }
    
    if (zeroBalances.length > 0) {
      console.warn(`⚠️ Warning: Zero balances for: ${zeroBalances.join(', ')}`);
      // Continue anyway, but note the warning
    }
    
    // Step 4: Fetch prices from CoinGecko
    console.log('Step 2: Fetching prices from CoinGecko...');
    
    const uniqueIds = [...new Set(
      Object.keys(balances)
        .map((token) => COINGECKO_IDS[token.toLowerCase()])
        .filter(Boolean)
    )];
    
    const ids = uniqueIds.join(",");
    console.log(`  CoinGecko IDs: ${ids}`);
    
    const priceRes = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
      params: { ids, vs_currencies: "usd" },
      timeout: 15000
    });
    
    const prices = priceRes.data;
    console.log('✓ Prices fetched:', JSON.stringify(prices, null, 2));
    
    // Step 5: Calculate total reserve value
    console.log('Step 3: Calculating total reserve value...');
    
    let totalReserveUSD = 0;
    let missingPrices = [];
    const breakdown = [];
    
    for (const [token, balance] of Object.entries(balances)) {
      const id = COINGECKO_IDS[token.toLowerCase()];
      const price = prices[id]?.usd;
      
      if (!price) {
        missingPrices.push(token.toUpperCase());
        console.warn(`  ⚠️ Missing price for ${token.toUpperCase()}`);
        continue;
      }
      
      if (balance === 0 || balance === null) {
        console.log(`  ⚠️ ${token.toUpperCase()}: $0 (zero balance)`);
        continue;
      }
      
      const valueUSD = balance * price;
      totalReserveUSD += valueUSD;
      
      breakdown.push({
        token: token.toUpperCase(),
        balance: balance.toFixed(6),
        price: price.toFixed(2),
        value: valueUSD.toFixed(2)
      });
      
      console.log(`  ✓ ${token.toUpperCase()}: ${balance.toFixed(6)} × $${price.toFixed(2)} = $${valueUSD.toFixed(2)}`);
    }
    
    if (missingPrices.length > 0) {
      throw new Error(`Missing prices for: ${missingPrices.join(", ")}`);
    }
    
    if (totalReserveUSD <= 0) {
      throw new Error("Total reserve is zero or negative");
    }
    
    console.log('========================================');
    console.log(`💰 Total Reserve Value: $${totalReserveUSD.toFixed(2)}`);
    console.log('========================================');
    
    // Step 6: Get CAC total supply
    console.log('Step 4: Fetching CAC supply...');
    const totalSupplyRaw = await fetchTotalSupplyFromEtherscan();
    const totalSupply = parseFloat(ethers.formatUnits(totalSupplyRaw, 8));
    
    if (totalSupply <= 0) {
      throw new Error("Total CAC supply is zero");
    }
    
    console.log(`✓ CAC Total Supply: ${totalSupply.toLocaleString()}`);
    
    // Step 7: Calculate price per CAC
    const pricePerCAC = totalReserveUSD / totalSupply;
    
    console.log('========================================');
    console.log(`📈 USD per CAC: $${pricePerCAC.toFixed(6)}`);
    console.log('========================================');
    console.log('✅ PRICE CALCULATION COMPLETE');
    console.log('========================================');
    
    return pricePerCAC;
    
  } catch (error) {
    console.log('========================================');
    console.log('❌ PRICE CALCULATION FAILED');
    console.log('========================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.log('========================================');
    throw error;
  }
}

// === CLI run support ===
if (require.main === module) {
  calculateUsdPerCac()
    .then((price) => {
      console.log(`\n🎉 Final Result: $${price.toFixed(6)} per CAC\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Fatal Error:", err.message || err, "\n");
      process.exit(1);
    });
}

// === Export for reuse in index.js ===
module.exports = { calculateUsdPerCac };
