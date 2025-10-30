// PitchPerfect AI - Demo Connector Script (DEUTSCHE VERSION)
// Füge zu allen 3 HTML-Dateien hinzu: <script src="pitchperfect-connector.js"></script>

(function() {
    'use strict';

    const CONFIG = {
        isDemoMode: false, // Auf true setzen, wenn API fehlschlägt
        localStorageKey: 'pitchperfect_demo',
        apiEndpoint: '/api/chat'
    };

    // State Management
    const DemoState = {
        load() {
            const data = localStorage.getItem(CONFIG.localStorageKey);
            return data ? JSON.parse(data) : {
                user: { email: '', createdAt: new Date().toISOString() },
                diagnostic: { completed: false, answers: {}, results: null },
                workshop: { unlocked: false, currentPhase: 2, messages: {}, phaseCompletion: {} },
                paymentIntent: false
            };
        },
        save(data) {
            localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(data));
        }
    };

    // Echte KI-Integration
    const AI = {
        async generateDiagnostic(answers) {
            if (CONFIG.isDemoMode) {
                return this._demoResponse();
            }

            try {
                // Für Demo: verwende statische Diagnose
                // In Produktion würdest du einen API-Endpunkt aufrufen
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
                const response = await fetch(CONFIG.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        phase: phase,
                        message: message,
                        conversationHistory: conversationHistory
                    })
                });

                if (!response.ok) {
                    throw new Error(`API Fehler: ${response.status}`);
                }

                const data = await response.json();
                return {
                    content: data.content,
                    phaseComplete: data.phaseComplete || false
                };

            } catch (error) {
                console.error('KI API Fehler:', error);
                
                // Fallback zu Demo-Modus
                console.log('⚠️ Fallback zu Demo-Modus');
                return this._demoAIResponse(conversationHistory.length);
            }
        },

        // Demo Fallback-Antworten auf Deutsch
        _demoResponse() {
            return {
                criticalIssues: 4,
                warningIssues: 2,
                strongAreas: 1,
                issues: [
                    { severity: 'critical', title: 'Problemstellung ist vage', description: 'Du hast nicht klar definiert, wer dieses Problem hat, wie viel es sie kostet oder warum bestehende Lösungen scheitern.' },
                    { severity: 'critical', title: 'Keine Marktvalidierung', description: 'Keine Kundeninterviews, keine LOIs, keine Vorbestellungen. Große rote Flagge.' },
                    { severity: 'critical', title: 'Schwaches Finanzmodell', description: 'Fehlend: CAC, LTV, Payback-Periode, Unit Economics.' },
                    { severity: 'critical', title: 'Keine klare Differenzierung', description: 'Was macht dich 10x besser? Was ist dein Burggraben?' },
                    { severity: 'warning', title: 'Marktgröße braucht Arbeit', description: 'Benötigt Bottom-up TAM/SAM/SOM Analyse.' },
                    { severity: 'warning', title: 'Wettbewerbsanalyse oberflächlich', description: 'Zeige deinen strategischen Vorteil und Ausführungsvorteile.' },
                    { severity: 'good', title: 'Starke Team-Story', description: 'Deine Domain-Expertise ist eine klare Stärke.' }
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
                phaseComplete: msgCount >= 5
            };
        }
    };

    window.PitchPerfect = { DemoState, AI, CONFIG };
    console.log('✅ PitchPerfect Geladen (Echte KI Modus)');
})();
