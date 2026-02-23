// ============================================
// SAVEHYDROO - Sensor Data API
// Vercel Serverless Function
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        switch (req.method) {
            case 'GET':
                return await getSensorData(req, res);
            case 'POST':
                return await saveSensorData(req, res);
            default:
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

async function getSensorData(req, res) {
    const { userId, tankType, limit = 100, latest = false } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    if (latest === 'true') {
        // Get latest reading for each tank
        const readings = {};

        for (const type of ['ro_reject', 'rainwater', 'blended']) {
            const { data, error } = await supabase
                .from('sensor_readings')
                .select('*')
                .eq('user_id', userId)
                .eq('tank_type', type)
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();

            if (!error && data) {
                readings[type] = {
                    tds: parseFloat(data.tds),
                    temperature: parseFloat(data.temperature),
                    level: parseFloat(data.water_level),
                    flowRate: parseFloat(data.flow_rate),
                    timestamp: data.timestamp
                };
            }
        }

        return res.status(200).json({ success: true, readings });
    }

    // Get historical readings
    let query = supabase
        .from('sensor_readings')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(parseInt(limit));

    if (tankType) {
        query = query.eq('tank_type', tankType);
    }

    const { data, error } = await query;

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, readings: data });
}

async function saveSensorData(req, res) {
    const { userId, readings } = req.body;

    if (!userId || !readings) {
        return res.status(400).json({ error: 'userId and readings are required' });
    }

    const insertData = [];

    for (const [tankType, reading] of Object.entries(readings)) {
        insertData.push({
            user_id: userId,
            tank_type: tankType,
            tds: reading.tds,
            temperature: reading.temperature,
            water_level: reading.level,
            flow_rate: reading.flowRate
        });
    }

    const { data, error } = await supabase
        .from('sensor_readings')
        .insert(insertData);

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({
        success: true,
        message: 'Sensor data saved',
        count: insertData.length
    });
}
