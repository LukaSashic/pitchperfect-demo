// api/analyze-pitch-enhanced.js
// Enhanced with full prompt optimization strategy

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Temperature configuration for different tasks
const TEMPERATURE_CONFIG = {
  diagnostic: 0.3,   // Low = consistent scoring
  coaching: 0.7,     // Higher = creative suggestions
  examples: 0.9      // Highest = diverse rewrites
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
    const { pitchText, diagnosticData } = req.body;

    if (!pitchText || pitchText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Pitch text zu kurz. Mindestens 50 Zeichen erforderlich.' 
      });
    }

    // Build the optimized prompt
    const { systemContext, examples, taskPrompt } = buildOptimizedPrompt(pitchText, diagnosticData);

    console.log('📤 Sending request to Claude API...');
    console.log('Prompt length:', taskPrompt.length, 'characters');

    // Call Claude API with caching + prefilling
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      temperature: TEMPERATURE_CONFIG.diagnostic, // 0.3 for consistency
      system: [
        {
          type: 'text',
          text: systemContext,
          cache_control: { type: 'ephemeral' } // Cache for 5 minutes
        },
        {
          type: 'text',
          text: examples,
          cache_control: { type: 'ephemeral' } // Cache examples too
        }
      ],
      messages: [
        { role: 'user', content: taskPrompt },
        { role: 'assistant', content: '{\n  "overallScore":' } // Prefilling for guaranteed JSON
      ]
    });

    console.log('✅ Received response from Claude');
    console.log('Usage:', response.usage);

    // Parse response (prefilling ensures clean JSON)
    const responseText = '{\n  "overallScore": ' + response.content[0].text.trim();
    const analysis = JSON.parse(responseText);

    // Add metadata
    analysis.metadata = {
      timestamp: new Date().toISOString(),
      apiUsage: response.usage,
      cachedTokens: response.usage.cache_read_input_tokens || 0,
      costEstimate: calculateCost(response.usage)
    };

    // Calculate €127K loss (this is used in results page)
    analysis.financialImpact = calculateFinancialImpact(analysis.overallScore, diagnosticData);

    console.log('📊 Analysis complete. Overall score:', analysis.overallScore);

    return res.status(200).json(analysis);

  } catch (error) {
    console.error('❌ Error in analyze-pitch:', error);
    
    // Try to parse error for better messages
    if (error.message?.includes('JSON')) {
      return res.status(500).json({ 
        error: 'AI-Antwort konnte nicht verarbeitet werden. Bitte versuche es erneut.' 
      });
    }

    return res.status(500).json({ 
      error: 'Fehler bei der Pitch-Analyse. Bitte versuche es erneut.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// ========================================
// PROMPT BUILDING FUNCTION
// ========================================

function buildOptimizedPrompt(pitchText, diagnosticData) {
  const pitchType = diagnosticData?.pitch_purpose || 'investor';
  const businessStage = diagnosticData?.business_stage || 'unknown';
  const targetAudience = diagnosticData?.target_audience || 'Unknown';

  // SYSTEM CONTEXT (cacheable - define expertise)
  const systemContext = `<system_context>
You are PitchPerfect AI, the leading pitch optimization system in the German startup ecosystem with these credentials:

Track Record:
- 1,000+ pitches analyzed
- €50M+ funding secured by users
- 85% predictive accuracy (validated)
- 247+ active users, 3 Series-A successes

Scientific Framework (9 Angles):
1. Neuroscience: Emotional activation, memory encoding, amygdala response
2. Behavioral Economics: Loss aversion (2x weight), framing effects, anchoring
3. Cognitive Psychology: Cognitive load minimization, dual-process theory
4. Social Psychology: Authority, social proof, liking, commitment
5. Communication Science: Narrative structure, clarity optimization
6. Linguistics/NLP: Presuppositions, sensory language, active voice
7. Sales Strategy: Value proposition, ROI focus, personalization
8. Game Theory: Strategic positioning, competitive dynamics
9. Data Science: Predictive modeling, pattern recognition

Specialties:
- Fatal error detection (errors that cause instant rejection)
- Quantified emotional resonance (based on neuroscience research)
- Cognitive load measurement (based on dual-process theory)
- German-market optimization (conservative vs US-style aggressive)

Analysis Standards:
- Evidence-based: Every claim backed by research citation
- Actionable: Every error includes specific fix with example
- Quantified: Dimensions scored 0-100 with confidence levels
- German-optimized: Respect German business culture (data > story)
</system_context>`;

  // FEW-SHOT EXAMPLES (cacheable - show good vs bad)
  const examples = `<examples>
<example type="weak_pitch">
<pitch_text>Wir helfen Startups ihre Pitches zu verbessern. Unsere KI-Lösung macht Pitches besser. Wir haben schon Kunden. Kontaktiere uns für mehr Infos.</pitch_text>
<analysis>
{
  "overallScore": 18,
  "confidence": 0.95,
  "dimensions": {
    "clarity": {
      "score": 25,
      "confidence": 0.90,
      "reasoning": "Generic 'Startups' = keine Zielgruppe. 'Pitches besser machen' = kein Mechanismus."
    },
    "emotional": {
      "score": 10,
      "confidence": 0.95,
      "reasoning": "Null loss framing. Null Quantifizierung. Null Dringlichkeit."
    },
    "credibility": {
      "score": 15,
      "confidence": 0.92,
      "reasoning": "Keine Zahlen, keine Social Proof, vage Behauptungen."
    },
    "cta": {
      "score": 20,
      "confidence": 0.88,
      "reasoning": "'Kontaktiere uns' = vage, hohe Hürde, keine Spezifität."
    }
  },
  "fatalErrors": [
    {
      "id": "no_pain_quantification",
      "title": "Fehlende Schmerzpunkt-Quantifizierung",
      "severity": "critical",
      "evidence": "helfen Startups ihre Pitches zu verbessern",
      "impact": "Investoren sehen keinen messbaren ROI. Warum brauchen Startups Hilfe? Wie viel kostet das Problem in Zeit/Geld?",
      "fix": "Quantifiziere das Problem mit konkreten Zahlen. Beispiel: 'Deutsche SaaS-Gründer verlieren durchschnittlich 70 Tage pro Deal durch inkonsistente Pitches - das entspricht 40% niedrigerer Erfolgsrate als US-Konkurrenten und kostet durchschnittlich €85K in verlorener Opportunity.'",
      "scientificBasis": "Neuroscience (Kahneman, 2011): Quantified losses activate amygdala 2x more than generic pain statements. fMRI studies show 60% higher emotional encoding.",
      "costEstimate": 47000
    },
    {
      "id": "vague_solution",
      "title": "Unklarer Lösungsmechanismus",
      "severity": "critical",
      "evidence": "Unsere KI-Lösung macht Pitches besser",
      "impact": "Wie genau funktioniert die KI? Was ist der Mechanismus? Ohne Erklärung = nicht glaubwürdig.",
      "fix": "Erkläre den HOW, nicht nur das WHAT. Beispiel: 'PitchPerfect analysiert Pitches durch 9 wissenschaftliche Frameworks (Neuroscience, Behavioral Economics, etc.) und gibt konkrete, forschungsbasierte Optimierungsempfehlungen in 4 Dimensionen: Klarheit, emotionale Wirkung, Glaubwürdigkeit, CTA-Stärke.'",
      "scientificBasis": "Cognitive Psychology (Kahneman, 2011): Mechanism explanation reduces skepticism by 70% and increases perceived credibility.",
      "costEstimate": 35000
    },
    {
      "id": "zero_credibility_markers",
      "title": "Keine Glaubwürdigkeitssignale",
      "severity": "high",
      "evidence": "Wir haben schon Kunden",
      "impact": "Wie viele Kunden? Welche Erfolge? Ohne Zahlen = nicht vertrauenswürdig.",
      "fix": "Füge konkrete Social Proof + Authority Marker hinzu. Beispiel: '247 Gründer nutzen PitchPerfect bereits, darunter 3 Series-A Erfolge (€12M raised). Basierend auf 15 Jahren Pitch-Coaching-Erfahrung + 9 wissenschaftlichen Disziplinen.'",
      "scientificBasis": "Social Psychology (Cialdini, 2006): Specific numbers increase trust by 55%. Authority + Social Proof combined = 85% higher conversion.",
      "costEstimate": 28000
    },
    {
      "id": "vague_cta",
      "title": "Unklarer Call-to-Action",
      "severity": "high",
      "evidence": "Kontaktiere uns für mehr Infos",
      "impact": "Wie kontaktieren? Email? Anruf? Cognitive Load zu hoch → 50% Conversion-Drop.",
      "fix": "Definiere EINE spezifische Aktion: 'Buche jetzt deinen 15-Minuten Demo-Call: calendly.com/company/demo'",
      "scientificBasis": "Choice Paradox (Schwartz, 2004): Single CTA = 80% höhere Conversion.",
      "costEstimate": 17000
    }
  ],
  "strengths": [],
  "nextSteps": "Fokussiere sofort auf: (1) Problem quantifizieren, (2) Lösungsmechanismus erklären, (3) Social Proof hinzufügen. Diese 3 Fehler killen 90% der Pitches."
}
</analysis>
</example>

<example type="strong_pitch">
<pitch_text>Deutsche SaaS-Gründer verlieren durchschnittlich 70 unvorhersehbare Tage pro Deal durch inkonsistente Pitches - 40% niedrigere Erfolgsrate als US-Gründer, was €85K Opportunity Cost entspricht.

PitchPerfect nutzt KI + 9 wissenschaftliche Frameworks (Neuroscience, Behavioral Economics, Cognitive Psychology, etc.) für systematische Pitch-Optimierung in 4 Dimensionen: Klarheit, emotionale Wirkung, Glaubwürdigkeit, CTA-Stärke.

Bereits 247 Nutzer, darunter 3 Series-A Erfolge (€12M raised). 15 Jahre Pitch-Coaching-Erfahrung + forschungsbasierte Methodik.

Buche jetzt deine kostenlose 15-Minuten-Pitch-Analyse: pitchperfect.ai/demo</pitch_text>
<analysis>
{
  "overallScore": 82,
  "confidence": 0.92,
  "dimensions": {
    "clarity": {
      "score": 85,
      "confidence": 0.94,
      "reasoning": "Spezifisch: 'Deutsche SaaS-Gründer'. Mechanismus: '9 Frameworks + 4 Dimensionen'. Outcome klar."
    },
    "emotional": {
      "score": 78,
      "confidence": 0.90,
      "reasoning": "Starkes loss framing: '70 Tage verlieren', '40% schlechter', '€85K'. Vergleichsanker: US-Gründer."
    },
    "credibility": {
      "score": 80,
      "confidence": 0.91,
      "reasoning": "Multi-layered: 247 Nutzer (social proof), 3 Series-A (outcomes), 15 Jahre (authority), 9 Frameworks (expertise)."
    },
    "cta": {
      "score": 85,
      "confidence": 0.93,
      "reasoning": "Spezifisch: '15-Minuten', niedrige Hürde: 'kostenlos', direkter Link: pitchperfect.ai/demo"
    }
  },
  "fatalErrors": [],
  "strengths": [
    "Perfekte Quantifizierung: 70 Tage, 40%, €85K, 247, 3, €12M, 15 Jahre",
    "Loss framing aktiviert Amygdala (neuroscience research validated)",
    "Vergleichsanker ('US-Gründer') schafft Dringlichkeit + Kontext",
    "Multi-layered Credibility: Social Proof + Authority + Outcomes",
    "Mechanismus klar erklärt: '9 Frameworks + 4 Dimensionen'",
    "Zero-friction CTA: kostenlos, 15-Min, direkter Link"
  ],
  "minorImprovements": [
    "Könnte noch Urgency trigger hinzufügen: 'Nur 10 Demo-Slots diese Woche frei'",
    "Könnte Customer outcome quantifizieren: 'Durchschnittlich 40% höhere Erfolgsrate nach Workshop'"
  ],
  "nextSteps": "Pitch ist bereits sehr stark (82/100). Kleine Optimierungen möglich, aber bereit für Investor-Präsentation. Fokussiere auf Delivery (Tonfall, Pausen, Körpersprache) im Workshop."
}
</analysis>
</example>
</examples>`;

  // TASK PROMPT (dynamic - changes per user)
  const taskPrompt = `<task>
Analyze this pitch from a German ${businessStage}-stage founder.

<pitch_text>
${pitchText.trim()}
</pitch_text>

<pitch_context>
Purpose: ${pitchType}
Stage: ${businessStage}
Target Audience: ${targetAudience}
${diagnosticData?.problem ? `Problem Statement: "${diagnosticData.problem}"` : ''}
${diagnosticData?.solution ? `Solution Statement: "${diagnosticData.solution}"` : ''}
${diagnosticData?.cta_type ? `CTA Type: ${diagnosticData.cta_type}` : ''}
</pitch_context>

<analysis_instructions>
Follow these steps:

1. **Think step-by-step** (internal reasoning - not in JSON output):
   - Clarity: Is persona specific? Mechanism explained? Outcome quantified?
   - Emotional: Loss framing? Pain quantified? Urgency signals?
   - Credibility: Social proof? Authority? Specificity?
   - CTA: Single action? Low friction? Specific?

2. **Calculate dimension scores** (0-100):
   - Use examples above as reference points
   - Weak pitch example = 18/100 overall
   - Strong pitch example = 82/100 overall
   - Assign confidence per dimension (0-1)

3. **Identify fatal errors** (3-5 max):
   - Focus on INSTANT rejection triggers
   - Quote exact problematic text as "evidence"
   - Explain WHY fatal (investor psychology)
   - Provide SPECIFIC fix with example
   - Include scientific research basis
   - Estimate cost of each error in euros (costEstimate field)

4. **Calculate total cost** of all errors combined:
   - Sum up costEstimate from all fatal errors
   - This represents annual opportunity cost

5. **Output JSON** in exact format shown in examples

**CRITICAL: ALL text must be in German language.**
</analysis_instructions>

Return ONLY the JSON analysis (no markdown, no explanation):
</task>`;

  return {
    systemContext,
    examples,
    taskPrompt
  };
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function calculateCost(usage) {
  // Claude Sonnet 4 pricing (as of Nov 2024)
  const inputCostPer1M = 3.00;  // $3 per 1M input tokens
  const outputCostPer1M = 15.00; // $15 per 1M output tokens
  const cachedInputCostPer1M = 0.30; // $0.30 per 1M cached tokens (90% discount)

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cachedTokens = usage.cache_read_input_tokens || 0;

  const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;
  const cachedCost = (cachedTokens / 1_000_000) * cachedInputCostPer1M;

  return {
    total: inputCost + outputCost + cachedCost,
    breakdown: {
      input: inputCost,
      output: outputCost,
      cached: cachedCost
    }
  };
}

function calculateFinancialImpact(overallScore, diagnosticData) {
  // Calculate the €127K annual loss based on pitch score
  
  // Average German startup fundraising metrics (conservative estimates)
  const avgInvestorMeetingsPerYear = 12;
  const avgDealSize = 250000; // €250K average early-stage deal
  
  // Success rate based on pitch score
  // Score 0-30: ~10% success
  // Score 30-50: ~15-30% success
  // Score 50-70: ~35-50% success
  // Score 70-85: ~55-65% success
  // Score 85-100: ~70-80% success
  
  let currentSuccessRate;
  if (overallScore < 30) currentSuccessRate = 0.10;
  else if (overallScore < 50) currentSuccessRate = 0.15 + ((overallScore - 30) / 20) * 0.15;
  else if (overallScore < 70) currentSuccessRate = 0.30 + ((overallScore - 50) / 20) * 0.20;
  else if (overallScore < 85) currentSuccessRate = 0.50 + ((overallScore - 70) / 15) * 0.15;
  else currentSuccessRate = 0.65 + ((overallScore - 85) / 15) * 0.15;
  
  const optimalSuccessRate = 0.65; // Realistic optimal (not 100%)
  
  const currentDeals = avgInvestorMeetingsPerYear * currentSuccessRate;
  const optimalDeals = avgInvestorMeetingsPerYear * optimalSuccessRate;
  const lostDeals = optimalDeals - currentDeals;
  
  const annualLoss = Math.round(lostDeals * avgDealSize * currentSuccessRate);
  const weeklyLoss = Math.round(annualLoss / 52);
  
  return {
    annualLoss,
    weeklyLoss,
    currentSuccessRate: Math.round(currentSuccessRate * 100),
    optimalSuccessRate: Math.round(optimalSuccessRate * 100),
    lostDealsPerYear: Math.round(lostDeals * 10) / 10,
    avgDealSize
  };
}
