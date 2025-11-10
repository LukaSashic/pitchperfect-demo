// PitchPerfect AI - Enhanced Connector with Feature Flags & Metrics
// V2.0 - Optimized with caching support

(function() {
    'use strict';

    const CONFIG = {
        isDemoMode: false,
        localStorageKey: 'pitchperfect_demo',
        metricsKey: 'pitchperfect_metrics',
        apiEndpoint: '/api/chat',
        apiEndpointV2: '/api/chat-v2',
        
        // Feature flags
        features: {
            useV2API: true,  // Toggle to enable/disable optimized API
            trackMetrics: true,
            useStructuredOutputs: true
        }
    };

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    const DemoState = {
        load() {
            const data = localStorage.getItem(CONFIG.localStorageKey);
            return data ? JSON.parse(data) : {
                user: { email: '', createdAt: new Date().toISOString() },
                diagnostic: { completed: false, answers: {}, results: null },
                workshop: { 
                    unlocked: false, 
                    currentPhase: 2, 
                    messages: {}, 
                    phaseCompletion: {},
                    phaseScores: {} // NEW: Track completion scores
                },
                paymentIntent: false
            };
        },
        save(data) {
            localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(data));
        }
    };

    // ============================================
    // METRICS TRACKING
    // ============================================
    const Metrics = {
        init() {
            if (!CONFIG.features.trackMetrics) return;
            
            const metrics = this.load();
            if (!metrics.sessionStart) {
                metrics.sessionStart = new Date().toISOString();
                metrics.requests = [];
                this.save(metrics);
            }
        },

        load() {
            const data = localStorage.getItem(CONFIG.metricsKey);
            return data ? JSON.parse(data) : {
                sessionStart: null,
                requests: [],
                totalCost: 0,
                totalLatency: 0,
                cacheHitRate: 0
            };
        },

        save(data) {
            localStorage.setItem(CONFIG.metricsKey, JSON.stringify(data));
        },

        track(phase, responseMetrics) {
            if (!CONFIG.features.trackMetrics) return;

            const metrics = this.load();
            metrics.requests.push({
                timestamp: new Date().toISOString(),
                phase: phase,
                ...responseMetrics
            });
            
            // Calculate totals
            metrics.totalCost = metrics.requests.reduce((sum, r) => sum + parseFloat(r.cost_usd || 0), 0);
            metrics.totalLatency = metrics.requests.reduce((sum, r) => sum + (r.latency_ms || 0), 0);
            
            // Calculate cache hit rate
            const totalCacheableTokens = metrics.requests.reduce((sum, r) => 
                sum + (r.cache_read_tokens || 0) + (r.input_tokens || 0), 0);
            const totalCacheHits = metrics.requests.reduce((sum, r) => 
                sum + (r.cache_read_tokens || 0), 0);
            metrics.cacheHitRate = totalCacheableTokens > 0 
                ? (totalCacheHits / totalCacheableTokens * 100).toFixed(1)
                : 0;

            this.save(metrics);
            
            // Log to console for debugging
            console.log('📊 Metrics Update:', {
                phase: phase,
                cost: `$${responseMetrics.cost_usd}`,
                latency: `${responseMetrics.latency_ms}ms`,
                cacheHit: responseMetrics.cache_read_tokens > 0,
                totalSessionCost: `$${metrics.totalCost.toFixed(4)}`
            });
        },

        getSummary() {
            const metrics = this.load();
            const requestCount = metrics.requests.length;
            
            if (requestCount === 0) return null;

            return {
                totalRequests: requestCount,
                totalCost: `$${metrics.totalCost.toFixed(4)}`,
                averageCost: `$${(metrics.totalCost / requestCount).toFixed(6)}`,
                averageLatency: `${Math.round(metrics.totalLatency / requestCount)}ms`,
                cacheHitRate: `${metrics.cacheHitRate}%`,
                sessionDuration: this.getSessionDuration(metrics.sessionStart)
            };
        },

        getSessionDuration(startTime) {
            if (!startTime) return '0m';
            const minutes = Math.round((Date.now() - new Date(startTime)) / 60000);
            return `${minutes}m`;
        },

        reset() {
            localStorage.removeItem(CONFIG.metricsKey);
            console.log('🔄 Metrics reset');
        }
    };

    // ============================================
    // AI INTEGRATION
    // ============================================
    const AI = {
        async generateDiagnostic(answers) {
            if (CONFIG.isDemoMode) {
                return this._demoResponse();
            }

            try {
                return this._demoResponse();
            } catch (error) {
                console.error('Diagnose-Generierung fehlgeschlagen:', error);
                return this._demoResponse();
            }
        },

        async getResponse(phase, message, conversationHistory) {
            if (CONFIG.isDemoMode) {
                return this._demoAIResponse(conversationHistory.length);
            }

            try {
                // Choose API version based on feature flag
                const endpoint = CONFIG.features.useV2API ? CONFIG.apiEndpointV2 : CONFIG.apiEndpoint;
                
                console.log(`🚀 Calling ${CONFIG.features.useV2API ? 'V2' : 'V1'} API for Phase ${phase}`);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        phase: phase,
                        message: message,
                        conversationHistory: conversationHistory,
                        useV2: CONFIG.features.useV2API
                    })
                });

                if (!response.ok) {
                    throw new Error(`API Fehler: ${response.status}`);
                }

                const data = await response.json();
                
                // Handle V1 fallback if V2 fails
                if (data.fallback && CONFIG.features.useV2API) {
                    console.log('⚠️ V2 fehlgeschlagen, fallback zu V1...');
                    return await this.getResponse(phase, message, conversationHistory);
                }

                // Track metrics if available
                if (data.metrics && CONFIG.features.trackMetrics) {
                    Metrics.track(phase, data.metrics);
                }

                return {
                    content: data.content,
                    phaseComplete: data.phaseComplete || false,
                    completionScore: data.completionScore || null,
                    missingElements: data.missingElements || [],
                    metadata: data.metadata || {}
                };

            } catch (error) {
                console.error('KI API Fehler:', error);
                console.log('⚠️ Fallback zu Demo-Modus');
                return this._demoAIResponse(conversationHistory.length);
            }
        },

        _demoResponse() {
            return {
                criticalIssues: 4,
                warningIssues: 2,
                strongAreas: 1,
                issues: [
                    { severity: 'critical', title: 'Problemstellung ist vage', description: 'Du hast nicht klar definiert, wer dieses Problem hat.' },
                    { severity: 'critical', title: 'Keine Marktvalidierung', description: 'Keine Kundeninterviews, keine LOIs.' },
                    { severity: 'critical', title: 'Schwaches Finanzmodell', description: 'Fehlend: CAC, LTV, Unit Economics.' },
                    { severity: 'critical', title: 'Keine klare Differenzierung', description: 'Was macht dich 10x besser?' },
                    { severity: 'warning', title: 'Marktgröße braucht Arbeit', description: 'Benötigt Bottom-up TAM/SAM/SOM.' },
                    { severity: 'warning', title: 'Wettbewerbsanalyse oberflächlich', description: 'Zeige strategischen Vorteil.' },
                    { severity: 'good', title: 'Starke Team-Story', description: 'Domain-Expertise ist klar.' }
                ]
            };
        },

        _demoAIResponse(msgCount) {
            const responses = [
                "Guter Start. Aber ich brauche Spezifität. **Wie viele Menschen** haben dieses Problem? Gib mir eine Zahl.",
                "Das ist vage. **Welche Beweise** hast du, dass dies real ist? Mit Kunden gesprochen?",
                "Lass mich dich herausfordern: **Warum kann das nicht jemand in 6 Monaten kopieren?** Was ist dein Burggraben?",
                "Besser. Noch eins: **Was ist der größte Einwand**, den ein Investor haben würde?",
                "Perfekt! Das ist viel stärker. Lass uns die nächste kritische Lücke angehen...",
                "Ausgezeichnete Arbeit! 🎉 Dieser Bereich ist jetzt solide. Bereit für die nächste Phase?"
            ];
            return {
                content: responses[Math.min(msgCount, responses.length - 1)],
                phaseComplete: msgCount >= 5,
                completionScore: Math.min(msgCount * 15, 100)
            };
        }
    };

    // ============================================
    // EXPORT TO WINDOW
    // ============================================
    window.PitchPerfect = { 
        DemoState, 
        AI, 
        CONFIG, 
        Metrics 
    };

    // Initialize metrics on load
    Metrics.init();

    console.log(`✅ PitchPerfect Geladen (${CONFIG.features.useV2API ? 'V2 Optimized' : 'V1'} API)`);
    
    // Log metrics summary if available
    const summary = Metrics.getSummary();
    if (summary) {
        console.log('📊 Session Metrics:', summary);
    }
})();
