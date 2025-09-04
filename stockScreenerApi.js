// stockScreenerApi.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
if (!POLYGON_API_KEY) {
    console.error("FATAL ERROR: POLYGON_API_KEY not set.");
    process.exit(1);
}

const polygon = axios.create({
    baseURL: 'https://api.polygon.io',
    params: { apiKey: POLYGON_API_KEY }
});

app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
    res.send('✅ Polygon-based Stock Screener Backend is running!');
});

// Helper to fetch a sample of US stock tickers
const getStockSymbols = async () => {
    try {
        const res = await polygon.get('/v3/reference/tickers', {
            params: {
                market: 'stocks',
                active: true,
                limit: 150
            }
        });
        return res.data.results.map(r => r.ticker);
    } catch (e) {
        console.error('Error fetching tickers:', e.message);
        return [];
    }
};

// Fetch historical daily close prices
const getHistorical = async (symbol, from, to) => {
    const res = await polygon.get(`/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`);
    return res.data.results || [];
};

// Simple EMA calculation
const calculateEMA = (data, period) => {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b.c, 0) / period;
    for (let i = period; i < data.length; i++) {
        ema = data[i].c * k + ema * (1 - k);
    }
    return ema;
};

// ADR: daily range average percentage
const calculateADR = (data, period = 14) => {
    if (data.length < period) return null;
    const recent = data.slice(-period);
    const sum = recent.reduce((acc, candle) => acc + ((candle.h - candle.l) / candle.l), 0);
    return (sum / period) * 100;
};

// Calculate percentage performance
const calculatePerformance = (data) => {
    const len = data.length;
    const current = data[len - 1].c;
    return {
        perf_1m: len >= 21 ? (current - data[len - 21].c) / data[len - 21].c * 100 : null,
        perf_3m: len >= 63 ? (current - data[len - 63].c) / data[len - 63].c * 100 : null,
        perf_6m: len >= 126 ? (current - data[len - 126].c) / data[len - 126].c * 100 : null
    };
};

// Main screener endpoint
app.get('/api/screen-stocks', async (req, res) => {
    try {
        const symbols = await getStockSymbols();
        const cutoff = Math.floor(Date.now() / 1000);
        const from = cutoff - 180 * 24 * 60 * 60; // ~6 months ago

        const screenPromises = symbols.map(async (sym) => {
            try {
                const history = await getHistorical(sym, from, cutoff);
                if (history.length < 126) return null;

                const ema10 = calculateEMA(history, 10);
                const ema21 = calculateEMA(history, 21);
                if (!ema10 || !ema21 || ema10 <= ema21 || history[history.length - 1].c <= ema10) return null;

                const adr = calculateADR(history);
                if (!adr || adr < 5) return null;

                const perf = calculatePerformance(history);
                if (perf.perf_1m < 30 || perf.perf_3m < 60) return null;

                const profile = await polygon.get('/v1/meta/symbols/' + sym + '/company');
                const priceHistory = await polygon.get(`/v1/last/stocks/${sym}`);

                const stockData = {
                    symbol: sym,
                    company_name: profile.data.name,
                    price: priceHistory.data.last.price,
                    perf_1m_pct: perf.perf_1m,
                    perf_3m_pct: perf.perf_3m,
                    perf_6m_pct: perf.perf_6m,
                    ema10,
                    ema21,
                    adr,
                    sector: profile.data.ticker ?
                        profile.data.industry : null
                };

                if (perf.perf_6m >= 100) return { ...stockData, category: 'top_tier' };
                return { ...stockData, category: 'emerging' };

            } catch { return null; }
        });

        const results = (await Promise.all(screenPromises)).filter(x => x);
        res.json({
            top_tier_stocks: results.filter(r => r.category === 'top_tier'),
            emerging_momentum_stocks: results.filter(r => r.category === 'emerging')
        });

    } catch (error) {
        console.error('Screening error:', error.message);
        res.status(500).json({ error: 'Failed to screen stocks' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
