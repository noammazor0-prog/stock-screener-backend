const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
if (!POLYGON_API_KEY) {
  console.error("FATAL ERROR: POLYGON_API_KEY missing.");
}

const polygonClient = axios.create({
  baseURL: 'https://api.polygon.io',
  params: { apiKey: POLYGON_API_KEY },
});

app.use(cors());
app.use(express.json());

const getStockSymbols = async (maxPages = 3, limit = 200) => {
  const allSymbols = [];
  let url = `/v3/reference/tickers?market=stocks&active=true&limit=${limit}`;

  for (let i = 0; i < maxPages; i++) {
    try {
      const res = await polygonClient.get(url);
      const data = res.data;
      if (data.results) allSymbols.push(...data.results.map(t => t.ticker));
      if (!data.next_url) break;
      // Clean pagination URL
      url = data.next_url.replace('://api.polygon.io:443:443', '://api.polygon.io') +
            (data.next_url.includes('?') ? `&apiKey=${POLYGON_API_KEY}` : `?apiKey=${POLYGON_API_KEY}`);
    } catch (err) {
      console.error(`Pagination error on page ${i + 1}:`, err.message);
      break;
    }
  }
  return allSymbols;
};

const getDummyTechnicals = async (symbol) => ({
  symbol,
  company_name: `${symbol}`,
  price: 100 + Math.random() * 100,
  ema10: 95,
  ema21: 90,
  sma50: 85,
  sma100: 80,
  sma200: 75,
  adr: 5 + Math.random() * 5,
  perf_1m_pct: 30 + Math.random() * 50,
  perf_3m_pct: 60 + Math.random() * 50,
  perf_6m_pct: 100 + Math.random() * 100,
  volume_90d_avg: 500000 + Math.floor(Math.random() * 1000000),
  market_cap: 300000000 + Math.floor(Math.random() * 700000000),
});

app.get('/api/screen-stocks', async (req, res) => {
  const symbols = await getStockSymbols();
  const batch = symbols.sort(() => 0.5 - Math.random()).slice(0, 150);

  const results = await Promise.all(batch.map(async symbol => {
    const d = await getDummyTechnicals(symbol);
    const { price, ema10, ema21, sma50, sma100, sma200, adr, perf_1m_pct, perf_3m_pct, perf_6m_pct, volume_90d_avg, market_cap } = d;

    if (price < 1 || market_cap < 300e6 || adr < 5 || volume_90d_avg < 500000) {
      console.log(`Filtered early: ${symbol}`);
      return null;
    }
    if (!(price > ema10 && ema10 > ema21 && ema21 > sma50 && sma50 > sma100 && sma100 > sma200)) {
      console.log(`Trend mismatch: ${symbol}`);
      return null;
    }

    if (perf_1m_pct >= 30 && perf_3m_pct >= 60 && perf_6m_pct >= 100) {
      return { ...d, category: 'top_tier' };
    }
    if (perf_1m_pct >= 30 && perf_3m_pct >= 60) {
      console.log(`EMERGING: ${symbol} — 1M=${perf_1m_pct.toFixed(1)}%, 3M=${perf_3m_pct.toFixed(1)}%`);
      return { ...d, category: 'emerging' };
    }
    console.log(`Failed emerging: ${symbol} 1M=${perf_1m_pct.toFixed(1)}, 3M=${perf_3m_pct.toFixed(1)}`);
    return null;
  }));

  const filtered = results.filter(Boolean);
  res.json({
    top_tier_stocks: filtered.filter(s => s.category === 'top_tier'),
    emerging_momentum_stocks: filtered.filter(s => s.category === 'emerging'),
  });
});

app.get('/', (req, res) => res.send('✅ Polygon Stock Screener Backend Running.'));
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

