import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://gjwabhyztjgqurirdwhx.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqd2FiaHl6dGpncXVyaXJkd2h4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU1NDk2OCwiZXhwIjoyMDg2MTMwOTY4fQ.7wRvfSrRwdCqWbLmsAoL3s6DLECg34EekVtnn0pGcTI';

async function seed() {
    console.log('--- Seeding Live Data (Last 100 rows) ---');

    const csvPath = path.join(__dirname, '..', 'ml', 'training_data.csv');
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');

    const records = [];
    // Take the last 100 lines (excluding header)
    const startIdx = Math.max(1, lines.length - 100);
    const now = new Date();

    for (let i = startIdx; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((h, idx) => row[h.trim()] = values[idx]?.trim());

        // Spread the 100 samples across the last ~10 minutes (6 seconds apart)
        // so they look like a continuous live stream in the history
        const offsetSeconds = (lines.length - 1 - i) * 6;
        const liveTs = new Date(now.getTime() - offsetSeconds * 1000).toISOString();

        records.push({
            user_id: null,
            tank_type: 'ro_reject',
            tds: parseFloat(row.ro_reject_tds),
            temperature: parseFloat(row.ro_reject_temperature),
            level: parseFloat(row.ro_reject_level),
            flow_rate: parseFloat(row.ro_reject_flow),
            timestamp: liveTs
        });
        records.push({
            user_id: null,
            tank_type: 'rainwater',
            tds: parseFloat(row.rainwater_tds),
            temperature: parseFloat(row.rainwater_temperature),
            level: parseFloat(row.rainwater_level),
            flow_rate: parseFloat(row.rainwater_flow),
            timestamp: liveTs
        });
        records.push({
            user_id: null,
            tank_type: 'blended',
            tds: parseFloat(row.blended_tds),
            temperature: parseFloat(row.blended_temperature),
            level: parseFloat(row.blended_level),
            flow_rate: parseFloat(row.blended_flow),
            timestamp: liveTs
        });
    }

    console.log(`Parsed ${records.length} live records.`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/sensor_readings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(batch)
        });

        if (resp.ok) {
            console.log(`  OK  Batch ${i / BATCH_SIZE + 1} inserted`);
        } else {
            console.error(`  ERR Batch ${i / BATCH_SIZE + 1} failed: ${resp.status}`);
        }
    }

    console.log('--- Live Seeding Done ---');
}

seed().catch(console.error);
