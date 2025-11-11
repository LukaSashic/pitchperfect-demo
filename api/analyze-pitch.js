// api/analyze-pitch.js - Pitch Diagnostic Analysis with Response Prefilling
import Anthropic from '@anthropic-ai/sdk';

let anthropic;
try {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
} catch (error) {
    console.error('Failed to initialize Anthropic client:', error);
}

const DIAGNOSTIC_SYSTEM_PROMPT = `Du bist ein Elite-Pitch-Diagnostik-System, das Startup-Pitches über 10 Kernelemente analysiert.

**Die 10 Kernelemente:**
1. Problem-Klarheit (0-10)
2. Lösungs-Durchführbarkeit (0-10)
3. Marktchance (0-10)
4. Wettbewerbsvorteil (0-10)
5. Geschäftsmodell (0-10)
6. Traktions-Beweis (0-10)
7. Team-Stärke (0-10)
8. Narrativer Fluss (0-10)
9. Delivery-Impact (0-10)
10. Investor-Bereitschaft (0-10)

**Bewertung:**
- 8-10: STARK ✅
- 5-7: WARNUNG ⚠️
- 0-4: KRITISCH 🔴

**Output-Format:**
Gib NUR valides XML zurück, beginnend mit <diagnostic_report>. Keine Einleitung.`;

// Fallback demo response
const DEMO_RESPONSE = {
    overallScore: 52,
    elements: {
        problemClarity: { score: 4, status: 'CRITICAL', feedback: 'Problem ist zu vage definiert', actionItems: ['Spezifische Persona definieren', 'Problem quantifizieren'] },
        solutionViability: { score: 6, status: 'WARNING', feedback: 'Lösung braucht mehr Differenzierung', actionItems: ['Unique Value Proposition schärfen'] },
        marketOpportunity: { score: 5, status: 'WARNING', feedback: 'Marktgröße benötigt Bottom-up-Berechnung', actionItems: ['TAM/SAM/SOM erstellen'] },
        competitiveAdvantage: { score: 4, status: 'CRITICAL', feedback: 'Kein klarer Burggraben erkennbar', actionItems: ['Unfairen Vorteil identifizieren'] },
        businessModel: { score: 3, status: 'CRITICAL', feedback: 'Unit Economics fehlen komplett', actionItems: ['CAC und LTV berechnen'] },
        tractionEvidence: { score: 5, status: 'WARNING', feedback: 'Erste Erfolge, aber keine harten Zahlen', actionItems: ['MRR/Nutzerzahlen dokumentieren'] },
        teamStrength: { score: 8, status: 'STRONG', feedback: 'Starkes Team mit Domain-Expertise', actionItems: [] },
        narrativeFlow: { score: 6, status: 'WARNING', feedback: 'Story braucht stärkeren Hook', actionItems: ['Eröffnung optimieren'] },
        deliveryImpact: { score: 5, status: 'WARNING', feedback: 'Präsentation okay, könnte kraftvoller sein', actionItems: ['Delivery üben'] },
        investorReadiness: { score: 4, status: 'CRITICAL', feedback: 'Nicht bereit für Investor-Meetings', actionItems: ['Kritische Lücken schließen'] }
    },
    criticalGaps: ['Problem-Klarheit', 'Wettbewerbsvorteil', 'Geschäftsmodell', 'Investor-Bereitschaft'],
    warningAreas: ['Lösungs-Durchführbarkeit', 'Marktchance', 'Traktions-Beweis'],
    strengths: ['Team-Stärke'],
    recommendedPhases: [2, 3, 4, 6, 10],
    estimatedWorkTime: '8-10 Stunden'
};

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
        const { pitchContent, pitchType = 'investor_deck', fundingStage = 'seed' } = req.body;

        // Fallback if no API key or no pitch content
        if (!pitchContent || !process.env.ANTHROPIC_API_KEY || !anthropic) {
            console.log('⚠️ Using demo diagnostic response');
            return res.status(200).json({
                success: true,
                report: DEMO_RESPONSE,
                demo: true
            });
        }

        const userMessage = `Analysiere diesen ${pitchType}-Pitch für ein ${fundingStage}-Startup:

<pitch>
${pitchContent.substring(0, 3000)}
</pitch>

Gib eine umfassende Diagnose-Analyse.`;

        // **RESPONSE PREFILLING** - Force structured XML output
        const prefill = '<diagnostic_report>\n<overall_score>';

        const messages = [
            {
                role: 'user',
                content: userMessage
            },
            {
                role: 'assistant',
                content: prefill  // ← Prefill forces XML structure
            }
        ];

        const response = await Promise.race([
            anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 3000,
                temperature: 0,
                system: [
                    {
                        type: 'text',
                        text: DIAGNOSTIC_SYSTEM_PROMPT,
                        cache_control: { type: 'ephemeral' }
                    }
                ],
                messages: messages
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 15000)
            )
        ]);

        // Prepend prefill to response
        let diagnosticXML = prefill + response.content[0].text;

        // Ensure closing tag
        if (!diagnosticXML.includes('</diagnostic_report>')) {
            diagnosticXML += '\n</diagnostic_report>';
        }

        // Parse XML to structured JSON
        const diagnosticReport = parseDiagnosticXML(diagnosticXML);

        return res.status(200).json({
            success: true,
            report: diagnosticReport,
            rawXML: diagnosticXML,
            usage: response.usage,
            cached: (response.usage.cache_read_input_tokens || 0) > 0
        });

    } catch (error) {
        console.error('❌ Diagnostic analysis error:', error.message);

        // Fallback to demo response
        return res.status(200).json({
            success: true,
            report: DEMO_RESPONSE,
            demo: true,
            error: error.message
        });
    }
}

// ============================================
// XML PARSING HELPERS
// ============================================
function parseDiagnosticXML(xml) {
    try {
        return {
            overallScore: parseInt(extractTag(xml, 'overall_score')) || 50,
            elements: {
                problemClarity: parseElement(xml, 'problem_clarity'),
                solutionViability: parseElement(xml, 'solution_viability'),
                marketOpportunity: parseElement(xml, 'market_opportunity'),
                competitiveAdvantage: parseElement(xml, 'competitive_advantage'),
                businessModel: parseElement(xml, 'business_model'),
                tractionEvidence: parseElement(xml, 'traction_evidence'),
                teamStrength: parseElement(xml, 'team_strength'),
                narrativeFlow: parseElement(xml, 'narrative_flow'),
                deliveryImpact: parseElement(xml, 'delivery_impact'),
                investorReadiness: parseElement(xml, 'investor_readiness')
            },
            criticalGaps: extractList(xml, 'critical_gaps'),
            warningAreas: extractList(xml, 'warning_areas'),
            strengths: extractList(xml, 'strengths'),
            recommendedPhases: extractList(xml, 'recommended_phases'),
            estimatedWorkTime: extractTag(xml, 'estimated_work_time') || '6-8 Stunden'
        };
    } catch (error) {
        console.error('XML parsing error:', error);
        return DEMO_RESPONSE;
    }
}

function parseElement(xml, elementName) {
    const elementXML = extractTag(xml, elementName);
    if (!elementXML) return null;

    const score = parseInt(extractTag(elementXML, 'score')) || 5;
    let status = 'WARNING';
    if (score >= 8) status = 'STRONG';
    else if (score <= 4) status = 'CRITICAL';

    return {
        score: score,
        status: status,
        feedback: extractTag(elementXML, 'feedback') || 'Keine Bewertung verfügbar',
        actionItems: extractTag(elementXML, 'action_items')?.split('\n').filter(a => a.trim()) || []
    };
}

function extractTag(text, tag) {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
}

function extractList(xml, listTag) {
    const listXML = extractTag(xml, listTag);
    if (!listXML) return [];

    const itemRegex = /<item>(.*?)<\/item>/gs;
    const matches = [...listXML.matchAll(itemRegex)];
    return matches.map(m => m[1].trim());
}