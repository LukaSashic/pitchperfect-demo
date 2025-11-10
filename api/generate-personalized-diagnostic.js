// api/generate-personalized-diagnostic.js
import Anthropic from '@anthropic-ai/sdk';

let anthropic;
try {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
} catch (error) {
    console.error('Failed to initialize Anthropic client:', error);
}

const SYSTEM_PROMPT = `Du bist ein Pitch-Coach-Experte, der personalisierte Pitch-Diagnosen erstellt.

AUFGABE:
Analysiere die Antworten des Nutzers und erstelle eine brutally honest, aber konstruktive Diagnose mit 5-7 Issues.

WICHTIG:
- Referenziere SPEZIFISCHE Details aus dem Pitch-Entwurf
- Nutze konkrete Beispiele aus ihren Antworten
- Zeige den finanziellen Impact jedes Problems (in €)
- Priorisiere nach Schweregrad
- Sei direkt und ehrlich, aber ermutigend

ISSUE TYPES:
- critical: Verhindert Finanzierung/Deal komplett (rot 🔴)
- warning: Schwächt Pitch erheblich (gelb 🟡)
- good: Starke Bereiche (grün 🟢)

OUTPUT FORMAT (JSON):
{
    "criticalIssues": 2,
    "warningIssues": 3,
    "strongAreas": 2,
    "issues": [
        {
            "severity": "critical",
            "title": "Spezifischer Titel mit Details aus Pitch",
            "description": "Konkrete Beschreibung mit Referenz zu ihren Antworten",
            "impact": "Kosten/Verlust wenn nicht behoben",
            "workshopPhase": "Phase 2, 3"
        }
    ]
}

Beispiel:
Für einen Pitch über "Firmenevents in der Natur":
{
    "severity": "critical",
    "title": "Keine konkreten ROI-Zahlen für HR-Manager",
    "description": "Du beschreibst 'motivierte Teams', aber HR-Manager brauchen harte Zahlen: -X% Krankenstand, +Y% Retention, €Z gespart pro Mitarbeiter. Ohne diese Metriken wirst du als 'nice to have' abgelehnt.",
    "impact": "€50.000+ in verlorenen Deals, weil Budget-Entscheider keine Rechtfertigung haben",
    "workshopPhase": "Phase 4, 6"
}`;

const FALLBACK_DIAGNOSTIC = {
    criticalIssues: 4,
    warningIssues: 2,
    strongAreas: 1,
    issues: [
        {
            severity: 'critical',
            title: 'Problemstellung ist vage',
            description: 'Du hast nicht klar definiert, wer dieses Problem hat und wie teuer es für sie ist.',
            impact: 'Investoren können keine Marktgröße berechnen',
            workshopPhase: 'Phase 2'
        },
        {
            severity: 'critical',
            title: 'Keine Marktvalidierung',
            description: 'Keine Kundeninterviews, keine LOIs, keine Beweise für Nachfrage.',
            impact: 'Ohne Beweise wird kein Investor investieren',
            workshopPhase: 'Phase 5'
        },
        {
            severity: 'critical',
            title: 'Schwaches Finanzmodell',
            description: 'Fehlend: CAC, LTV, Unit Economics, Payback Period.',
            impact: 'Unmöglich, Profitabilität zu prognostizieren',
            workshopPhase: 'Phase 8'
        },
        {
            severity: 'critical',
            title: 'Keine klare Differenzierung',
            description: 'Was macht dich 10x besser als Alternativen? Nicht klar.',
            impact: 'Warum sollte jemand wechseln?',
            workshopPhase: 'Phase 3'
        },
        {
            severity: 'warning',
            title: 'Marktgröße braucht Arbeit',
            description: 'Benötigt Bottom-up TAM/SAM/SOM mit Quellen.',
            impact: 'Investoren zweifeln an Skalierbarkeit',
            workshopPhase: 'Phase 4'
        },
        {
            severity: 'warning',
            title: 'Wettbewerbsanalyse oberflächlich',
            description: 'Zeige strategischen Vorteil und Barrieren.',
            impact: 'Angst vor Kopierung',
            workshopPhase: 'Phase 7'
        },
        {
            severity: 'good',
            title: 'Starke Team-Story',
            description: 'Domain-Expertise ist klar.',
            impact: 'Gibt Vertrauen',
            workshopPhase: '-'
        }
    ]
};

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
        const { formData } = req.body;

        console.log('📥 Generating personalized diagnostic');

        if (!formData || !process.env.ANTHROPIC_API_KEY || !anthropic) {
            console.log('⚠️ Using fallback diagnostic');
            return res.status(200).json(FALLBACK_DIAGNOSTIC);
        }

        // Build comprehensive context
        let contextPrompt = `NUTZER-ANTWORTEN:

Pitch-Typ: ${formData.pitchType || 'nicht angegeben'}
Phase: ${formData.stage || 'nicht angegeben'}

PITCH-ENTWURF:
${formData.pitchDraft || '[Kein Pitch vorhanden]'}

`;

        if (formData.question4) {
            contextPrompt += `PROBLEM (Frage 4): ${formData.question4}\n\n`;
        }
        if (formData.question5) {
            contextPrompt += `LÖSUNG (Frage 5): ${formData.question5}\n\n`;
        }
        if (formData.question6) {
            contextPrompt += `TRAKTION (Frage 6): ${formData.question6}\n\n`;
        }
        if (formData.question7) {
            contextPrompt += `WETTBEWERB (Frage 7): ${formData.question7}\n\n`;
        }

        contextPrompt += `AUFGABE:
Erstelle eine personalisierte Pitch-Diagnose mit 5-7 Issues.
Referenziere spezifische Details aus dem Pitch und den Antworten.
Zeige konkrete Impact-Zahlen.

Antworte NUR mit JSON, keine Markdown.`;

        console.log('🤖 Calling Claude API for diagnostic...');

        const response = await Promise.race([
            anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: contextPrompt }]
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 15000)
            )
        ]);

        const content = response.content[0].text;
        
        console.log('✅ Got diagnostic response');

        let diagnosticData;
        try {
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }
            diagnosticData = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('❌ Failed to parse diagnostic JSON');
            return res.status(200).json(FALLBACK_DIAGNOSTIC);
        }

        // Validate structure
        if (!diagnosticData.issues || !Array.isArray(diagnosticData.issues)) {
            return res.status(200).json(FALLBACK_DIAGNOSTIC);
        }

        console.log(`✅ Returning personalized diagnostic with ${diagnosticData.issues.length} issues`);

        return res.status(200).json(diagnosticData);

    } catch (error) {
        console.error('❌ Error generating diagnostic:', error.message);
        return res.status(200).json(FALLBACK_DIAGNOSTIC);
    }
}
