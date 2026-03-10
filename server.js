// ============================================
// SaveHydroo - Express Server
// Proxies all API routes to Supabase Edge Functions
// Serves static frontend on /
// ============================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Supabase edge function base URL
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// ── Middleware ────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check (for Azure + Docker) ────────
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        supabase: SUPABASE_URL ? 'configured' : 'NOT SET'
    });
});

// Debug tool: definitively verify which container image is active on Azure
app.get('/api/version', (req, res) => {
    res.status(200).json({ version: '1.4' });
});

// ── Edge Function Proxy Helper ────────────────
async function proxyToEdge(edgeFunction, req, res) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Supabase environment variables not configured' });
    }

    try {
        // Build the target URL — preserve query string
        const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const targetUrl = `${EDGE_BASE}/${edgeFunction}${queryString}`;

        // Forward the request to the edge function
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
        };

        // Attach body for non-GET requests
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const edgeRes = await fetch(targetUrl, fetchOptions);
        const data = await edgeRes.json();

        // Mirror the status code from the edge function
        return res.status(edgeRes.status).json(data);

    } catch (err) {
        console.error(`Edge proxy error [${edgeFunction}]:`, err);
        return res.status(502).json({ error: 'Failed to reach edge function', message: err.message });
    }
}

// ── API Routes → Supabase Edge Functions ──────

// sensor-data GET/POST  →  sensor-ingest edge function
app.all('/api/sensor-data*', (req, res) => proxyToEdge('sensor-ingest', req, res));

// predictions  →  ml-predict edge function
app.all('/api/predictions*', (req, res) => proxyToEdge('ml-predict', req, res));

// gamification →  gamification edge function
app.all('/api/gamification*', (req, res) => proxyToEdge('gamification', req, res));

// payments     →  payment edge function
app.all('/api/payments*', (req, res) => proxyToEdge('payment', req, res));

// alerts       →  alert-check edge function
app.all('/api/alerts*', (req, res) => proxyToEdge('alert-check', req, res));

// ── Static Frontend ───────────────────────────
const frontendPath = path.join(__dirname, 'frontend');
app.use(express.static(frontendPath));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Start ─────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SaveHydroo running on http://0.0.0.0:${PORT}`);
    console.log(`   Supabase URL:  ${SUPABASE_URL || '⚠️  NOT SET'}`);
    console.log(`   Edge base:     ${EDGE_BASE}`);
    console.log(`   Proxied routes: /api/sensor-data → sensor-ingest`);
    console.log(`                   /api/predictions  → ml-predict`);
    console.log(`                   /api/gamification → gamification`);
    console.log(`                   /api/payments     → payment`);
    console.log(`                   /api/alerts       → alert-check`);
});
