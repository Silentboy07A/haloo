// ============================================
// SAVEHYDROO - Authentication Module
// Handles user authentication with Supabase
// ============================================

const Auth = {
    // Current user state
    user: null,
    profile: null,
    isAuthenticated: false,

    // Demo mode (for testing without Supabase)
    demoMode: true,

    // Supabase client placeholder
    supabase: null,

    // Initialize auth
    init() {
        // Check for stored session
        const storedUser = localStorage.getItem('savehydroo_user');
        if (storedUser) {
            try {
                this.user = JSON.parse(storedUser);
                this.isAuthenticated = true;
                this.loadProfile();
            } catch (e) {
                localStorage.removeItem('savehydroo_user');
            }
        }

        this.setupEventListeners();
        this.updateUI();
    },

    // Setup event listeners
    setupEventListeners() {
        const authBtn = document.getElementById('auth-btn');
        const authModal = document.getElementById('auth-modal');
        const modalClose = document.getElementById('modal-close');
        const authForm = document.getElementById('auth-form');
        const authToggleLink = document.getElementById('auth-toggle-link');
        const googleBtn = document.getElementById('google-login');
        const githubBtn = document.getElementById('github-login');

        if (authBtn) {
            authBtn.addEventListener('click', () => this.toggleModal());
        }

        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeModal());
        }

        if (authModal) {
            authModal.addEventListener('click', (e) => {
                if (e.target === authModal) this.closeModal();
            });
        }

        if (authForm) {
            authForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        if (authToggleLink) {
            authToggleLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAuthMode();
            });
        }

        // OAuth button listeners
        if (googleBtn) {
            googleBtn.addEventListener('click', () => this.loginWithOAuth('google'));
        }

        if (githubBtn) {
            githubBtn.addEventListener('click', () => this.loginWithOAuth('github'));
        }
    },

    // OAuth login
    async loginWithOAuth(provider) {
        try {
            if (this.demoMode) {
                // Demo OAuth - simulate OAuth login
                Toast.show(`Connecting to ${provider}...`, 'info');

                // Simulate OAuth delay
                await new Promise(resolve => setTimeout(resolve, 1000));

                const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
                const randomId = Math.random().toString(36).substring(7);

                this.user = {
                    id: `${provider}-${Date.now()}`,
                    email: `user_${randomId}@${provider}.com`,
                    username: `${providerName}User_${randomId}`,
                    provider: provider,
                    avatar_url: null
                };

                this.profile = {
                    id: this.user.id,
                    username: this.user.username,
                    points: 50, // Bonus points for OAuth signup!
                    level: 1,
                    streak_days: 1,
                    wallet_balance: 150 // Extra credits for OAuth users
                };

                localStorage.setItem('savehydroo_user', JSON.stringify(this.user));
                localStorage.setItem('savehydroo_profile', JSON.stringify(this.profile));

                this.isAuthenticated = true;
                this.closeModal();
                this.updateUI();

                Toast.show(`Welcome! Signed in with ${providerName} (+50 bonus pts!)`, 'success');
                return;
            }

            // Real Supabase OAuth
            // Requires Supabase project with OAuth providers configured
            if (this.supabase) {
                Toast.show(`Redirecting to ${provider}...`, 'info');

                const { data, error } = await this.supabase.auth.signInWithOAuth({
                    provider: provider,
                    options: {
                        redirectTo: window.location.origin + '/auth/callback'
                    }
                });

                if (error) {
                    throw error;
                }

                // OAuth will redirect, so no further action needed here
            } else {
                Toast.show('OAuth not configured. Using demo mode.', 'warning');
                // Fall back to demo mode
                this.demoMode = true;
                await this.loginWithOAuth(provider);
            }

        } catch (error) {
            console.error('OAuth error:', error);
            Toast.show(`${provider} login failed: ${error.message}`, 'error');
        }
    },

    // State: login or signup
    authMode: 'login',

    toggleAuthMode() {
        this.authMode = this.authMode === 'login' ? 'signup' : 'login';
        this.updateModalUI();
    },

    updateModalUI() {
        const title = document.getElementById('auth-title');
        const subtitle = document.getElementById('auth-subtitle');
        const submit = document.getElementById('auth-submit');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleLink = document.getElementById('auth-toggle-link');
        const usernameGroup = document.getElementById('username-group');

        if (this.authMode === 'signup') {
            title.textContent = 'Create Account';
            subtitle.textContent = 'Join SaveHydroo and start saving water';
            submit.textContent = 'Create Account';
            toggleText.textContent = 'Already have an account?';
            toggleLink.textContent = 'Sign in';
            usernameGroup.style.display = 'block';
        } else {
            title.textContent = 'Welcome Back';
            subtitle.textContent = 'Sign in to continue to SaveHydroo';
            submit.textContent = 'Sign In';
            toggleText.textContent = "Don't have an account?";
            toggleLink.textContent = 'Create one';
            usernameGroup.style.display = 'none';
        }
    },

    toggleModal() {
        if (this.isAuthenticated) {
            this.logout();
        } else {
            this.openModal();
        }
    },

    openModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('active');
            this.updateModalUI();
        }
    },

    closeModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    },

    async handleSubmit(e) {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const username = document.getElementById('username')?.value;

        if (this.authMode === 'signup') {
            await this.signup(email, password, username);
        } else {
            await this.login(email, password);
        }
    },

    async signup(email, password, username) {
        try {
            if (this.demoMode) {
                // Demo signup
                this.user = {
                    id: 'demo-' + Date.now(),
                    email,
                    username: username || email.split('@')[0]
                };
                this.profile = {
                    id: this.user.id,
                    username: this.user.username,
                    points: 0,
                    level: 1,
                    streak_days: 0,
                    wallet_balance: 100 // Start with some demo credits
                };

                localStorage.setItem('savehydroo_user', JSON.stringify(this.user));
                localStorage.setItem('savehydroo_profile', JSON.stringify(this.profile));

                this.isAuthenticated = true;
                this.closeModal();
                this.updateUI();

                Toast.show('Account created! Welcome to SaveHydroo!', 'success');
                return;
            }

            // Real Supabase signup would go here
            // const { data, error } = await this.supabase.auth.signUp({ email, password });

        } catch (error) {
            Toast.show('Signup failed: ' + error.message, 'error');
        }
    },

    async login(email, password) {
        try {
            if (this.demoMode) {
                // Demo login
                this.user = {
                    id: 'demo-' + Date.now(),
                    email,
                    username: email.split('@')[0]
                };

                // Load or create profile
                const storedProfile = localStorage.getItem('savehydroo_profile');
                if (storedProfile) {
                    this.profile = JSON.parse(storedProfile);
                } else {
                    this.profile = {
                        id: this.user.id,
                        username: this.user.username,
                        points: 0,
                        level: 1,
                        streak_days: 0,
                        wallet_balance: 100
                    };
                }

                localStorage.setItem('savehydroo_user', JSON.stringify(this.user));

                this.isAuthenticated = true;
                this.closeModal();
                this.updateUI();

                Toast.show('Welcome back!', 'success');
                return;
            }

            // Real Supabase login would go here
            // const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

        } catch (error) {
            Toast.show('Login failed: ' + error.message, 'error');
        }
    },

    logout() {
        this.user = null;
        this.profile = null;
        this.isAuthenticated = false;

        localStorage.removeItem('savehydroo_user');

        this.updateUI();
        Toast.show('Logged out successfully', 'info');
    },

    async loadProfile() {
        if (this.demoMode) {
            const stored = localStorage.getItem('savehydroo_profile');
            if (stored) {
                this.profile = JSON.parse(stored);
            }
            return;
        }

        // Load from API
        // const result = await API.getStats(this.user.id);
        // this.profile = result.stats;
    },

    async updateProfile(updates) {
        if (!this.profile) return;

        Object.assign(this.profile, updates);

        if (this.demoMode) {
            localStorage.setItem('savehydroo_profile', JSON.stringify(this.profile));
        }

        this.updateUI();
    },

    updateUI() {
        const authBtn = document.getElementById('auth-btn');
        const userPoints = document.getElementById('user-points');
        const userLevel = document.getElementById('user-level');
        const userAvatar = document.getElementById('user-avatar');

        if (this.isAuthenticated) {
            if (authBtn) {
                authBtn.textContent = 'Logout';
            }

            if (this.profile) {
                if (userPoints) {
                    userPoints.textContent = `${this.profile.points || 0} pts`;
                }
                if (userLevel) {
                    userLevel.textContent = `Lvl ${this.profile.level || 1}`;
                }
            }

            if (userAvatar) {
                userAvatar.innerHTML = `<span>${this.user?.username?.charAt(0).toUpperCase() || '👤'}</span>`;
            }
        } else {
            if (authBtn) {
                authBtn.textContent = 'Login';
            }
            if (userPoints) {
                userPoints.textContent = '0 pts';
            }
            if (userLevel) {
                userLevel.textContent = 'Lvl 1';
            }
            if (userAvatar) {
                userAvatar.innerHTML = '<span>👤</span>';
            }
        }
    },

    // Get current user ID
    getUserId() {
        return this.user?.id || 'anonymous';
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});

// Export
window.Auth = Auth;
