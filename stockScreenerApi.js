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

const getStockSymbols = async (maxPages = 3, limit = 500) => {
  const allSymbols = [];
  let url = `/v3/reference/tickers?market=stocks&active=true&limit=${limit}`;

  for (let i = 0; i < maxPages; i++) {
    const res = await polygonClient.get(url);
    const data = res.data;
    if (data.results) {
      allSymbols.push(...data.results.map(r => r.ticker));
    }
    if (!data.next_url) break;

    const cleanUrl = data.next_url
      .replace('://api.polygon.io:443:443', '://api.polygon.io')
      + `&apiKey=${POLYGON_API_KEY}`;

    url = cleanUrl.replace('https://api.polygon.io', '');
  }
  return allSymbols;
};

const getDummyTechnicals = async (symbol) => ({
  symbol,
  company_name: `${symbol} Inc.`,
  price: 100 + Math.random() * 100,
  ema10: 95,
  ema21: 90,
  sma50: 85,
  sma100: 80,
  sma200: 75,
  adr: 5 + Math.random() * 5,
  perf_1m_pct: 30 + Math.random() * 50,
  perf_3m_pct: 60 + Math.random() * 50,
  perf_6m_pct: 50 + Math.random() * 150,
  volume_90d_avg: 500000 + Math.floor(Math.random() * 1000000),
  market_cap: 300000000 + Math.floor(Math.random() * 700000000),
});

app.get('/api/screen-stocks', async (req, res) => {
  try {
    const symbols = await getStockSymbols();
    const batch = symbols.sort(() => 0.5 - Math.random()).slice(0, 200);

    const results = await Promise.all(batch.map(async symbol => {
      const d = await getDummyTechnicals(symbol);
      const { price, ema10, ema21, sma50, sma100, sma200, adr, perf_1m_pct, perf_3m_pct, perf_6m_pct, volume_90d_avg, market_cap } = d;

      if (price < 1 || market_cap < 300e6 || adr < 5 || volume_90d_avg < 500000) return null;
      if (!(price > ema10 && ema10 > ema21 && ema21 > sma50 && sma50 > sma100 && sma100 > sma200)) return null;

      if (perf_1m_pct >= 30 && perf_3m_pct >= 60 && perf_6m_pct >= 100) {
        return { ...d, category: 'top_tier' };
      }
      if (perf_1m_pct >= 30 && perf_3m_pct >= 60 && perf_6m_pct < 100) {
        return { ...d, category: 'emerging' };
      }

      return null;
    }));

    const filtered = results.filter(Boolean);
    res.json({
      top_tier_stocks: filtered.filter(s => s.category === 'top_tier'),
      emerging_momentum_stocks: filtered.filter(s => s.category === 'emerging'),
    });
  } catch (err) {
    console.error("Error screening stocks:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/', (req, res) => res.send('✅ Polygon Stock Screener Backend Running.'));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
