// api/analyze-pitch.js - Enhanced pitch analysis with structured errors
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildAnalysisPrompt(pitchText, diagnosticData) {
    const pitchType = diagnosticData?.pitch_purpose || 'investor';

    return `You are an expert pitch coach analyzing a founder's pitch draft.

<pitch_text>
${pitchText}
</pitch_text>

<pitch_context>
Purpose: ${pitchType}
Stage: ${diagnosticData?.business_stage || 'unknown'}
</pitch_context>

<analysis_task>
Identify 3-5 FATAL ERRORS in this pitch that would cause investors to reject it immediately.

Focus on errors like:
- Vague problem statements (no specific persona or quantified pain)
- Missing or unclear solution
- No market sizing or unrealistic numbers
- Weak differentiation (sounds like everyone else)
- No clear ask or vague funding request
- Missing traction/validation
- Confusing language or jargon

For each error, provide:
1. Error name (short, punchy) - IN GERMAN
2. What's wrong (quote the problematic part) - IN GERMAN
3. Why it's fatal (investor perspective) - IN GERMAN
4. How to fix it (specific, actionable) - IN GERMAN

**IMPORTANT: ALL output must be in German language. Error titles, descriptions, impact statements, and fixes should all be in German.**

Output ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "overallScore": <number 0-100>,
  "canProceedToWorkshop": <boolean>,
  "fatalErrors": [
    {
      "id": "vague_problem",
      "title": "<Kurzer Fehlername auf Deutsch>",
      "severity": "critical|high|medium",
      "evidence": "<Zitat aus dem Pitch auf Deutsch>",
      "impact": "<Warum das den Pitch killt - 1 Satz auf Deutsch>",
      "fix": "<Spezifische umsetzbare Lösung - 1-2 Sätze auf Deutsch>"
    }
  ],
  "strengths": ["<Dinge die gut gemacht sind - auf Deutsch>"],
  "nextSteps": "<Was der Nutzer zuerst fokussieren sollte - auf Deutsch>",
  "estimatedWorkshopTime": "<z.B., 2-3 Stunden>"
}
</analysis_task>

**REMEMBER: Respond ENTIRELY in German. This is for a German founder.**

Analyze the pitch and return ONLY the JSON object.`;
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
        const { pitchText, diagnosticData } = req.body;

        if (!pitchText || pitchText.length < 50) {
            return res.status(400).json({
                error: 'Pitch text too short (minimum 50 characters)'
            });
        }

        console.log('\n🔍 Analyzing pitch draft...');

        // Build analysis prompt
        const analysisPrompt = buildAnalysisPrompt(pitchText, diagnosticData);

        // Call Claude
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 3000,
            temperature: 0.5,
            messages: [{
                role: 'user',
                content: analysisPrompt
            }]
        });

        // Parse response
        let analysis;
        try {
            const responseText = response.content[0].text.trim();
            const jsonText = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            analysis = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError);
            console.error('Response:', response.content[0].text);
            return res.status(500).json({
                error: 'Failed to parse analysis',
                details: parseError.message
            });
        }

        console.log(`✅ Analysis complete: ${analysis.fatalErrors.length} errors found`);

        // Return analysis
        return res.status(200).json({
            success: true,
            analysis,
            pitchLength: pitchText.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Analysis Error:', error);
        return res.status(500).json({
            error: 'Analysis failed',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}