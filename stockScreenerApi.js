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
      const { ticker: symbol, day: bar = {}, lastTrade = {} } = d;
      const price = lastTrade.p || bar.c;
      if (!bar.o || !bar.c) return null; // skip if missing data

      const perf1m = ((bar.c - bar.o) / bar.o) * 100;
      // These are placeholders—swap in real 3M/6M logic when available
      const perf3m = perf1m;
      const perf6m = perf1m;
      const volume = bar.v || 0;
      const marketCap = d.market_cap || 0;

      if (price < 1 || marketCap < 300e6 || volume < 500000) return null;

      if (perf1m >= 30 && perf3m >= 60 && perf6m >= 100) {
        return { symbol, price, perf1m, perf3m, perf6m, category: 'top_tier' };
      }

      if (perf1m >= 30 && perf3m >= 60 && perf6m < 100) {
        return { symbol, price, perf1m, perf3m, perf6m, category: 'emerging' };
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
