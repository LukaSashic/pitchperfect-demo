// api/generate-adaptive-question.js

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Question templates based on step number
const QUESTION_TEMPLATES = {
    4: {
        focus: 'Problem',
        questionTypes: [
            'Wer genau hat dieses Problem?',
            'Wie viel kostet dieses Problem die Betroffenen?',
            'Warum ist dieses Problem jetzt besonders dringend?'
        ]
    },
    5: {
        focus: 'Lösung',
        questionTypes: [
            'Was macht deine Lösung konkret?',
            'Wie ist sie anders als bestehende Alternativen?',
            'Warum funktioniert sie besser?'
        ]
    },
    6: {
        focus: 'Traktion',
        questionTypes: [
            'Welche messbaren Erfolge hast du bisher?',
            'Wie schnell wächst du?',
            'Was ist deine aktuelle Conversion Rate?'
        ]
    },
    7: {
        focus: 'Wettbewerb',
        questionTypes: [
            'Wer sind deine direkten Wettbewerber?',
            'Was ist dein unfairer Vorteil?',
            'Warum können andere dich nicht einfach kopieren?'
        ]
    }
};

const SYSTEM_PROMPT = `Du bist ein KI-Assistent, der adaptive Fragen für eine Pitch-Diagnose generiert.

Deine Aufgabe:
1. Analysiere den Kontext (Pitch-Typ, Phase, Pitch-Entwurf, vorherige Antworten)
2. Generiere EINE präzise, spezifische Frage basierend auf dem Fokusbereich
3. Erstelle 3 relevante Antwortoptionen, die zum Nutzer passen

WICHTIGE REGELN:
- Die Frage MUSS zum Pitch-Entwurf passen und spezifisch sein
- Verwende Details aus dem Pitch-Entwurf in der Frage
- Antwortoptionen müssen realistisch und unterschiedlich sein
- Eine Option sollte konservativ sein, eine ambitioniert, eine mittelmäßig
- Antworten sollten 1-2 Sätze lang sein
- Sprache: Deutsch, direkt, ohne Floskeln

OUTPUT FORMAT (JSON):
{
    "question": "Spezifische Frage basierend auf Kontext",
    "description": "Warum diese Frage wichtig ist (1 Satz)",
    "suggestedAnswers": [
        "Antwort Option 1 (konservativ/realistisch)",
        "Antwort Option 2 (mittelmäßig/ausgewogen)",
        "Antwort Option 3 (ambitioniert/optimistisch)"
    ]
}

Beispiel:
Pitch-Entwurf: "Wir helfen Restaurants, Lebensmittelverschwendung zu reduzieren..."
Schritt 4 (Problem):
{
    "question": "Wie viel Umsatz verlieren Restaurants durchschnittlich durch Lebensmittelverschwendung pro Monat?",
    "description": "Die Quantifizierung des Problems macht es für Investoren greifbar",
    "suggestedAnswers": [
        "Etwa 5-10% des Umsatzes, also €2.000-4.000 bei einem durchschnittlichen Restaurant",
        "Rund 15-20% des Umsatzes, das sind €6.000-8.000 monatlich bei unserer Zielgruppe",
        "Bis zu 30% des Einkaufsbudgets, was €10.000+ pro Monat bedeuten kann"
    ]
}`;

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { stepNumber, context } = req.body;

        if (!stepNumber || !context) {
            return res.status(400).json({ error: 'Missing stepNumber or context' });
        }

        // Get question template for this step
        const template = QUESTION_TEMPLATES[stepNumber];
        if (!template) {
            return res.status(400).json({ error: 'Invalid step number' });
        }

        // Build context prompt
        let contextPrompt = `KONTEXT:
Pitch-Typ: ${context.pitchType || 'nicht angegeben'}
Phase: ${context.stage || 'nicht angegeben'}
Fokusbereich für diese Frage: ${template.focus}

`;

        // Add pitch draft if available
        if (context.pitchDraft && context.pitchDraft !== '[Kein Pitch-Entwurf vorhanden]') {
            contextPrompt += `PITCH-ENTWURF:
${context.pitchDraft.substring(0, 1000)}

`;
        }

        // Add previous answers if available
        if (context.previousAnswers && Object.keys(context.previousAnswers).length > 0) {
            contextPrompt += `VORHERIGE ANTWORTEN:\n`;
            Object.entries(context.previousAnswers).forEach(([key, value]) => {
                contextPrompt += `${key}: ${value}\n`;
            });
            contextPrompt += '\n';
        }

        contextPrompt += `AUFGABE:
Generiere eine ${template.focus}-Frage mit 3 Antwortoptionen.

Die Frage sollte spezifisch auf den Pitch-Entwurf eingehen und dem Nutzer helfen, ${template.focus} besser zu artikulieren.

Antworte NUR mit dem JSON-Objekt, NICHTS anderes.`;

        console.log('🤖 Generating adaptive question for step', stepNumber);

        // Call Claude API
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: contextPrompt
                }
            ]
        });

        const content = response.content[0].text;
        
        // Parse JSON response
        let questionData;
        try {
            // Strip markdown code blocks if present
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/```\n?/g, '').trim();
            }
            
            questionData = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('Failed to parse JSON:', content);
            throw new Error('Invalid JSON response from Claude');
        }

        // Validate response structure
        if (!questionData.question || !questionData.suggestedAnswers || questionData.suggestedAnswers.length !== 3) {
            throw new Error('Invalid question structure');
        }

        console.log('✅ Generated question:', questionData.question);

        return res.status(200).json(questionData);

    } catch (error) {
        console.error('Error generating adaptive question:', error);
        
        // Return fallback question based on step
        const fallbacks = {
            4: {
                question: 'Wie würdest du das Hauptproblem beschreiben, das du löst?',
                description: 'Eine klare Problemstellung ist die Basis eines überzeugenden Pitches',
                suggestedAnswers: [
                    'Unternehmen verschwenden Zeit mit ineffizienten Prozessen',
                    'Kunden haben Schwierigkeiten, die richtige Lösung zu finden',
                    'Der Markt ist intransparent und schwer zu navigieren'
                ]
            },
            5: {
                question: 'Was macht deine Lösung konkret?',
                description: 'Investoren müssen sofort verstehen, was du baust',
                suggestedAnswers: [
                    'Wir automatisieren manuelle Prozesse mit KI',
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

        const fallback = fallbacks[req.body.stepNumber] || fallbacks[4];
        
        return res.status(200).json(fallback);
    }
};
