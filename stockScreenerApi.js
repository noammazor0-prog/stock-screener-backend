const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

if (!POLYGON_API_KEY) {
  console.error("❌ POLYGON_API_KEY missing in .env file");
  process.exit(1);
}

const polygonClient = axios.create({
  baseURL: 'https://api.polygon.io',
  params: { apiKey: POLYGON_API_KEY },
});

app.use(cors());
app.use(express.json());

async function getSnapshotData() {
  const res = await polygonClient.get('/v2/snapshot/locale/us/markets/stocks/tickers');
  return res.data.tickers || [];
}

app.get('/api/screen-stocks', async (req, res) => {
  try {
    const snapshots = await getSnapshotData();

    const results = snapshots.map(d => {
      const { ticker: symbol, day: bar = {}, lastQuote = {} } = d;
      const price = lastQuote.askprice || bar.c;
      const volume = bar.v || 0;
      const perf_1m_pct = bar.c ? ((bar.c - bar.o) / bar.o) * 100 : 0;
      const perf_3m_pct = perf_1m_pct; // Placeholder logic
      const perf_6m_pct = perf_1m_pct; // Placeholder logic
      const market_cap = d. market_cap || 0; // Assuming snapshot includes this

      if (!price || market_cap < 300e6 || volume < 500000) return null;

      if (perf_1m_pct >= 30 && perf_3m_pct >= 60 && perf_6m_pct >= 100) {
        return { symbol, price, volume, perf_1m_pct, perf_3m_pct, perf_6m_pct, category: 'top_tier' };
      }
      if (perf_1m_pct >= 30 && perf_3m_pct >= 60) {
        return { symbol, price, volume, perf_1m_pct, perf_3m_pct, perf_6m_pct, category: 'emerging' };
      }
      return null;
    }).filter(Boolean);

    res.json({
      top_tier_stocks: results.filter(s => s.category === 'top_tier'),
      emerging_momentum_stocks: results.filter(s => s.category === 'emerging'),
    });
  } catch (err) {
    console.error("Error screening stocks:", err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/', (req, res) => res.send('✅ Polygon Stock Screener Backend with Live Data Running'));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
