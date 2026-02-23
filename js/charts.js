// ============================================
// SAVEHYDROO - Charts Module
// Chart.js implementations for data visualization
// ============================================

const Charts = {
    // Chart instances
    tdsChart: null,
    levelChart: null,
    tempChart: null,

    // Data buffers
    maxDataPoints: 50,
    tdsData: { labels: [], ro: [], rain: [], blend: [] },
    levelData: { labels: [], ro: [], rain: [], blend: [] },
    tempData: { labels: [], ro: [], rain: [], blend: [] },

    // Chart.js default options
    defaultOptions: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#9ca3af',
                    usePointStyle: true,
                    padding: 15
                }
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                titleColor: '#f9fafb',
                bodyColor: '#9ca3af',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    color: '#6b7280',
                    maxRotation: 0
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    color: '#6b7280'
                }
            }
        },
        elements: {
            line: {
                tension: 0.4,
                borderWidth: 2
            },
            point: {
                radius: 0,
                hitRadius: 10,
                hoverRadius: 5
            }
        }
    },

    // Tank colors
    colors: {
        ro: {
            line: '#ef4444',
            fill: 'rgba(239, 68, 68, 0.1)'
        },
        rain: {
            line: '#3b82f6',
            fill: 'rgba(59, 130, 246, 0.1)'
        },
        blend: {
            line: '#10b981',
            fill: 'rgba(16, 185, 129, 0.1)'
        }
    },

    // Initialize all charts
    init() {
        this.initTDSChart();
        this.initLevelChart();
        this.initTempChart();
    },

    // Initialize TDS Chart
    initTDSChart() {
        const ctx = document.getElementById('tds-chart');
        if (!ctx) return;

        this.tdsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'RO Reject',
                        data: [],
                        borderColor: this.colors.ro.line,
                        backgroundColor: this.colors.ro.fill,
                        fill: true
                    },
                    {
                        label: 'Rainwater',
                        data: [],
                        borderColor: this.colors.rain.line,
                        backgroundColor: this.colors.rain.fill,
                        fill: true
                    },
                    {
                        label: 'Blended',
                        data: [],
                        borderColor: this.colors.blend.line,
                        backgroundColor: this.colors.blend.fill,
                        fill: true
                    }
                ]
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        title: {
                            display: true,
                            text: 'TDS (ppm)',
                            color: '#9ca3af'
                        }
                    }
                },
                plugins: {
                    ...this.defaultOptions.plugins,
                    annotation: {
                        annotations: {
                            optimalZone: {
                                type: 'box',
                                yMin: 150,
                                yMax: 300,
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderColor: 'rgba(16, 185, 129, 0.3)',
                                borderWidth: 1
                            }
                        }
                    }
                }
            }
        });
    },

    // Initialize Level Chart
    initLevelChart() {
        const ctx = document.getElementById('level-chart');
        if (!ctx) return;

        this.levelChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'RO Reject',
                        data: [],
                        borderColor: this.colors.ro.line,
                        backgroundColor: this.colors.ro.fill,
                        fill: true
                    },
                    {
                        label: 'Rainwater',
                        data: [],
                        borderColor: this.colors.rain.line,
                        backgroundColor: this.colors.rain.fill,
                        fill: true
                    },
                    {
                        label: 'Blended',
                        data: [],
                        borderColor: this.colors.blend.line,
                        backgroundColor: this.colors.blend.fill,
                        fill: true
                    }
                ]
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        min: 0,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Level (%)',
                            color: '#9ca3af'
                        }
                    }
                }
            }
        });
    },

    // Initialize Temperature Chart
    initTempChart() {
        const ctx = document.getElementById('temp-chart');
        if (!ctx) return;

        this.tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'RO Reject',
                        data: [],
                        borderColor: this.colors.ro.line,
                        backgroundColor: this.colors.ro.fill,
                        fill: true
                    },
                    {
                        label: 'Rainwater',
                        data: [],
                        borderColor: this.colors.rain.line,
                        backgroundColor: this.colors.rain.fill,
                        fill: true
                    },
                    {
                        label: 'Blended',
                        data: [],
                        borderColor: this.colors.blend.line,
                        backgroundColor: this.colors.blend.fill,
                        fill: true
                    }
                ]
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: '#9ca3af'
                        }
                    }
                }
            }
        });
    },

    // Add data point
    addDataPoint(tanks) {
        const now = new Date();
        const label = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Add to TDS data
        this.tdsData.labels.push(label);
        this.tdsData.ro.push(tanks.ro_reject?.tds || 0);
        this.tdsData.rain.push(tanks.rainwater?.tds || 0);
        this.tdsData.blend.push(tanks.blended?.tds || 0);

        // Add to Level data
        this.levelData.labels.push(label);
        this.levelData.ro.push(tanks.ro_reject?.level || 0);
        this.levelData.rain.push(tanks.rainwater?.level || 0);
        this.levelData.blend.push(tanks.blended?.level || 0);

        // Add to Temp data
        this.tempData.labels.push(label);
        this.tempData.ro.push(tanks.ro_reject?.temperature || 0);
        this.tempData.rain.push(tanks.rainwater?.temperature || 0);
        this.tempData.blend.push(tanks.blended?.temperature || 0);

        // Limit data points
        this.trimData(this.tdsData);
        this.trimData(this.levelData);
        this.trimData(this.tempData);

        // Update charts
        this.updateCharts();
    },

    // Trim data arrays to max length
    trimData(data) {
        while (data.labels.length > this.maxDataPoints) {
            data.labels.shift();
            data.ro.shift();
            data.rain.shift();
            data.blend.shift();
        }
    },

    // Update all charts with current data
    updateCharts() {
        if (this.tdsChart) {
            this.tdsChart.data.labels = this.tdsData.labels;
            this.tdsChart.data.datasets[0].data = this.tdsData.ro;
            this.tdsChart.data.datasets[1].data = this.tdsData.rain;
            this.tdsChart.data.datasets[2].data = this.tdsData.blend;
            this.tdsChart.update('none');
        }

        if (this.levelChart) {
            this.levelChart.data.labels = this.levelData.labels;
            this.levelChart.data.datasets[0].data = this.levelData.ro;
            this.levelChart.data.datasets[1].data = this.levelData.rain;
            this.levelChart.data.datasets[2].data = this.levelData.blend;
            this.levelChart.update('none');
        }

        if (this.tempChart) {
            this.tempChart.data.labels = this.tempData.labels;
            this.tempChart.data.datasets[0].data = this.tempData.ro;
            this.tempChart.data.datasets[1].data = this.tempData.rain;
            this.tempChart.data.datasets[2].data = this.tempData.blend;
            this.tempChart.update('none');
        }
    },

    // Clear all data
    reset() {
        this.tdsData = { labels: [], ro: [], rain: [], blend: [] };
        this.levelData = { labels: [], ro: [], rain: [], blend: [] };
        this.tempData = { labels: [], ro: [], rain: [], blend: [] };
        this.updateCharts();
    },

    // Destroy charts
    destroy() {
        if (this.tdsChart) {
            this.tdsChart.destroy();
            this.tdsChart = null;
        }
        if (this.levelChart) {
            this.levelChart.destroy();
            this.levelChart = null;
        }
        if (this.tempChart) {
            this.tempChart.destroy();
            this.tempChart = null;
        }
    }
};

// Export
window.Charts = Charts;
