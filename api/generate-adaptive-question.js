// api/generate-adaptive-question.js
import Anthropic from '@anthropic-ai/sdk';

let anthropic;
try {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
} catch (error) {
    console.error('Failed to initialize Anthropic client:', error);
}

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

AUFGABE:
1. Analysiere den Pitch-Entwurf
2. Generiere EINE spezifische Frage
3. Erstelle 3 unterschiedliche Antwortoptionen

REGELN:
- Frage MUSS zum Pitch passen
- Nutze Details aus dem Pitch
- Antworten: konservativ, mittelmäßig, ambitioniert
- Antworten: 1-2 Sätze
- Deutsch, direkt, konkret

OUTPUT (reines JSON):
{
    "question": "Spezifische Frage",
    "description": "Warum wichtig (1 Satz)",
    "suggestedAnswers": ["Option 1", "Option 2", "Option 3"]
}`;

export default async function handler(req, res) {
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

        if (!stepNumber || !context || !process.env.ANTHROPIC_API_KEY || !anthropic) {
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

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

        if (context.pitchDraft && context.pitchDraft !== '[Kein Pitch-Entwurf vorhanden]') {
            const pitchPreview = context.pitchDraft.substring(0, 800);
            contextPrompt += `PITCH:
${pitchPreview}

`;
        }

        contextPrompt += `Generiere ${focusArea}-Frage mit 3 Optionen.
NUR JSON, keine Markdown.`;

        // **RESPONSE PREFILLING** - Force JSON output
        const prefill = '{';

        const response = await Promise.race([
            anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 500,
                system: SYSTEM_PROMPT,
                messages: [
                    { role: 'user', content: contextPrompt },
                    { role: 'assistant', content: prefill }
                ]
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 7000)
            )
        ]);

        // Prepend prefill to response
        let responseContent = prefill + response.content[0].text;

        let questionData;
        try {
            let cleanContent = responseContent.trim();
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }
            questionData = JSON.parse(cleanContent);
        } catch (parseError) {
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        if (!questionData.question || !questionData.suggestedAnswers || questionData.suggestedAnswers.length !== 3) {
            return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
        }

        return res.status(200).json(questionData);

    } catch (error) {
        console.error('❌ Error:', error.message);
        const stepNumber = req.body?.stepNumber || 4;
        return res.status(200).json(FALLBACK_QUESTIONS[stepNumber] || FALLBACK_QUESTIONS[4]);
    }
}