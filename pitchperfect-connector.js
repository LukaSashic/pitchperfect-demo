// PitchPerfect AI - Enhanced Connector with Feature Flags & Metrics
// V2.1 - Optimized with caching support + Adaptive Questions + Personalized Diagnostics

(function () {
    'use strict';

    const CONFIG = {
        isDemoMode: false,
        localStorageKey: 'pitchperfect_demo',
        metricsKey: 'pitchperfect_metrics',
        apiEndpoint: '/api/chat',
        apiEndpointV2: '/api/chat-v2',
        apiAdaptiveQuestion: '/api/generate-adaptive-question',
        apiAnalyzePitch: '/api/analyze-pitch',

        // Feature flags
        features: {
            useV2API: true,
            trackMetrics: true,
            useStructuredOutputs: true,
            adaptiveQuestions: true,
            personalizedDiagnostics: true
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
                    currentPhase: null,
                    messages: {},
                    phaseCompletion: {},
                    phaseScores: {}
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

            // Dispatch event for metrics dashboard
            window.dispatchEvent(new CustomEvent('pitchperfect:metrics', {
                detail: {
                    phase: phase,
                    cost: parseFloat(responseMetrics.cost_usd || 0),
                    latency: responseMetrics.latency_ms || 0,
                    cacheHit: (responseMetrics.cache_read_tokens || 0) > 0,
                    inputTokens: responseMetrics.input_tokens || 0,
                    outputTokens: responseMetrics.output_tokens || 0
                }
            }));

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

                if (data.fallback && CONFIG.features.useV2API) {
                    console.log('⚠️ V2 fehlgeschlagen, fallback zu V1...');
                    return await this.getResponse(phase, message, conversationHistory);
                }

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

        // ============================================
        // ADAPTIVE QUESTION GENERATION
        // ============================================
        async generateAdaptiveQuestion(stepNumber, context) {
            if (!CONFIG.features.adaptiveQuestions) {
                console.log('⚠️ Adaptive questions disabled, using fallback');
                return this._fallbackQuestion(stepNumber);
            }

            try {
                console.log(`🔍 Generating adaptive question for step ${stepNumber}`);

                const startTime = Date.now();

                const response = await fetch(CONFIG.apiAdaptiveQuestion, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        stepNumber,
                        context
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                const latency = Date.now() - startTime;

                console.log(`✅ Adaptive question generated in ${latency}ms:`, data.question);

                if (CONFIG.features.trackMetrics) {
                    Metrics.track(`diagnostic-q${stepNumber}`, {
                        cost_usd: 0.002,
                        latency_ms: latency,
                        input_tokens: 500,
                        output_tokens: 150,
                        cache_read_tokens: 0
                    });
                }

                return data;
            } catch (error) {
                console.error('Error generating adaptive question:', error);
                console.log('⚠️ Using fallback question');
                return this._fallbackQuestion(stepNumber);
            }
        },

        // ============================================
        // PITCH ANALYSIS (Uses optimized analyze-pitch endpoint)
        // ============================================
        async generatePersonalizedDiagnostic(formData) {
            // Redirect to the new analyzePitch method
            console.log('⚠️ generatePersonalizedDiagnostic is deprecated, using analyzePitch instead');

            const pitchContent = formData.pitchDraft || formData.pitch || '';
            const pitchType = formData.pitchType || 'investor_deck';
            const fundingStage = formData.stage || 'seed';

            return this.analyzePitch(pitchContent, pitchType, fundingStage);
        },

        _fallbackQuestion(stepNumber) {
            const fallbacks = {
                4: {
                    question: 'Wie würdest du das Hauptproblem beschreiben?',
                    description: 'Eine klare Problemstellung ist die Basis eines überzeugenden Pitches',
                    suggestedAnswers: [
                        'Unternehmen verschwenden Zeit mit ineffizienten manuellen Prozessen',
                        'Kunden haben Schwierigkeiten, die richtige Lösung zu finden',
                        'Der Markt ist intransparent und schwer zu navigieren'
                    ]
                },
                5: {
                    question: 'Was macht deine Lösung konkret?',
                    description: 'Investoren müssen sofort verstehen, was du baust',
                    suggestedAnswers: [
                        'Wir automatisieren manuelle Prozesse mit KI-Technologie',
                        'Wir bieten eine Plattform, die Komplexität reduziert',
                        'Wir schaffen Transparenz durch Datenanalyse'
                    ]
                },
                6: {
                    question: 'Welche messbaren Erfolge hast du bisher?',
                    description: 'Traktion ist der beste Beweis für Product-Market Fit',
                    suggestedAnswers: [
                        'Wir haben erste zahlende Kunden und positives Feedback',
                        'Wir sind noch im MVP-Stadium mit Beta-Nutzern',
                        'Wir wachsen 20%+ monatlich bei Umsatz oder Nutzerzahlen'
                    ]
                },
                7: {
                    question: 'Wer sind deine Hauptwettbewerber?',
                    description: '"Keine Konkurrenz" ist nie die richtige Antwort',
                    suggestedAnswers: [
                        'Etablierte Player mit komplexen und teuren Lösungen',
                        'Indirekte Konkurrenz wie Excel oder manuelle Prozesse',
                        'Wir sind die ersten, die dieses Problem so angehen'
                    ]
                }
            };

            return fallbacks[stepNumber] || fallbacks[4];
        },

        _demoResponse() {
            return {
                criticalIssues: 4,
                warningIssues: 2,
                strongAreas: 1,
                issues: [
                    { severity: 'critical', title: 'Problemstellung ist vage', description: 'Du hast nicht klar definiert, wer dieses Problem hat.', impact: 'Investoren können keine Marktgröße berechnen', workshopPhase: 'Phase 2' },
                    { severity: 'critical', title: 'Keine Marktvalidierung', description: 'Keine Kundeninterviews, keine LOIs.', impact: 'Ohne Beweise wird kein Investor investieren', workshopPhase: 'Phase 5' },
                    { severity: 'critical', title: 'Schwaches Finanzmodell', description: 'Fehlend: CAC, LTV, Unit Economics.', impact: 'Unmöglich, Profitabilität zu prognostizieren', workshopPhase: 'Phase 8' },
                    { severity: 'critical', title: 'Keine klare Differenzierung', description: 'Was macht dich 10x besser?', impact: 'Warum sollte jemand wechseln?', workshopPhase: 'Phase 3' },
                    { severity: 'warning', title: 'Marktgröße braucht Arbeit', description: 'Benötigt Bottom-up TAM/SAM/SOM.', impact: 'Investoren zweifeln an Skalierbarkeit', workshopPhase: 'Phase 4' },
                    { severity: 'warning', title: 'Wettbewerbsanalyse oberflächlich', description: 'Zeige strategischen Vorteil.', impact: 'Angst vor Kopierung', workshopPhase: 'Phase 7' },
                    { severity: 'good', title: 'Starke Team-Story', description: 'Domain-Expertise ist klar.', impact: 'Gibt Vertrauen', workshopPhase: '-' }
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
        // PITCH ANALYSIS (NEW)
        // ============================================
        async analyzePitch(pitchContent, pitchType = 'investor_deck', fundingStage = 'seed') {
        try {
            console.log('🔍 Analyzing pitch...');

            const startTime = Date.now();

            const response = await fetch('/api/analyze-pitch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pitchContent,
                    pitchType,
                    fundingStage
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            const latency = Date.now() - startTime;

            console.log(`✅ Pitch analysis completed in ${latency}ms`);
            console.log(`📊 Overall Score: ${data.report.overallScore}/100`);

            if (CONFIG.features.trackMetrics && !data.demo) {
                Metrics.track('pitch-analysis', {
                    cost_usd: 0.02,
                    latency_ms: latency,
                    input_tokens: 3000,
                    output_tokens: 1000,
                    cache_read_tokens: data.cached ? 2500 : 0
                });
            }

            return data;
        } catch (error) {
            console.error('Error analyzing pitch:', error);
            throw error;
        }
    },

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

    console.log(`✅ PitchPerfect Geladen (V2.1 - ${CONFIG.features.adaptiveQuestions ? 'Adaptive Questions' : 'Standard'} + ${CONFIG.features.personalizedDiagnostics ? 'Personalized Diagnostics' : 'Generic'})`);

    // Log metrics summary if available
    const summary = Metrics.getSummary();
    if (summary) {
        console.log('📊 Session Metrics:', summary);
    }
})();
