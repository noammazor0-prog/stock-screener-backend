// stockScreenerApi.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
if (!FINNHUB_API_KEY) {
    console.error("FATAL ERROR: FINNHUB_API_KEY environment variable not set.");
}

const finnhubClient = axios.create({
    baseURL: 'https://finnhub.io/api/v1',
    params: { token: FINNHUB_API_KEY },
});

app.use(cors());
app.use(express.json());

const getStockSymbols = async () => {
    try {
        const response = await finnhubClient.get('/stock/symbol?exchange=US');
        return response.data
            .filter(s => s.type === 'COMMON_STOCK' && !s.symbol.includes('.'))
            .map(s => s.symbol);
    } catch (error) {
        console.error("Error fetching stock symbols:", error.message);
        return [];
    }
};

const getStockProfile = async (symbol) => {
    try {
        const response = await finnhubClient.get('/stock/profile2', { params: { symbol } });
        return response.data;
    } catch (error) { return null; }
};

const getQuote = async (symbol) => {
    try {
        const response = await finnhubClient.get('/quote', { params: { symbol } });
        return response.data;
    } catch (error) { return null; }
};

const getTechnicalsAndPerformance = async (symbol) => {
    try {
        const to = Math.floor(Date.now() / 1000);
        const from6M = to - (180 * 24 * 60 * 60);

        const [rsiResponse, candlesResponse] = await Promise.all([
             finnhubClient.get('/indicator', { params: { symbol, resolution: 'D', indicator: 'rsi', indicator_fields: { timeperiod: 14 } } }),
             finnhubClient.get('/stock/candle', { params: { symbol, resolution: 'D', from: from6M, to } })
        ]);

        const candles = candlesResponse.data;
        if (!candles || !candles.c || candles.c.length < 126) return null;

        const calculateSMA = (data, period) => {
             if (data.length < period) return null;
             const sum = data.slice(-period).reduce((acc, val) => acc + val, 0);
             return sum / period;
        };

        const calculateEMA = (data, period) => {
            if (data.length < period) return null;
            const k = 2 / (period + 1);
            let ema = calculateSMA(data.slice(0, period), period);
            if(ema === null) return null;
            for (let i = period; i < data.length; i++) {
                ema = (data[i] * k) + (ema * (1 - k));
            }
            return ema;
        };

        const adr = (() => {
            const period = 14;
            if (candles.h.length < period) return null;
            const recentHighs = candles.h.slice(-period);
            const recentLows = candles.l.slice(-period);
            let totalRange = 0;
            for (let i = 0; i < period; i++) {
                totalRange += (recentHighs[i] - recentLows[i]) / recentLows[i];
            }
            return (totalRange / period) * 100;
        })();

        const performance = (() => {
            const prices = candles.c;
            const currentPrice = prices[prices.length - 1];
            return {
                perf_1m_pct: ((currentPrice - prices[prices.length - 21]) / prices[prices.length - 21]) * 100,
                perf_3m_pct: ((currentPrice - prices[prices.length - 63]) / prices[prices.length - 63]) * 100,
                perf_6m_pct: ((currentPrice - prices[prices.length - 126]) / prices[prices.length - 126]) * 100,
            };
        })();

        return {
            rsi: rsiResponse.data.rsi.pop(),
            ema10: calculateEMA(candles.c, 10),
            ema21: calculateEMA(candles.c, 21),
            adr: adr,
            ...performance
        };
    } catch (error) {
        return null;
    }
};

app.get('/api/screen-stocks', async (req, res) => {
    console.log('Received request to screen stocks...');
    if (!FINNHUB_API_KEY) {
        return res.status(500).json({ error: "Backend is not configured. Finnhub API key is missing." });
    }

    try {
        const symbols = await getStockSymbols();
        const symbolBatch = symbols.slice(0, 150);

        const promises = symbolBatch.map(async (symbol) => {
            const [profile, quote] = await Promise.all([getStockProfile(symbol), getQuote(symbol)]);
            if (!profile || !quote || !profile.marketCapitalization) return null;

            const marketCap = profile.marketCapitalization * 1e6;
            const currentPrice = quote.c;
            const beta = profile.beta;

            if (currentPrice <= 1) return null;
            if (marketCap <= 300 * 1e6) return null;
            if (!beta || beta < 1.1) return null;

            const tech = await getTechnicalsAndPerformance(symbol);
            if (!tech) return null;

            if (tech.rsi >= 70) return null;
            if (tech.adr < 5) return null;
            if (tech.ema10 <= tech.ema21) return null;
            if (currentPrice <= tech.ema10) return null;

            const meets1M = tech.perf_1m_pct >= 30;
            const meets3M = tech.perf_3m_pct >= 60;
            const meets6M = tech.perf_6m_pct >= 100;

            const stockData = {
                symbol,
                company_name: profile.name,
                price: currentPrice,
                price_change_abs: quote.d,
                price_change_pct: quote.dp,
                volume_90d_avg: 'N/A',
                perf_1m_pct: tech.perf_1m_pct,
                perf_3m_pct: tech.perf_3m_pct,
                perf_6m_pct: tech.perf_6m_pct,
                market_cap_billions: marketCap / 1e9,
                sector: profile.finnhubIndustry,
                week_52_high: 0,
                week_52_low: 0,
                rsi: tech.rsi,
                beta,
            };

            if (meets1M && meets3M && meets6M) return { ...stockData, category: 'top_tier' };
            if (meets1M && meets3M) return { ...stockData, category: 'emerging' };
            return null;
        });

        const results = (await Promise.all(promises)).filter(Boolean);
        const response = {
            top_tier_stocks: results.filter(s => s.category === 'top_tier'),
            emerging_momentum_stocks: results.filter(s => s.category === 'emerging'),
        };

        console.log(`Screening complete. Found ${response.top_tier_stocks.length} top tier and ${response.emerging_momentum_stocks.length} emerging stocks.`);
        res.json(response);

    } catch (error) {
        console.error("Error in /api/screen-stocks:", error);
        res.status(500).json({ error: "Failed to screen stocks." });
    }
});

app.listen(PORT, () => {
    console.log(`Stock Screener API server running on http://localhost:${PORT}`);
});
