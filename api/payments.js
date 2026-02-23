// ============================================
// SAVEHYDROO - Payments API
// Vercel Serverless Function (Simulated)
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

// Credit packages
const CREDIT_PACKAGES = [
    { id: 'starter', name: 'Starter Pack', credits: 100, price: 99, currency: 'INR' },
    { id: 'pro', name: 'Pro Pack', credits: 500, price: 399, currency: 'INR' },
    { id: 'ultra', name: 'Ultra Pack', credits: 1500, price: 999, currency: 'INR' }
];

// Premium features
const FEATURES = [
    { id: 'advanced_analytics', name: 'Advanced Analytics', price: 200, description: 'Detailed charts and reports' },
    { id: 'predictions_pro', name: 'Predictions Pro', price: 300, description: 'Extended ML predictions' },
    { id: 'export_data', name: 'Data Export', price: 150, description: 'Export all your data' }
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const path = req.url.split('?')[0];

        if (path.endsWith('/packages')) {
            return res.status(200).json({ success: true, packages: CREDIT_PACKAGES });
        }
        if (path.endsWith('/features')) {
            return res.status(200).json({ success: true, features: FEATURES });
        }
        if (path.endsWith('/initiate')) {
            return await initiatePayment(req, res);
        }
        if (path.endsWith('/complete')) {
            return await completePayment(req, res);
        }
        if (path.endsWith('/history')) {
            return await getHistory(req, res);
        }
        if (path.endsWith('/balance')) {
            return await getBalance(req, res);
        }
        if (path.endsWith('/donate')) {
            return await donateCredits(req, res);
        }
        if (path.endsWith('/unlock-feature')) {
            return await unlockFeature(req, res);
        }

        return res.status(404).json({ error: 'Endpoint not found' });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

async function initiatePayment(req, res) {
    const { userId, type, packageId, amount, description } = req.body;

    if (!userId || !type) {
        return res.status(400).json({ error: 'userId and type are required' });
    }

    let transactionAmount = amount;
    let credits = 0;
    let transactionDescription = description;

    if (type === 'credit_purchase' && packageId) {
        const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
        if (!pkg) {
            return res.status(400).json({ error: 'Invalid package' });
        }
        transactionAmount = pkg.price;
        credits = pkg.credits;
        transactionDescription = `Purchase: ${pkg.name}`;
    }

    // Create transaction record
    const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            type,
            amount: transactionAmount,
            credits,
            description: transactionDescription,
            status: 'initiated'
        })
        .select()
        .single();

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // Simulate payment gateway redirect URL
    const paymentUrl = `https://savehydroo.app/payment/${transaction.id}`;

    return res.status(200).json({
        success: true,
        transaction: {
            id: transaction.id,
            amount: transactionAmount,
            credits,
            status: 'initiated',
            paymentUrl
        },
        message: 'Payment initiated. Complete within 10 minutes.'
    });
}

async function completePayment(req, res) {
    const { transactionId, status = 'successful' } = req.body;

    if (!transactionId) {
        return res.status(400).json({ error: 'transactionId is required' });
    }

    // Get the transaction
    const { data: transaction, error: getError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

    if (getError || !transaction) {
        return res.status(400).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'initiated') {
        return res.status(400).json({ error: 'Transaction already processed' });
    }

    // Simulate random success/failure (90% success rate)
    const finalStatus = status === 'successful' && Math.random() < 0.9 ? 'successful' :
        status === 'failed' ? 'failed' :
            (Math.random() < 0.9 ? 'successful' : 'failed');

    // Update transaction status
    const { error: updateError } = await supabase
        .from('transactions')
        .update({
            status: finalStatus,
            completed_at: new Date().toISOString()
        })
        .eq('id', transactionId);

    if (updateError) {
        return res.status(400).json({ error: updateError.message });
    }

    // If successful, add credits to wallet
    if (finalStatus === 'successful' && transaction.type === 'credit_purchase') {
        const { data: profile } = await supabase
            .from('profiles')
            .select('wallet_balance')
            .eq('id', transaction.user_id)
            .single();

        const newBalance = parseFloat(profile?.wallet_balance || 0) + (transaction.credits || 0);

        await supabase
            .from('profiles')
            .update({ wallet_balance: newBalance })
            .eq('id', transaction.user_id);
    }

    return res.status(200).json({
        success: true,
        transaction: {
            id: transactionId,
            status: finalStatus,
            credits: transaction.credits
        },
        message: finalStatus === 'successful' ?
            'Payment successful! Credits added to your wallet.' :
            'Payment failed. Please try again.'
    });
}

async function getHistory(req, res) {
    const { userId, limit = 50 } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // Calculate totals
    const totals = {
        successful: 0,
        failed: 0,
        pending: 0,
        totalSpent: 0,
        totalCredits: 0
    };

    data.forEach(t => {
        if (t.status === 'successful') {
            totals.successful++;
            totals.totalSpent += parseFloat(t.amount);
            totals.totalCredits += t.credits || 0;
        } else if (t.status === 'failed') {
            totals.failed++;
        } else {
            totals.pending++;
        }
    });

    return res.status(200).json({
        success: true,
        transactions: data,
        totals
    });
}

async function getBalance(req, res) {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', userId)
        .single();

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // Get unlocked features
    const { data: features } = await supabase
        .from('user_features')
        .select('feature_id, unlocked_at')
        .eq('user_id', userId);

    return res.status(200).json({
        success: true,
        balance: parseFloat(profile?.wallet_balance || 0),
        unlockedFeatures: features?.map(f => f.feature_id) || []
    });
}

async function donateCredits(req, res) {
    const { userId, amount, cause = 'water_conservation' } = req.body;

    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'userId and valid amount are required' });
    }

    // Get current balance
    const { data: profile, error: getError } = await supabase
        .from('profiles')
        .select('wallet_balance, points')
        .eq('id', userId)
        .single();

    if (getError) {
        return res.status(400).json({ error: getError.message });
    }

    const currentBalance = parseFloat(profile?.wallet_balance || 0);

    if (currentBalance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create donation transaction
    const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            type: 'donation',
            amount: -amount,
            credits: -amount,
            description: `Donated ${amount} credits to ${cause}`,
            status: 'successful',
            completed_at: new Date().toISOString()
        })
        .select()
        .single();

    if (txError) {
        return res.status(400).json({ error: txError.message });
    }

    // Deduct from wallet and add bonus points
    const bonusPoints = Math.round(amount * 0.5); // 50% of donation as bonus points

    await supabase
        .from('profiles')
        .update({
            wallet_balance: currentBalance - amount,
            points: (profile.points || 0) + bonusPoints
        })
        .eq('id', userId);

    return res.status(200).json({
        success: true,
        donation: {
            amount,
            cause,
            bonusPoints,
            newBalance: currentBalance - amount
        },
        message: `Thank you for donating ${amount} credits! You earned ${bonusPoints} bonus points.`
    });
}

async function unlockFeature(req, res) {
    const { userId, featureId } = req.body;

    if (!userId || !featureId) {
        return res.status(400).json({ error: 'userId and featureId are required' });
    }

    const feature = FEATURES.find(f => f.id === featureId);
    if (!feature) {
        return res.status(400).json({ error: 'Feature not found' });
    }

    // Check if already unlocked
    const { data: existing } = await supabase
        .from('user_features')
        .select('*')
        .eq('user_id', userId)
        .eq('feature_id', featureId)
        .single();

    if (existing) {
        return res.status(400).json({ error: 'Feature already unlocked' });
    }

    // Check balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', userId)
        .single();

    const balance = parseFloat(profile?.wallet_balance || 0);

    if (balance < feature.price) {
        return res.status(400).json({
            error: 'Insufficient credits',
            required: feature.price,
            current: balance
        });
    }

    // Create transaction
    await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            type: 'feature_unlock',
            amount: feature.price,
            description: `Unlocked: ${feature.name}`,
            status: 'successful',
            completed_at: new Date().toISOString()
        });

    // Deduct from wallet
    await supabase
        .from('profiles')
        .update({ wallet_balance: balance - feature.price })
        .eq('id', userId);

    // Unlock feature
    await supabase
        .from('user_features')
        .insert({ user_id: userId, feature_id: featureId });

    return res.status(200).json({
        success: true,
        feature,
        newBalance: balance - feature.price,
        message: `${feature.name} unlocked successfully!`
    });
}
