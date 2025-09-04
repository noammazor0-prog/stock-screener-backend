const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
if (!POLYGON_API_KEY) {
  console.error("FATAL ERROR: POLYGON_API_KEY environment variable not set.");
}

const polygonClient = axios.create({
  baseURL: 'https://api.polygon.io',
  params: { apiKey: POLYGON_API_KEY },
});

app.use(cors());
app.use(express.json());

const getStockSymbols = async () => {
  try {
    const response = await polygonClient.get('/v3/reference/tickers', {
      params: {
        market: 'stocks',
        exchange: 'XNYS',
        active: true,
        limit: 500,
      },
    });
    return response.data.results.map(t => t.ticker);
  } catch (error) {
    console.error("Error fetching stock symbols:", error.message);
    return [];
  }
};

const getDummyTechnicals = async (symbol) => {
  return {
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
    perf_3m_pct: 55 + Math.random() * 30, // Modified to improve emerging detection
    perf_6m_pct: 100 + Math.random() * 100,
    volume_90d_avg: 500000 + Math.floor(Math.random() * 1000000),
    market_cap: 300000000 + Math.floor(Math.random() * 700000000),
  };
};

app.get('/api/screen-stocks', async (req, res) => {
  try {
    const symbols = await getStockSymbols();
    const batch = symbols.slice(0, 100);

    const results = await Promise.all(batch.map(async symbol => {
      const data = await getDummyTechnicals(symbol);
      const {
        price, ema10, ema21, sma50, sma100, sma200,
        adr, perf_1m_pct, perf_3m_pct, perf_6m_pct,
        volume_90d_avg, market_cap
      } = data;

      if (price < 1 || market_cap < 300000000 || adr < 5 || volume_90d_avg < 500000) return null;
      if (!(price > ema10 && ema10 > ema21 && ema21 > sma50 && sma50 > sma100 && sma100 > sma200)) return null;

      if (perf_1m_pct >= 30 && perf_3m_pct >= 60 && perf_6m_pct >= 100) {
        return { ...data, category: 'top_tier' };
      } else if (perf_1m_pct >= 30 && perf_3m_pct >= 60) {
        return { ...data, category: 'emerging' };
      }

      return null;
    }));

    const final = results.filter(Boolean);

    res.json({
      top_tier_stocks: final.filter(s => s.category === 'top_tier'),
      emerging_momentum_stocks: final.filter(s => s.category === 'emerging')
    });
  } catch (error) {
    console.error("Error in /api/screen-stocks:", error.message);
    res.status(500).json({ error: "Failed to screen stocks" });
  }
});

app.get('/', (req, res) => {
  res.send('✅ Polygon Stock Screener Backend is running!');
});

app.listen(PORT, () => {
  console.log(`✅ Backend server running at http://localhost:${PORT}`);
});
