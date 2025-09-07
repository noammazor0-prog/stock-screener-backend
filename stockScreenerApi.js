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

const getStockSymbols = async (maxPages = 2, limit = 250) => {
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

const getRealStockData = async (symbol) => {
  try {
    const [dailyRes, companyRes] = await Promise.all([
      polygonClient.get(`/v2/aggs/ticker/${symbol}/range/1/day/180/2023-09-01/2023-09-07?adjusted=true&sort=asc&limit=180`),
      polygonClient.get(`/v3/reference/tickers/${symbol}`)
    ]);

    const prices = dailyRes.data.results;
    if (!prices || prices.length < 90) return null;

    const price = prices[prices.length - 1].c;
    const price90 = prices[0].c;
    const price60 = prices[30].c;
    const price30 = prices[60].c;

    const perf_6m_pct = ((price - price90) / price90) * 100;
    const perf_3m_pct = ((price - price60) / price60) * 100;
    const perf_1m_pct = ((price - price30) / price30) * 100;

    return {
      symbol,
      company_name: companyRes.data.results?.name || symbol,
      price,
      perf_1m_pct,
      perf_3m_pct,
      perf_6m_pct,
    };
  } catch (error) {
    console.log(`Error fetching ${symbol}:`, error.message);
    return null;
  }
};

app.get('/api/screen-stocks', async (req, res) => {
  try {
    const symbols = await getStockSymbols();
    const batch = symbols.sort(() => 0.5 - Math.random()).slice(0, 100);

    const results = await Promise.all(batch.map(getRealStockData));
    const filtered = results.filter(Boolean);

    const topTier = filtered.filter(
      s => s.perf_1m_pct >= 30 && s.perf_3m_pct >= 60 && s.perf_6m_pct >= 100
    );

    const emerging = filtered.filter(
      s => s.perf_1m_pct >= 30 && s.perf_3m_pct >= 60 && s.perf_6m_pct < 100
    );

    res.json({
      top_tier_stocks: topTier,
      emerging_momentum_stocks: emerging,
    });
  } catch (err) {
    console.error("Error screening stocks:", err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/', (req, res) => res.send('✅ Polygon Stock Screener Backend Running.'));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
