// api/evaluate-phase.js - Phase completion evaluation endpoint
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Phase-specific evaluation criteria
const PHASE_CRITERIA = {
    2: { // Fatal Errors Diagnosis
        name: "Fatale Fehler Diagnose",
        mustMeet: [
            { id: 'persona_identified', label: 'Spezifische Persona/Kunde identifiziert (nicht "Unternehmen" oder "Menschen")' },
            { id: 'problem_described', label: 'Problem klar artikuliert' },
            { id: 'hook_present', label: 'Hat einen Eröffnungshaken oder Aufmerksamkeits-Grabber' }
        ],
        shouldMeet: [
            { id: 'problem_quantified', label: 'Problem-Kosten/-Schmerz mit Zahlen quantifiziert', weight: 20 },
            { id: 'alternative_mentioned', label: 'Aktuelle Lösung/Alternative erwähnt', weight: 15 },
            { id: 'specific_example', label: 'Enthält spezifisches, lebendiges Beispiel', weight: 15 }
        ],
        maxScore: 100
    },
    3: { // Problem Definition
        name: "Problem-Befragung",
        mustMeet: [
            { id: 'specific_persona', label: 'Spezifische Persona mit demografischen Details' },
            { id: 'quantified_pain', label: 'Problem in €/Zeit/messbarer Metrik quantifiziert' },
            { id: 'current_alternative', label: 'Was Kunden HEUTE nutzen identifiziert' }
        ],
        shouldMeet: [
            { id: 'market_timing', label: 'Erklärt warum JETZT (Market Timing)', weight: 25 },
            { id: 'validation_evidence', label: 'Liefert Validierungs-Beweise (Interviews/Daten)', weight: 25 }
        ],
        maxScore: 100
    },
    4: { // Solution Clarity
        name: "Lösungsklarheit",
        mustMeet: [
            { id: 'solution_clear', label: 'Lösung klar in 2-3 Sätzen erklärt' },
            { id: 'differentiation', label: 'Klare Differenzierung von Alternativen' },
            { id: 'value_prop', label: 'Einzigartiges Wertversprechen formuliert' }
        ],
        shouldMeet: [
            { id: 'ten_x_better', label: '10x besser (nicht 10% besser) Verbesserung gezeigt', weight: 20 },
            { id: 'feasibility', label: 'Lösungs-Machbarkeit erklärt', weight: 15 },
            { id: 'simple_explanation', label: 'Jeder kann es verstehen (kein Jargon)', weight: 15 }
        ],
        maxScore: 100
    },
    // Add more phases as needed
};

// Evaluation prompt template
function buildEvaluationPrompt(phase, conversationHistory, criteria) {
    return `Du bist ein Experten-Pitch-Coach und bewertest die Arbeit eines Gründers in Phase ${phase}: ${criteria.name}.

<conversation_history>
${conversationHistory.map(msg => `${msg.role === 'user' ? 'Gründer' : 'Coach'}: ${msg.content}`).join('\n\n')}
</conversation_history>

<evaluation_criteria>
ERFORDERLICHE KRITERIEN (Pflicht - binär erfüllt/nicht erfüllt):
${criteria.mustMeet.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}

BONUS-KRITERIEN (Bonuspunkte):
${criteria.shouldMeet.map((c, i) => `${i + 1}. ${c.label} (${c.weight} Punkte)`).join('\n')}
</evaluation_criteria>

<evaluation_instructions>
1. Analysiere die Konversation um zu bestimmen, ob jedes Kriterium erfüllt ist
2. Berechne den Score:
   - Basis-Score: 50 Punkte wenn ALLE Pflicht-Kriterien erfüllt sind
   - Wenn IRGENDEIN Pflicht-Kriterium fehlt: max Score = 40 Punkte
   - Addiere Bonus-Punkte für jedes erfüllte Bonus-Kriterium
   - Maximum möglich: ${criteria.maxScore} Punkte

3. Gib spezifisches, umsetzbares Feedback für Lücken
4. Sei direkt aber ermutigend - deutsche Gründer schätzen Ehrlichkeit

Gib deine Bewertung in diesem EXAKTEN JSON-Format aus (kein Markdown, keine Code-Blöcke):
{
  "score": <Zahl 0-100>,
  "canProceed": <boolean - true wenn score >= 70>,
  "mustMeetResults": {
    ${criteria.mustMeet.map(c => `"${c.id}": <boolean>`).join(',\n    ')}
  },
  "shouldMeetResults": {
    ${criteria.shouldMeet.map(c => `"${c.id}": <boolean>`).join(',\n    ')}
  },
  "gaps": [<Array von Strings die beschreiben was fehlt>],
  "feedback": "<Ermutigendes aber direktes Feedback auf Deutsch, 2-3 Sätze>",
  "nextSteps": "<Spezifischer umsetzbarer nächster Schritt auf Deutsch>"
}
</evaluation_instructions>

**WICHTIG: Alle Ausgaben müssen auf Deutsch sein.**

Bewerte die Konversation und gib NUR das JSON-Objekt zurück, nichts anderes.`;
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { phase, conversationHistory } = req.body;

        // Validate inputs
        if (!phase || !conversationHistory) {
            return res.status(400).json({
                error: 'Missing required fields: phase, conversationHistory'
            });
        }

        // Get criteria for this phase
        const criteria = PHASE_CRITERIA[phase];
        if (!criteria) {
            return res.status(400).json({
                error: `No evaluation criteria defined for phase ${phase}`
            });
        }

        // Build evaluation prompt
        const evaluationPrompt = buildEvaluationPrompt(phase, conversationHistory, criteria);

        console.log(`\n📊 Evaluating Phase ${phase}...`);

        // Call Claude for evaluation
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            temperature: 0.3, // Lower temperature for consistent scoring
            messages: [{
                role: 'user',
                content: evaluationPrompt
            }]
        });

        // Extract JSON from response
        let evaluationResult;
        try {
            const responseText = response.content[0].text.trim();
            // Remove markdown code blocks if present
            const jsonText = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            evaluationResult = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError);
            console.error('Response text:', response.content[0].text);
            return res.status(500).json({
                error: 'Failed to parse evaluation result',
                details: parseError.message
            });
        }

        console.log(`✅ Evaluation complete: ${evaluationResult.score}/100`);

        // Return evaluation
        return res.status(200).json({
            success: true,
            phase,
            evaluation: evaluationResult,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Evaluation Error:', error);
        return res.status(500).json({
            error: 'Evaluation failed',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}