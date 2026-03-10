// ============================================
// SAVEHYDROO - Payments Module
// ============================================

const Payments = {
    packages: [
        { id: 'starter', name: 'Starter Pack', credits: 100, price: 99 },
        { id: 'pro', name: 'Pro Pack', credits: 500, price: 399 },
        { id: 'ultra', name: 'Ultra Pack', credits: 1500, price: 999 }
    ],

    features: [
        { id: 'advanced_analytics', name: 'Advanced Analytics', price: 200 },
        { id: 'predictions_pro', name: 'Predictions Pro', price: 300 },
        { id: 'export_data', name: 'Data Export', price: 150 }
    ],

    unlockedFeatures: [],
    transactions: [],

    init() {
        this.loadBalance();
        this.loadHistory();
        this.setupEventListeners();
    },

    setupEventListeners() {
        document.querySelectorAll('.package-card .btn-buy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pkg = e.target.closest('.package-card').dataset.package;
                this.purchaseCredits(pkg);
            });
        });

        document.querySelectorAll('.feature-card .btn-unlock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const feat = e.target.closest('.feature-card').dataset.feature;
                this.unlockFeature(feat);
            });
        });

        const donateBtn = document.getElementById('donate-btn');
        if (donateBtn) {
            donateBtn.addEventListener('click', () => this.donate());
        }
    },

    async loadBalance() {
        if (!Auth.isAuthenticated) return;

        // Wait for auth profile to load if it hasn't yet
        if (!Auth.profile) {
            await Auth.loadProfile();
        }

        if (Auth.profile) {
            this.updateBalanceDisplay(Auth.profile.wallet_balance || 0);

            // Try loading unlocked features from DB
            try {
                if (window.EdgeAPI && Auth.supabase && Auth.user) {
                    const { data, error } = await Auth.supabase
                        .from('user_features')
                        .select('feature_id')
                        .eq('user_id', Auth.user.id);

                    if (error) throw error;

                    if (data) {
                        this.unlockedFeatures = data.map(f => f.feature_id);
                        this.unlockedFeatures.forEach(id => {
                            const card = document.querySelector(`[data-feature="${id}"]`);
                            if (card) card.classList.add('unlocked');
                        });
                    }
                }
            } catch (e) {
                console.warn('Failed to load unlocked features', e);
            }
        }
    },

    async loadHistory() {
        if (!Auth.isAuthenticated || !window.EdgeAPI) return;

        try {
            const result = await EdgeAPI.getTransactionHistory();
            this.transactions = result?.transactions || [];
        } catch (e) {
            console.warn('Failed to load history', e);
        }
        this.renderHistory();
    },

    updateBalanceDisplay(balance) {
        const el = document.getElementById('wallet-balance');
        if (el) el.textContent = balance.toLocaleString();
    },

    async purchaseCredits(packageId) {
        const pkg = this.packages.find(p => p.id === packageId);
        if (!pkg) return;

        if (!Auth.isAuthenticated) {
            Toast.show('Please log in to purchase credits', 'warning');
            return;
        }

        Toast.show(`Processing ${pkg.name}...`, 'info');

        try {
            if (!window.EdgeAPI) {
                Toast.show('EdgeAPI not connected.', 'error');
                return;
            }

            // Call real Edge Function payment simulator
            const result = await EdgeAPI.initiatePayment('credit_purchase', packageId);
            const success = result?.success;
            const transaction = result?.transaction;

            if (success) {
                // Ensure profile updates with new wallet balance
                await Auth.loadProfile();
                this.updateBalanceDisplay(Auth.profile?.wallet_balance || 0);

                this.transactions.unshift(transaction || {
                    type: 'credit_purchase',
                    amount: pkg.price,
                    credits: pkg.credits,
                    status: 'successful',
                    description: `Purchased ${pkg.name}`,
                    created_at: new Date().toISOString()
                });

                this.renderHistory();
                Toast.show(`${pkg.credits} credits added!`, 'success');
            } else {
                Toast.show('Payment failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Payment error:', error);
            Toast.show('Payment processing error.', 'error');
        }
    },

    async unlockFeature(featureId) {
        const feat = this.features.find(f => f.id === featureId);
        if (!feat) return;

        if (!Auth.isAuthenticated) {
            Toast.show('Please log in to unlock features', 'warning');
            return;
        }

        const balance = Auth.profile?.wallet_balance || 0;
        if (balance < feat.price) {
            Toast.show('Insufficient credits!', 'error');
            return;
        }

        try {
            if (!window.EdgeAPI) {
                Toast.show('EdgeAPI not connected.', 'error');
                return;
            }

            const result = await EdgeAPI.initiatePayment('feature_unlock', null, featureId);
            const success = result?.success;
            const transaction = result?.transaction;

            if (success) {
                await Auth.loadProfile();
                this.updateBalanceDisplay(Auth.profile?.wallet_balance || 0);
                this.unlockedFeatures.push(featureId);

                const card = document.querySelector(`[data-feature="${featureId}"]`);
                if (card) card.classList.add('unlocked');

                if (transaction) {
                    this.transactions.unshift(transaction);
                    this.renderHistory();
                }

                Toast.show(`${feat.name} unlocked!`, 'success');
            } else {
                Toast.show('Unlock failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Unlock error:', error);
            Toast.show('Failed to process unlock.', 'error');
        }
    },

    async donate() {
        if (!Auth.isAuthenticated) {
            Toast.show('Please log in to donate credits', 'warning');
            return;
        }

        const input = document.getElementById('donate-amount');
        const amount = parseInt(input?.value || 0);

        if (amount <= 0) {
            Toast.show('Enter a valid amount', 'warning');
            return;
        }

        const balance = Auth.profile?.wallet_balance || 0;
        if (balance < amount) {
            Toast.show('Insufficient balance', 'error');
            return;
        }

        try {
            if (!window.EdgeAPI) {
                Toast.show('EdgeAPI not connected.', 'error');
                return;
            }

            const bonusPoints = Math.round(amount * 0.5);
            const result = await EdgeAPI.initiatePayment('donation', null, null, amount, 'Donated credits');
            const success = result?.success;
            const transaction = result?.transaction;

            if (success) {
                await Auth.loadProfile();
                this.updateBalanceDisplay(Auth.profile?.wallet_balance || 0);
                Gamification.updateUI();
                Auth.updateUI();

                if (transaction) {
                    this.transactions.unshift(transaction);
                    this.renderHistory();
                }

                if (input) input.value = '';
                Toast.show(`Donated ${amount} credits! +${bonusPoints} bonus points`, 'success');
            } else {
                Toast.show('Donation failed.', 'error');
            }
        } catch (error) {
            console.error('Donation error:', error);
            Toast.show('Error processing donation.', 'error');
        }
    },

    renderHistory() {
        const container = document.getElementById('transaction-history');
        if (!container) return;

        if (this.transactions.length === 0) {
            container.innerHTML = '<p style="padding:1rem;color:#6b7280">No transactions yet</p>';
            return;
        }

        container.innerHTML = this.transactions.slice(0, 10).map(t => `
      <div class="transaction-item">
        <div class="transaction-icon ${t.type === 'donation' ? 'debit' : 'credit'}">
          ${t.type === 'credit_purchase' ? '💳' : t.type === 'donation' ? '🎁' : '🔓'}
        </div>
        <div class="transaction-info">
          <span class="transaction-desc">${t.description || t.type}</span>
          <span class="transaction-date">${new Date(t.created_at).toLocaleDateString()}</span>
        </div>
        <span class="transaction-amount ${t.type === 'donation' ? 'negative' : 'positive'}">
          ${t.type === 'donation' ? '-' : '+'}${t.credits || t.amount}
        </span>
        <span class="transaction-status ${t.status}">${t.status}</span>
      </div>
    `).join('');
    }
};

window.Payments = Payments;
