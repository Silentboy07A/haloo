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
        const result = await API.getBalance(Auth.getUserId());
        if (result?.balance !== undefined) {
            this.updateBalanceDisplay(result.balance);
            this.unlockedFeatures = result.unlockedFeatures || [];
        } else if (Auth.profile) {
            this.updateBalanceDisplay(Auth.profile.wallet_balance || 0);
        }
    },

    async loadHistory() {
        const result = await API.getTransactionHistory(Auth.getUserId());
        this.transactions = result?.transactions || [];
        this.renderHistory();
    },

    updateBalanceDisplay(balance) {
        const el = document.getElementById('wallet-balance');
        if (el) el.textContent = balance.toLocaleString();
    },

    async purchaseCredits(packageId) {
        const pkg = this.packages.find(p => p.id === packageId);
        if (!pkg) return;

        Toast.show(`Processing ${pkg.name}...`, 'info');

        // Simulate payment
        await new Promise(r => setTimeout(r, 1500));

        // 90% success rate
        const success = Math.random() < 0.9;

        if (success) {
            const balance = (Auth.profile?.wallet_balance || 0) + pkg.credits;
            Auth.updateProfile({ wallet_balance: balance });
            this.updateBalanceDisplay(balance);

            this.transactions.unshift({
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
    },

    async unlockFeature(featureId) {
        const feat = this.features.find(f => f.id === featureId);
        if (!feat) return;

        const balance = Auth.profile?.wallet_balance || 0;
        if (balance < feat.price) {
            Toast.show('Insufficient credits!', 'error');
            return;
        }

        const newBalance = balance - feat.price;
        Auth.updateProfile({ wallet_balance: newBalance });
        this.updateBalanceDisplay(newBalance);
        this.unlockedFeatures.push(featureId);

        const card = document.querySelector(`[data-feature="${featureId}"]`);
        if (card) card.classList.add('unlocked');

        Toast.show(`${feat.name} unlocked!`, 'success');
    },

    async donate() {
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

        const newBalance = balance - amount;
        const bonusPoints = Math.round(amount * 0.5);

        Auth.updateProfile({
            wallet_balance: newBalance,
            points: (Auth.profile.points || 0) + bonusPoints
        });

        this.updateBalanceDisplay(newBalance);
        Gamification.updateUI();
        Auth.updateUI();

        if (input) input.value = '';
        Toast.show(`Donated ${amount} credits! +${bonusPoints} bonus points`, 'success');
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
