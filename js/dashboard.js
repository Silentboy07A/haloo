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
    lastSimIngestTime: 0, // Track when we last pushed simulation data to avoid loops

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
        // start() is now called by auth.js upon successful login
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
    async start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.updateStatus('Running');

        // Initial historical load for charts
        await this._loadHistoricalData();

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
            console.log("Dashboard update() start");
            let tanks = null;
            const isDemo = !window.EdgeAPI || !EdgeAPI.userId || EdgeAPI.userId.startsWith('demo');
            console.log("Dashboard.update: User isDemo:", isDemo);

            // 1. Try to read the latest data from DB (Wokwi Live)
            // If logged in as a real user, we prefer their specific live stream.
            // If demo, we check if there's any global "live" data.
            try {
                // Use a short 2s timeout for live check
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                const dbData = await EdgeAPI.getLatestReadings(controller.signal);
                clearTimeout(timeoutId);

                if (dbData?.success && dbData.readings?.blended?.tds) {
                    const latestTs = new Date(dbData.readings.blended.timestamp || 0).getTime();
                    const now = Date.now();

                    // DO NOT use live DB data if it's identical to the timestamp we just pushed 1 second ago
                    // Check if data is fresh (within last 60 seconds) to support hybrid mode
                    if (now - latestTs < 60000 && Math.abs(latestTs - this.lastSimIngestTime) > 3000) {
                        tanks = dbData.readings;
                        console.log('Dashboard: Using live DB data source', tanks);
                        this._setDataSource('db');
                        this.updatePredictions(tanks, this.blendRatio);
                    } else if (Math.abs(latestTs - this.lastSimIngestTime) <= 3000) {
                        // Doing nothing lets it fall through to Simulation block
                    } else {
                        console.log('Dashboard: DB data is too old for hybrid mode', (now - latestTs) / 1000, 's');
                    }
                }
            } catch (e) {
                console.warn('DB live check failed or timed out:', e.message);
            }

            // 2. Fallback to Simulation (which might be DB Replay)
            if (!tanks) {
                const simData = await API.getSimulationData();
                if (simData && simData.success) {
                    tanks = simData.tanks;
                    this._setDataSource('simulation');

                    // Trigger predictions (EdgeAPI.predict handles the demo/real logic)
                    this.updatePredictions(tanks, this.blendRatio);

                    // Push simulation data back to DB so history/ML works.
                    // Doing this for all users ensures ML gets a continuous 200-frame stream
                    if (window.EdgeAPI) {
                        this.lastSimIngestTime = new Date(tanks.blended?.timestamp || Date.now()).getTime();
                        EdgeAPI.ingestSensorData(tanks, this.blendRatio).catch(e => { });
                    }
                }
            }

            // 3. Update UI if we have data
            if (tanks) {
                if (this.dataSource === 'simulation') {
                    console.log('Dashboard: Using Simulation data source');
                }
                this.updateTanks(tanks);
                this.updateCharts(tanks);
                this.updateLastUpdate();
                this.updateStats(tanks);
                this.updateStatus('Running');
            } else {
                console.warn('Dashboard: No data received from any source');
                this.updateStatus('Waiting for Data...');
            }
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

    // Pre-fill charts with historical data from the DB if available
    async _loadHistoricalData() {
        const isLoggedIn = window.EdgeAPI && EdgeAPI.userId && !EdgeAPI.userId.startsWith('demo');
        if (!isLoggedIn) return;

        try {
            const history = await EdgeAPI.getHistoricalReadings(50); // Get last 50 points
            if (history && history.length > 0) {
                // We'll reconstruct the grouped structure the charts expect
                const historyByTimestamp = {};

                history.forEach(reading => {
                    const time = new Date(reading.timestamp).toLocaleTimeString('en-US', {
                        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });

                    if (!historyByTimestamp[time]) {
                        historyByTimestamp[time] = {
                            ro_reject: { tds: 0, level: 0, temperature: 0 },
                            rainwater: { tds: 0, level: 0, temperature: 0 },
                            blended: { tds: 0, level: 0, temperature: 0 }
                        };
                    }

                    if (reading.tank_type === 'ro_reject' || reading.tank_type === 'rainwater' || reading.tank_type === 'blended') {
                        historyByTimestamp[time][reading.tank_type] = reading;
                    }
                });

                // Keep the charts module clean and just push points in chronological order
                Object.keys(historyByTimestamp).forEach(time => {
                    Charts.addDataPoint(historyByTimestamp[time]);
                    // overwrite the auto-generated time label in charts with the historical one
                    const lastIdx = Charts.tdsData.labels.length - 1;
                    Charts.tdsData.labels[lastIdx] = time;
                    Charts.levelData.labels[lastIdx] = time;
                    Charts.tempData.labels[lastIdx] = time;
                });
                Charts.updateCharts();

                console.log(`Loaded ${Object.keys(historyByTimestamp).length} historical data points into charts`);
            }
        } catch (e) {
            console.warn('Failed to load historical chart data:', e);
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

        // Enforce EdgeAPI usage for predictions
        if (window.EdgeAPI && EdgeAPI.userId && !EdgeAPI.userId.startsWith('demo')) {
            try {
                const prediction = await EdgeAPI.predict({ userId: EdgeAPI.userId, readings });
                if (prediction && prediction.success) {
                    this.lastPrediction = prediction;
                    this.displayPredictions(prediction);
                }
            } catch (err) {
                console.warn("Edge prediction failed", err);
            }
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
        // If update interval is 2s, we add (flowRate / 60) * 2 Liters
        const rainFlow = tanks.rainwater?.flowRate || 0;
        if (rainFlow > 0) {
            const litersPerStep = (rainFlow / 60) * (this.updateInterval / 1000);
            this.stats.totalRainwaterUsed += litersPerStep;
            this.stats.totalWaterSaved += litersPerStep * 0.5; // Assuming 50% efficiency for "saved" metric
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
            if (this.stats.tdsReadings.length > 0) {
                // Rather than converting to minutes, just use raw update ticks
                const totalTicks = this.stats.tdsReadings.length;
                const optimalTicks = this.stats.optimalTdsMinutes / (this.updateInterval / 60000);
                const optimalPercent = (optimalTicks / totalTicks) * 100;
                optimalTime.textContent = `${optimalPercent.toFixed(0)}%`;
            } else {
                optimalTime.textContent = `0%`;
            }
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
