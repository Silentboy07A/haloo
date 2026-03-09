// ============================================
// SAVEHYDROO - Gamification Module
// ============================================

const Gamification = {
    levels: [
        { level: 1, name: 'Water Beginner', minPoints: 0, icon: '💧' },
        { level: 2, name: 'Eco Learner', minPoints: 101, icon: '🌱' },
        { level: 3, name: 'Water Saver', minPoints: 501, icon: '🌿' },
        { level: 4, name: 'Hydro Master', minPoints: 1501, icon: '🌊' },
        { level: 5, name: 'Aqua Legend', minPoints: 5001, icon: '👑' }
    ],

    achievements: [],
    leaderboard: [],

    init() {
        this.loadAchievements();
        this.loadLeaderboard();
        this.updateUI();
    },

    async loadAchievements() {
        if (!window.EdgeAPI) return;
        try {
            const result = await EdgeAPI.getStats(EdgeAPI.userId);
            this.achievements = result?.achievements || [];
            this.renderAchievements();
        } catch (e) {
            console.warn("EdgeAPI achievements failed", e);
        }
    },

    async loadLeaderboard() {
        if (!window.EdgeAPI) return;
        try {
            const result = await EdgeAPI.getLeaderboard();
            this.leaderboard = result?.leaderboard || [];
            this.renderLeaderboard();
        } catch (e) {
            console.warn("EdgeAPI leaderboard failed", e);
        }
    },

    renderAchievements() {
        const grid = document.getElementById('achievements-grid');
        if (!grid) return;

        grid.innerHTML = this.achievements.map(a => `
      <div class="achievement-card ${a.earned ? 'earned' : ''}">
        <span class="achievement-icon">${a.icon}</span>
        <span class="achievement-name">${a.name}</span>
        <span class="achievement-desc">${a.description}</span>
      </div>
    `).join('');
    },

    renderLeaderboard() {
        const container = document.getElementById('leaderboard');
        if (!container) return;

        container.innerHTML = this.leaderboard.map((e, i) => {
            const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : e.rank;
            return `
        <div class="leaderboard-item ${i < 3 ? 'top-3' : ''}">
          <span class="rank">${rank}</span>
          <div class="leaderboard-avatar"><span>${e.username?.charAt(0) || '?'}</span></div>
          <div class="leaderboard-info">
            <span class="leaderboard-name">${e.username}</span>
            <span class="leaderboard-level">${e.levelName}</span>
          </div>
          <span class="leaderboard-points">${e.points.toLocaleString()} pts</span>
        </div>
      `;
        }).join('');
    },

    updateUI() {
        if (!Auth.profile) return;
        const p = Auth.profile;
        const curr = this.levels.find(l => l.level === p.level) || this.levels[0];
        const next = this.levels.find(l => l.level === p.level + 1);

        const icon = document.getElementById('level-icon');
        if (icon) icon.textContent = curr.icon;

        const name = document.getElementById('level-name');
        if (name) name.textContent = curr.name;

        const fill = document.getElementById('level-progress');
        const pts = document.getElementById('points-to-next');

        if (next) {
            const pct = ((p.points - curr.minPoints) / (next.minPoints - curr.minPoints)) * 100;
            if (fill) fill.style.width = `${Math.min(100, pct)}%`;
            if (pts) pts.textContent = `${p.points} / ${next.minPoints} pts`;
        } else {
            if (fill) fill.style.width = '100%';
            if (pts) pts.textContent = `${p.points} pts - MAX!`;
        }

        const streak = document.getElementById('streak-days');
        if (streak) streak.textContent = p.streak_days || 0;
    },

    async awardPoints(action, data = {}) {
        if (!Auth.isAuthenticated || !window.EdgeAPI) return;
        try {
            const res = await EdgeAPI.awardPoints(action);
            if (res && res.success) {
                Auth.profile.points = res.points;
                Auth.profile.level = res.level;
                Toast.show(`+${res.awarded} points!`, 'success');
                this.updateUI();
                Auth.updateUI();
            }
        } catch (e) {
            console.warn("EdgeAPI awardPoints failed", e);
        }
    },

    checkMilestones(stats) {
        if (stats.optimalTdsMinutes >= 60) this.awardPoints('optimal_tds');
    }
};

window.Gamification = Gamification;
