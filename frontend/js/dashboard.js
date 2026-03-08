// ============================================
// SAVEHYDROO - Dashboard Module
// Real-time dashboard updates and controls
// ============================================

const Dashboard = {
    // State
    isRunning: false,
    updateInterval: 2000,
    intervalId: null,
    blendRatio: { ro: 0.3, rain: 0.7 },
    lastPrediction: null,

    // Statistics
    stats: {
        totalWaterSaved: 0,
        totalRainwaterUsed: 0,
        optimalTdsMinutes: 0,
        avgTds: 0,
        tdsReadings: []
    },

    // Initialize dashboard
    init() {
        this.setupEventListeners();
        // Model health now reported by ml-predict edge function response
        const badge = document.getElementById('model-health');
        const stats = document.getElementById('model-stats');
        if (badge) badge.textContent = 'Edge-Powered';
        if (stats) stats.textContent = 'LinearReg + Polynomial + Kalman + WMA + ARIMA';
        this.start();
    },


    // Setup event listeners
    setupEventListeners() {
        // Blend ratio sliders
        const roSlider = document.getElementById('ro-ratio-slider');
        const rainSlider = document.getElementById('rain-ratio-slider');
        const applyBtn = document.getElementById('apply-blend');
        const optimalBtn = document.getElementById('use-optimal');

        if (roSlider) {
            roSlider.addEventListener('input', (e) => {
                const roValue = parseInt(e.target.value);
                const rainValue = 100 - roValue;
                rainSlider.value = rainValue;
                this.updateBlendDisplays(roValue, rainValue);
            });
        }

        if (rainSlider) {
            rainSlider.addEventListener('input', (e) => {
                const rainValue = parseInt(e.target.value);
                const roValue = 100 - rainValue;
                roSlider.value = roValue;
                this.updateBlendDisplays(roValue, rainValue);
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyBlendRatio());
        }

        if (optimalBtn) {
            optimalBtn.addEventListener('click', () => this.useOptimalBlend());
        }
    },

    // Update blend ratio displays
    updateBlendDisplays(ro, rain) {
        const roDisplay = document.getElementById('ro-ratio-display');
        const rainDisplay = document.getElementById('rain-ratio-display');

        if (roDisplay) roDisplay.textContent = `${ro}%`;
        if (rainDisplay) rainDisplay.textContent = `${rain}%`;
    },

    // Apply blend ratio
    applyBlendRatio() {
        const roSlider = document.getElementById('ro-ratio-slider');
        const rainSlider = document.getElementById('rain-ratio-slider');

        if (roSlider && rainSlider) {
            const ro = parseInt(roSlider.value) / 100;
            const rain = parseInt(rainSlider.value) / 100;

            this.blendRatio = { ro, rain };
            API.setBlendRatio(ro, rain);

            Toast.show('Blend ratio updated!', 'success');
        }
    },

    // Use optimal blend from prediction
    useOptimalBlend() {
        if (this.lastPrediction?.recommendations?.optimalBlendRatio) {
            const optimal = this.lastPrediction.recommendations.optimalBlendRatio;
            const roPercent = Math.round(optimal.ro * 100);
            const rainPercent = Math.round(optimal.rain * 100);

            document.getElementById('ro-ratio-slider').value = roPercent;
            document.getElementById('rain-ratio-slider').value = rainPercent;
            this.updateBlendDisplays(roPercent, rainPercent);

            this.blendRatio = { ro: optimal.ro, rain: optimal.rain };
            API.setBlendRatio(optimal.ro, optimal.rain);

            Toast.show('Using optimal blend ratio!', 'success');
        } else {
            Toast.show('Optimal ratio not yet available', 'warning');
        }
    },

    // Start dashboard updates
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.updateStatus('Running');

        // Initial update
        this.update();

        // Schedule updates
        this.intervalId = setInterval(() => this.update(), this.updateInterval);
    },

    // Stop dashboard updates
    stop() {
        this.isRunning = false;
        this.updateStatus('Stopped');

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    },

    // Track data source
    dataSource: 'simulation', // 'db' or 'simulation'

    // Main update loop
    async update() {
        try {
            let tanks = null;
            let blendRatio = this.blendRatio;
            const isLoggedIn = window.EdgeAPI && EdgeAPI.userId && !EdgeAPI.userId.startsWith('demo');

            // 1. Try DB first (real Wokwi data) when logged in
            if (isLoggedIn) {
                try {
                    const dbData = await EdgeAPI.getLatestReadings();
                    if (dbData?.success && dbData.readings?.blended?.tds) {
                        tanks = dbData.readings; // ro_reject, rainwater, blended from DB
                        this._setDataSource('db');
                    }
                } catch (e) {
                    console.warn('DB read failed, falling back to simulation:', e.message);
                }
            }

            // 2. Fall back to local simulation if no DB data
            if (!tanks) {
                const simData = await API.getSimulationData();
                if (!simData?.tanks) return;
                tanks = simData.tanks;
                blendRatio = simData.blendRatio || blendRatio;
                this._setDataSource('simulation');
            }

            this.updateTanks(tanks);
            this.updateCharts(tanks);
            this.updateLastUpdate();
            this.updateStatus('Running');

            // 3. Push to sensor-ingest (fan-out: ml-predict + alert-check + gamification)
            if (isLoggedIn) {
                try {
                    const result = await EdgeAPI.ingestSensorData(tanks, blendRatio);
                    if (result?.success) {
                        if (result.prediction) this.displayPredictions(result);
                        if (result.alert) this._showAlerts(result.alert);
                        if (result.points?.newAchievements?.length) {
                            result.points.newAchievements.forEach(a =>
                                Toast.show(`${a.icon || '🏆'} Achievement: ${a.name} (+${a.points} pts)!`, 'success', 5000)
                            );
                        }
                    }
                } catch (e) {
                    console.warn('sensor-ingest failed, local prediction fallback:', e.message);
                    this.updatePredictions(tanks, blendRatio);
                }
            } else {
                this.updatePredictions(tanks, blendRatio);
            }

            this.updateStats(tanks);
        } catch (error) {
            console.error('Dashboard update error:', error);
            this.updateStatus('Error');
        }
    },

    // Update the data source badge in the UI
    _setDataSource(source) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        const badge = document.getElementById('data-source-badge');
        if (badge) {
            badge.textContent = source === 'db' ? '🟢 Live (Wokwi)' : '🟡 Simulation';
            badge.className = 'data-source-badge ' + source;
        }
        if (source === 'db') {
            Toast.show('🟢 Switched to live sensor data from Wokwi!', 'success', 3000);
        }
    },

    // Show active alerts as toasts (deduplicated, max 1 per type per cycle)
    _shownAlertTypes: new Set(),
    _showAlerts(alerts) {
        if (!alerts?.length) return;
        for (const a of alerts) {
            if (this._shownAlertTypes.has(a.type)) continue;
            this._shownAlertTypes.add(a.type);
            const type = a.severity === 'critical' ? 'error' : 'warning';
            Toast.show(a.message, type, 6000);
            // Clear after 30s so same alert can reappear
            setTimeout(() => this._shownAlertTypes.delete(a.type), 30000);
        }
    },

    // Update tank displays
    updateTanks(tanks) {
        // RO Reject Tank
        this.updateTankDisplay('ro', {
            level: tanks.ro_reject?.level,
            tds: tanks.ro_reject?.tds,
            temp: tanks.ro_reject?.temperature,
            flow: tanks.ro_reject?.flowRate
        });

        // Rainwater Tank
        this.updateTankDisplay('rain', {
            level: tanks.rainwater?.level,
            tds: tanks.rainwater?.tds,
            temp: tanks.rainwater?.temperature,
            flow: tanks.rainwater?.flowRate
        });

        // Blended Tank
        this.updateTankDisplay('blend', {
            level: tanks.blended?.level,
            tds: tanks.blended?.tds,
            temp: tanks.blended?.temperature,
            flow: tanks.blended?.flowRate
        });

        // Update TDS status badge
        this.updateTdsStatus(tanks.blended?.tds);
    },

    // Update individual tank display
    updateTankDisplay(tankId, data) {
        const prefix = tankId;

        // Water fill level
        const fill = document.getElementById(`${prefix}-water-fill`);
        if (fill) {
            fill.style.height = `${data.level || 0}%`;
        }

        // Level percentage
        const levelText = document.getElementById(`${prefix}-level`);
        if (levelText) {
            levelText.textContent = `${Math.round(data.level || 0)}%`;
        }

        // TDS
        const tds = document.getElementById(`${prefix}-tds`);
        if (tds) {
            tds.textContent = `${(data.tds || 0).toFixed(1)} ppm`;
        }

        // Temperature
        const temp = document.getElementById(`${prefix}-temp`);
        if (temp) {
            temp.textContent = `${(data.temp || 0).toFixed(1)}°C`;
        }

        // Flow rate
        const flow = document.getElementById(`${prefix}-flow`);
        if (flow) {
            flow.textContent = `${(data.flow || 0).toFixed(2)} L/min`;
        }

        // Flow indicator
        const indicator = document.getElementById(`${prefix}-flow-indicator`);
        if (indicator) {
            indicator.classList.toggle('active', (data.flow || 0) > 0);
        }
    },

    // Update TDS status badge
    updateTdsStatus(tds) {
        const badge = document.getElementById('tds-status');
        if (!badge) return;

        badge.classList.remove('optimal', 'warning', 'danger');

        if (tds >= 150 && tds <= 300) {
            badge.textContent = 'Optimal ✓';
            badge.classList.add('optimal');
        } else if (tds >= 100 && tds <= 400) {
            badge.textContent = 'Acceptable';
            badge.classList.add('warning');
        } else {
            badge.textContent = 'Out of Range';
            badge.classList.add('danger');
        }
    },

    // Update charts
    updateCharts(tanks) {
        Charts.addDataPoint(tanks);
    },

    // Update predictions
    async updatePredictions(tanks, blendRatio) {
        const readings = {
            ro_reject: tanks.ro_reject,
            rainwater: tanks.rainwater,
            blended: tanks.blended
        };

        const prediction = await API.calculatePrediction(
            Auth.getUserId(),
            readings,
            blendRatio || this.blendRatio
        );

        if (prediction) {
            this.lastPrediction = prediction;
            this.displayPredictions(prediction);
        }
    },

    // Display prediction results (handles both edge function and local fallback format)
    displayPredictions(prediction) {
        // Support both edge function wrapper and local fallback
        const p = prediction.prediction || prediction;

        // Predicted TDS (short-term, 60s)
        const predictedTds = document.getElementById('predicted-tds');
        if (predictedTds) {
            const value = p.predictedTDS ?? p.predictions?.futureTDS ?? '--';
            predictedTds.textContent = typeof value === 'number' ? `${value.toFixed(1)} ppm` : value;
        }

        // TDS Trend
        const tdsTrend = document.getElementById('tds-trend');
        if (tdsTrend) {
            const trend = p.tdsTrend ?? p.predictions?.tdsTrend ?? 'stable';
            const icons = { increasing: '📈', decreasing: '📉', stable: '➡️' };
            tdsTrend.textContent = `${icons[trend] || ''} ${trend.charAt(0).toUpperCase() + trend.slice(1)}`;
            tdsTrend.className = 'prediction-trend ' + trend;
        }

        // Time to target
        const timeToTarget = document.getElementById('time-to-target');
        if (timeToTarget) {
            const ttt = p.timeToTarget ?? p.timing?.timeToOptimalTDS;
            if (typeof ttt === 'number') {
                timeToTarget.textContent = this.formatTime(ttt);
            } else if (ttt?.formatted) {
                timeToTarget.textContent = ttt.formatted;
            } else {
                timeToTarget.textContent = 'Stable';
            }
        }

        // Optimal blend ratio — shows useCase as tooltip
        const optimalBlend = document.getElementById('optimal-blend');
        if (optimalBlend) {
            const ratio = p.optimalBlendRatio ?? p.recommendations?.optimalBlendRatio;
            const useCase = p.useCase ? p.useCase.replace('_', ' ') : '';
            if (ratio) {
                optimalBlend.textContent = `RO ${Math.round(ratio.ro * 100)}% / Rain ${Math.round(ratio.rain * 100)}%`;
                if (useCase) optimalBlend.title = `Best for: ${useCase}`;
            }
        }

        // Model health
        const modelHealth = document.getElementById('model-health');
        const modelStats = document.getElementById('model-stats');
        if (p.modelHealth) {
            const { datapointsUsed, modelReady, r2Linear, r2Polynomial } = p.modelHealth;
            if (modelHealth) {
                modelHealth.textContent = modelReady
                    ? `${Math.round((p.confidence || 0) * 100)}% confidence`
                    : `Learning (${datapointsUsed}/5 pts)`;
                modelHealth.classList.toggle('optimal', !!modelReady);
            }
            if (modelStats) {
                modelStats.textContent = modelReady
                    ? `R² lin: ${r2Linear} | poly: ${r2Polynomial} | n=${datapointsUsed}`
                    : 'Waiting for more sensor data...';
            }
        }

        // Anomaly / TDS status badge on blended tank
        const badge = document.getElementById('tds-status');
        if (badge && p.anomaly) {
            badge.classList.remove('optimal', 'warning', 'danger');
            if (p.isOptimal) {
                badge.textContent = `${(p.useCase || 'Optimal').replace('_', ' ')} ✓`;
                badge.classList.add('optimal');
            } else if (p.anomaly.severity === 'severe') {
                badge.textContent = '⚠️ Exceeds Limit';
                badge.classList.add('danger');
            } else if (p.anomaly.severity === 'mild') {
                badge.textContent = '⚠️ Anomaly';
                badge.classList.add('warning');
            } else {
                badge.textContent = (p.useCase || 'Monitoring').replace('_', ' ');
                badge.classList.add('warning');
            }
        }

        // Store last prediction for 'Use Optimal' button
        this.lastPrediction = p;
    },

    // Update statistics
    updateStats(tanks) {
        const blendTds = tanks.blended?.tds || 0;

        // Track TDS readings for average
        this.stats.tdsReadings.push(blendTds);
        if (this.stats.tdsReadings.length > 100) {
            this.stats.tdsReadings.shift();
        }

        // Calculate average TDS
        this.stats.avgTds = this.stats.tdsReadings.reduce((a, b) => a + b, 0) /
            this.stats.tdsReadings.length;

        // Check optimal TDS time
        if (blendTds >= 150 && blendTds <= 300) {
            this.stats.optimalTdsMinutes += this.updateInterval / 60000;
        }

        // Estimate water saved based on rainwater usage
        const rainFlow = tanks.rainwater?.flowRate || 0;
        if (rainFlow > 0) {
            this.stats.totalRainwaterUsed += (rainFlow * this.updateInterval / 60000);
            this.stats.totalWaterSaved += (rainFlow * this.updateInterval / 60000) * 0.5;
        }

        // Update UI
        this.updateStatsDisplay();

        // Award points for optimal TDS (every 5 minutes)
        if (this.stats.optimalTdsMinutes % 5 < this.updateInterval / 60000) {
            Gamification.checkMilestones({ optimalTdsMinutes: this.stats.optimalTdsMinutes });
        }
    },

    // Update stats display elements
    updateStatsDisplay() {
        const waterSaved = document.getElementById('total-water-saved');
        if (waterSaved) {
            waterSaved.textContent = `${this.stats.totalWaterSaved.toFixed(1)} L`;
        }

        const rainwater = document.getElementById('total-rainwater');
        if (rainwater) {
            rainwater.textContent = `${this.stats.totalRainwaterUsed.toFixed(1)} L`;
        }

        const avgTds = document.getElementById('avg-tds');
        if (avgTds) {
            avgTds.textContent = `${this.stats.avgTds.toFixed(1)} ppm`;
        }

        const optimalTime = document.getElementById('optimal-time');
        if (optimalTime) {
            const totalMinutes = this.stats.tdsReadings.length * this.updateInterval / 60000;
            const optimalPercent = totalMinutes > 0 ?
                (this.stats.optimalTdsMinutes / totalMinutes * 100) : 0;
            optimalTime.textContent = `${optimalPercent.toFixed(0)}%`;
        }
    },

    // Update status indicator
    updateStatus(status) {
        const statusEl = document.getElementById('sim-status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.style.color = status === 'Running' ? '#10b981' :
                status === 'Error' ? '#ef4444' : '#9ca3af';
        }
    },

    // Update last update time
    updateLastUpdate() {
        const lastUpdate = document.getElementById('last-update');
        if (lastUpdate) {
            lastUpdate.textContent = new Date().toLocaleTimeString();
        }
    },

    // Format time helper
    formatTime(seconds) {
        if (!isFinite(seconds)) return 'N/A';

        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${mins}m ${secs}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.round((seconds % 3600) / 60);
            return `${hours}h ${mins}m`;
        }
    }
};

// Export
window.Dashboard = Dashboard;
