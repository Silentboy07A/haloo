// ============================================
// SAVEHYDROO - Authentication Module
// Real Supabase Auth (Google OAuth + Email)
// ============================================

// SUPABASE_URL and SUPABASE_ANON_KEY are declared in edge-api.js (loaded first)

const Auth = {
    user: null,
    profile: null,
    isAuthenticated: false,
    supabase: null,

    // ── Initialise ────────────────────────────
    async init() {
        // Boot Supabase client (loaded from CDN in index.html)
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true   // picks up OAuth redirect automatically
            }
        });

        // Handle OAuth redirect — Supabase puts tokens in the URL hash
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            await this._onSignedIn(session.user);
        }

        // Listen for auth state changes (login, logout, token refresh)
        this.supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                await this._onSignedIn(session.user);
            } else {
                this._onSignedOut();
            }
        });

        this.setupEventListeners();
        this.updateUI();

        // Force login if not authenticated
        if (!this.isAuthenticated) {
            this.openModal();
            const mainContent = document.querySelector('.main-content');
            const mainNav = document.getElementById('main-nav');
            if (mainNav) mainNav.style.display = 'none';
            if (mainContent) mainContent.style.display = 'none';
        }
    },

    // Called whenever a user is authenticated
    async _onSignedIn(user) {
        this.user = user;
        this.isAuthenticated = true;

        // Sync user ID into EdgeAPI so all edge function calls use the real UUID
        if (window.EdgeAPI) {
            EdgeAPI.setUserId(user.id);
            const session = (await this.supabase.auth.getSession()).data.session;
            if (session?.access_token) EdgeAPI.setAuthToken(session.access_token);
        }

        // Upsert profile row (safe to call on every login)
        await this._ensureProfile(user);
        await this.loadProfile();

        // Refresh wallet/history now that user is authenticated
        if (window.Payments) {
            setTimeout(() => { Payments.loadBalance(); Payments.loadHistory(); }, 300);
        }

        const mainContent = document.querySelector('.main-content');
        const mainNav = document.getElementById('main-nav');
        if (mainNav) mainNav.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'block';

        this.closeModal();
        this.updateUI();

        // Start dashboard if it hasn't been started
        if (window.Dashboard && !window.Dashboard.isRunning) {
            window.Dashboard.start();
        }

        Toast.show(`Welcome, ${user.user_metadata?.full_name || user.email?.split('@')[0] || 'Water Saver'}! 💧`, 'success');
    },

    _onSignedOut() {
        this.user = null;
        this.profile = null;
        this.isAuthenticated = false;

        try { if (window.EdgeAPI) EdgeAPI.logout(); } catch (e) { console.warn(e); }

        try {
            // Reset wallet display
            const walletEl = document.getElementById('wallet-balance');
            if (walletEl) walletEl.textContent = '0';
        } catch (e) { }

        const mainContent = document.querySelector('.main-content');
        const mainNav = document.getElementById('main-nav');
        if (mainNav) mainNav.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';

        try { if (window.Dashboard) window.Dashboard.stop(); } catch (e) { }

        this.openModal();
        this.updateUI();
        // Force reload to completely clear all SPA state and active intervals
        setTimeout(() => location.reload(), 1500);
    },

    // Create profile row if it doesn't exist yet
    async _ensureProfile(user) {
        const username =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            `user_${user.id.slice(0, 8)}`;

        const avatar_url =
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            null;

        const { error } = await this.supabase
            .from('profiles')
            .upsert(
                { id: user.id, username, avatar_url },
                { onConflict: 'id', ignoreDuplicates: true }
            );

        if (error) console.warn('Profile upsert warning:', error.message);
    },

    // Update profile stats in Supabase
    async updateProfile(updates) {
        if (!this.user) return { error: new Error('Not logged in') };
        const { error } = await this.supabase
            .from('profiles')
            .update(updates)
            .eq('id', this.user.id);

        if (!error && this.profile) {
            this.profile = { ...this.profile, ...updates };
            this.updateUI();
        }
        return { error };
    },

    // Load profile stats from Supabase
    async loadProfile() {
        if (!this.user) return;
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', this.user.id)
            .single();

        if (!error && data) {
            this.profile = data;
            this.updateUI();

            // Sync dependent UI state that requires an active profile 
            if (window.Payments) {
                Payments.updateBalanceDisplay(data.wallet_balance || 0);
                Payments.loadHistory();
            }
            if (window.Gamification) {
                Gamification.loadAchievements();
                Gamification.updateUI();
            }
            if (window.Dashboard && window.Dashboard.stats) {
                Dashboard.stats.totalWaterSaved = data.total_water_saved || 0;
                Dashboard.stats.totalRainwaterUsed = data.total_rainwater_used || 0;
                Dashboard.updateStatsDisplay();
            }
        }
    },

    // ── Event Listeners ───────────────────────
    setupEventListeners() {
        const authBtn = document.getElementById('auth-btn');
        const authModal = document.getElementById('auth-modal');
        const authForm = document.getElementById('auth-form');
        const authToggle = document.getElementById('auth-toggle-link');
        const googleBtn = document.getElementById('google-login');
        const forgotLink = document.querySelector('.forgot-link');

        // 'authBtn' click behavior handles both login and logout
        authBtn?.addEventListener('click', () => {
            if (this.isAuthenticated) {
                this.logout();
            } else {
                this.openModal();
            }
        });

        authModal?.addEventListener('click', (e) => { if (e.target === authModal && this.isAuthenticated) this.closeModal(); });
        authForm?.addEventListener('submit', (e) => this.handleSubmit(e));
        authToggle?.addEventListener('click', (e) => { e.preventDefault(); this.toggleAuthMode(); });
        googleBtn?.addEventListener('click', () => this.loginWithGoogle());
        // 'Forgot Password?' becomes 'Send Magic Link' for passwordless login
        forgotLink?.addEventListener('click', (e) => { e.preventDefault(); this.sendMagicLink(); });
    },

    // ── Google OAuth ──────────────────────────
    async loginWithGoogle() {
        try {
            this._setLoading(true, 'google-login', 'Connecting...');

            const { error } = await this.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account',  // always show account picker
                    }
                }
            });

            if (error) throw error;
            // Browser will redirect to Google — no further action needed

        } catch (err) {
            console.error('Google OAuth error:', err);
            Toast.show('Google sign-in failed: ' + err.message, 'error');
            this._setLoading(false, 'google-login', 'Continue with Google');
        }
    },

    // ── Email Auth ────────────────────────────
    authMode: 'login',

    toggleAuthMode() {
        this.authMode = this.authMode === 'login' ? 'signup' : 'login';
        this.updateModalUI();
    },

    async handleSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const username = document.getElementById('username')?.value.trim();

        if (this.authMode === 'signup') {
            await this.signup(email, password, username);
        } else {
            await this.login(email, password);
        }
    },

    async signup(email, password, username) {
        try {
            this._setLoading(true, 'auth-submit', 'Creating account...');

            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });

            if (error) throw error;

            if (data.user && !data.session) {
                Toast.show('Check your email to confirm your account!', 'info');
                this.closeModal();
            } else {
                Toast.show('Account created! Welcome to SaveHydroo 💧', 'success');
            }
        } catch (err) {
            Toast.show('Signup failed: ' + err.message, 'error');
        } finally {
            this._setLoading(false, 'auth-submit', 'Create Account');
        }
    },

    async login(email, password) {
        try {
            this._setLoading(true, 'auth-submit', 'Signing in...');

            const { error } = await this.supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if (error.message.toLowerCase().includes('email not confirmed')) {
                    Toast.show('Email not confirmed yet. Use \'Send Magic Link\' below to sign in instantly!', 'warning', 8000);
                    const fl = document.querySelector('.forgot-link');
                    if (fl) fl.textContent = 'Send Magic Link';
                    return;
                }
                throw error;
            }
        } catch (err) {
            Toast.show('Login failed: ' + err.message, 'error');
        } finally {
            this._setLoading(false, 'auth-submit', 'Sign In');
        }
    },

    // Send magic link (passwordless login via email)
    async sendMagicLink() {
        const email = document.getElementById('email').value.trim();
        if (!email) {
            Toast.show('Enter your email address first', 'warning');
            return;
        }
        const forgotBtn = document.querySelector('.forgot-link');
        if (forgotBtn) forgotBtn.textContent = 'Sending...';

        const { error } = await this.supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin }
        });
        if (error) {
            Toast.show('Failed to send magic link: ' + error.message, 'error');
            if (forgotBtn) forgotBtn.textContent = 'Send Magic Link';
        } else {
            Toast.show('✉️ Magic link sent! Check your email inbox to sign in.', 'success', 7000);
            if (forgotBtn) forgotBtn.textContent = 'Magic Link Sent ✓';
        }
    },

    async logout() {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            Toast.show('Logged out successfully', 'info');
        } catch (err) {
            console.error('Logout error:', err.message);
            // If the server network request fails, forcefully log out locally
            // to prevent getting stuck in a ghost-logged-in UI state.
            this._onSignedOut();
            Toast.show('Forced local logout', 'info');
        }
    },

    // ── Modal ─────────────────────────────────
    openModal() {
        document.getElementById('auth-modal')?.classList.add('active');
        this.updateModalUI();
    },

    closeModal() {
        if (!this.isAuthenticated) {
            Toast.show('You must sign in to view the dashboard.', 'warning');
            return;
        }
        document.getElementById('auth-modal')?.classList.remove('active');
    },

    updateModalUI() {
        const isSignup = this.authMode === 'signup';
        const t = document.getElementById('auth-title');
        const s = document.getElementById('auth-subtitle');
        const sb = document.getElementById('auth-submit');
        const tt = document.getElementById('auth-toggle-text');
        const tl = document.getElementById('auth-toggle-link');
        const ug = document.getElementById('username-group');

        if (t) t.textContent = isSignup ? 'Create Account' : 'Welcome Back';
        if (s) s.textContent = isSignup ? 'Join SaveHydroo and start saving water' : 'Sign in to continue to SaveHydroo';
        if (sb) sb.querySelector('.btn-text').textContent = isSignup ? 'Create Account' : 'Sign In';
        if (tt) tt.textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
        if (tl) tl.textContent = isSignup ? 'Sign in' : 'Create one';
        if (ug) ug.style.display = isSignup ? 'block' : 'none';
        // Update forgot/magic link label
        const fl = document.querySelector('.forgot-link');
        if (fl) fl.textContent = isSignup ? 'Forgot Password?' : 'Send Magic Link';
    },

    // ── UI ────────────────────────────────────
    updateUI() {
        const authBtn = document.getElementById('auth-btn');
        const userPts = document.getElementById('user-points');
        const userLvl = document.getElementById('user-level');
        const userAvtr = document.getElementById('user-avatar');

        if (this.isAuthenticated) {
            if (authBtn) authBtn.textContent = 'Logout';

            if (this.profile) {
                if (userPts) userPts.textContent = `${this.profile.points || 0} pts`;
                if (userLvl) userLvl.textContent = `Lvl ${this.profile.level || 1}`;
            }

            if (userAvtr) {
                const pic = this.user?.user_metadata?.avatar_url || this.user?.user_metadata?.picture;
                if (pic) {
                    userAvtr.innerHTML = `<img src="${pic}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                } else {
                    const initial = (this.profile?.username || this.user?.email || 'U').charAt(0).toUpperCase();
                    userAvtr.innerHTML = `<span>${initial}</span>`;
                }
            }
        } else {
            if (authBtn) authBtn.textContent = 'Login';
            if (userPts) userPts.textContent = '0 pts';
            if (userLvl) userLvl.textContent = 'Lvl 1';
            if (userAvtr) userAvtr.innerHTML = '<span>👤</span>';
        }
    },

    // ── Helpers ───────────────────────────────
    getUserId() {
        return this.user?.id || 'anonymous';
    },

    _setLoading(loading, btnId, label) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = loading;
        const textEl = btn.querySelector('span') || btn;
        textEl.textContent = label;
    }
};

// Kick off after DOM + Supabase CDN are ready
document.addEventListener('DOMContentLoaded', () => Auth.init());

window.Auth = Auth;
