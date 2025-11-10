// api/generate-adaptive-question.js
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
let anthropic;
try {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
} catch (error) {
    console.error('Failed to initialize Anthropic client:', error);
}

// Fallback questions if API fails
const FALLBACK_QUESTIONS = {
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

const SYSTEM_PROMPT = `Du bist ein KI-Assistent, der adaptive Fragen für eine Pitch-Diagnose generiert.

Deine Aufgabe:
1. Analysiere den Kontext (Pitch-Typ, Phase, Pitch-Entwurf)
2. Generiere EINE präzise, spezifische Frage basierend auf dem Pitch-Entwurf
3. Erstelle 3 relevante Antwortoptionen, die zum Nutzer passen

WICHTIGE REGELN:
- Die Frage MUSS zum Pitch-Entwurf passen und spezifisch sein
- Verwende Details aus dem Pitch-Entwurf in der Frage
- Antwortoptionen müssen realistisch und unterschiedlich sein
- Eine Option konservativ, eine ambitioniert, eine mittelmäßig
- Antworten sollten 1-2 Sätze lang sein
- Sprache: Deutsch, direkt, ohne Floskeln

OUTPUT FORMAT (reines JSON, keine Markdown):
{
    "question": "Spezifische Frage basierend auf Kontext",
    "description": "Warum diese Frage wichtig ist (1 Satz)",
    "suggestedAnswers": [
        "Antwort Option 1 (konservativ/realistisch)",
        "Antwort Option 2 (mittelmäßig/ausgewogen)",
        "Antwort Option 3 (ambitioniert/optimistisch)"
    ]
}`;

export default async function handler(req, res) {
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

        console.log('📥 Received request:', { stepNumber, contextKeys: Object.keys(context || {}) });

        // Validation
        if (!stepNumber || !context) {
            console.error('❌ Missing stepNumber or context');
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        // Check if API key is available
        if (!process.env.ANTHROPIC_API_KEY) {
            console.error('❌ ANTHROPIC_API_KEY not set, using fallback');
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        // Check if anthropic client initialized
        if (!anthropic) {
            console.error('❌ Anthropic client not initialized, using fallback');
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        // Build context prompt
        const focusAreas = {
            4: 'Problem',
            5: 'Lösung',
            6: 'Traktion',
            7: 'Wettbewerb'
        };

        const focusArea = focusAreas[stepNumber] || 'Business';

        let contextPrompt = `KONTEXT:
Pitch-Typ: ${context.pitchType || 'nicht angegeben'}
Phase: ${context.stage || 'nicht angegeben'}
Fokusbereich: ${focusArea}

`;

        // Add pitch draft if available
        if (context.pitchDraft && context.pitchDraft !== '[Kein Pitch-Entwurf vorhanden]') {
            const pitchPreview = context.pitchDraft.substring(0, 1500);
            contextPrompt += `PITCH-ENTWURF:
${pitchPreview}

`;
        }

        contextPrompt += `AUFGABE:
Generiere eine ${focusArea}-Frage mit 3 Antwortoptionen basierend auf dem Pitch-Entwurf oben.

Die Frage sollte spezifisch auf den Pitch-Entwurf eingehen.

Antworte NUR mit dem JSON-Objekt, NICHTS anderes. Keine Markdown-Blöcke.`;

        console.log('🤖 Calling Claude API...');

        // Call Claude API with timeout
        const response = await Promise.race([
            anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 800,
                system: SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: contextPrompt
                    }
                ]
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 10000)
            )
        ]);

        const content = response.content[0].text;
        
        console.log('✅ Got response from Claude');

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
            console.error('❌ Failed to parse JSON:', content.substring(0, 200));
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        // Validate response structure
        if (!questionData.question || !questionData.suggestedAnswers || questionData.suggestedAnswers.length !== 3) {
            console.error('❌ Invalid question structure');
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        console.log('✅ Returning adaptive question:', questionData.question.substring(0, 50) + '...');

        return res.status(200).json(questionData);

    } catch (error) {
        console.error('❌ Error in generate-adaptive-question:', error.message);
        
        // Always return fallback instead of error
        const stepNumber = req.body?.stepNumber || 4;
        return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
    }
}
