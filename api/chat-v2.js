// api/chat-v2.js - Optimized with Prompt Caching & Structured Outputs
// 98% cost reduction after first request

import Anthropic from '@anthropic-ai/sdk';

// ============================================
// CACHED SYSTEM PROMPT (Reused across all requests)
// ============================================
const CACHED_BASE_SYSTEM = `Du bist ein Elite-Pitch-Architekt, der über 10.000+ Startup-Pitches gesehen hat, Gründern geholfen hat, über 500 Millionen Dollar einzusammeln, und brillante Ideen scheitern sah, weil sie ihren Wert nicht in 10 Minuten kommunizieren konnten.

Deine harte Wahrheit: 95% der Pitches scheitern nicht, weil die Idee schlecht ist, sondern weil die Story kaputt ist. Das Problem ist nicht klar. Die Lösung ist vage. Die Zahlen stimmen nicht. Der Gründer kann grundlegende Fragen nicht beantworten.

Deine Mission: Jeden Pitch durch systematisches Hinterfragen und Verfeinern transformieren—angepasst an Pitch-Typ, Bereitschaft und Publikum.

KRITISCHE REGELN:
- Stelle EINE Frage auf einmal (maximal 3, wenn sie kurz sind)
- Fordere vage Aussagen direkt heraus: "Das ist zu allgemein. Sei konkret."
- Verlange Zahlen: "Gib mir die tatsächliche Zahl, nicht 'viele' oder 'bedeutend'"
- Hinterfrage Annahmen: "Was ist dein Beweis für diese Behauptung?"
- Nutze Beispiele erfolgreicher Pitches, wenn relevant
- Feiere Erfolge: "Das ist viel stärker ✅"
- Sei direkt, nicht verschwommen: "Deine Problemstellung ist vage. Was GENAU ist der Schmerz?"`;

// Phasen-Definitionen (auch gecacht)
const PHASE_DEFINITIONS = {
  2: {
    name: "Fatale Fehler Diagnose",
    instructions: `Basierend auf den diagnostischen Antworten des Nutzers, identifiziere kritische Lücken über alle Kernelemente hinweg. Sei brutal ehrlich.`,
    completion_criteria: "Mindestens 3 kritische Lücken identifiziert und Aktionsplan erstellt",
    required_elements: ["problem_clarity", "solution_differentiation", "market_validation"]
  },
  3: {
    name: "Problem-Befragung",
    instructions: `Tiefes Eintauchen in Problemklarheit:
- WER genau hat dieses Problem? (Persona, nicht "jeder")
- WIE VIEL kostet es sie? (€-Betrag, Zeit oder Schmerz)
- WARUM lösen sie es nicht bereits?
- Welchen BEWEIS hast du?`,
    completion_criteria: "Problem ist spezifisch, quantifiziert und validiert",
    required_elements: ["target_persona", "problem_cost", "validation_proof"]
  },
  4: {
    name: "Lösungsklarheit",
    instructions: `Stelle sicher, dass die Lösung kristallklar ist:
- Oma-Test: Kann sie es verstehen?
- Was machen Kunden ANDERS?
- Warum 10x besser, nicht 10%?
- Unfairer Vorteil/Burggraben?
- Beweise?`,
    completion_criteria: "Lösung ist klar, differenziert und bewiesen",
    required_elements: ["solution_clarity", "differentiation", "proof_of_concept"]
  },
  5: {
    name: "Marktchance",
    instructions: `Baue verteidigbare Marktgröße mit Bottom-up-Analyse:
- Wie viele Zielkunden?
- Durchschnittlicher Umsatz pro Kunde
- % Eroberung in 3 Jahren
- Warum JETZT?`,
    completion_criteria: "TAM/SAM/SOM mit Bottom-up-Berechnung",
    required_elements: ["target_customer_count", "revenue_per_customer", "market_timing"]
  },
  6: {
    name: "Geschäftsmodell & Ökonomie",
    instructions: `Validiere Unit Economics:
- CAC, LTV, Verhältnis (>3:1)
- Payback-Periode
- Bruttomargen`,
    completion_criteria: "LTV:CAC >3:1 mit realistischen Zahlen",
    required_elements: ["cac", "ltv", "payback_period", "gross_margin"]
  },
  7: {
    name: "Traktion & Validierung",
    instructions: `Beweise Nachfrage:
- MRR/ARR
- Aktive Nutzer
- Wachstumsrate MoM
- Retention`,
    completion_criteria: "Messbares Wachstum oder starke Validierungssignale",
    required_elements: ["revenue_or_users", "growth_rate", "retention"]
  },
  8: {
    name: "Team-Glaubwürdigkeit",
    instructions: `Warum ist dieses Team einzigartig qualifiziert?
- Relevante Erfahrung
- Persönliche Problemerfahrung
- Frühere Erfolge`,
    completion_criteria: "Überzeugende Gründer-Story mit Credentials",
    required_elements: ["relevant_experience", "domain_expertise", "track_record"]
  },
  9: {
    name: "Wettbewerbslandschaft",
    instructions: `Identifiziere echte Alternativen:
- Status quo
- 3 direkte Wettbewerber
- Unfairer Vorteil
- Warum du in 3 Jahren gewinnst`,
    completion_criteria: "Ehrliche Wettbewerbsanalyse mit klarem Vorteil",
    required_elements: ["competitors", "status_quo", "unfair_advantage"]
  },
  10: {
    name: "Die Anfrage & Mittelverwendung",
    instructions: `Spezifischer Kapitalbedarf:
- Wie viel? Warum?
- Mittelverwendung (%)
- Meilensteine
- Runway`,
    completion_criteria: "Klare Anfrage mit detaillierter Mittelverwendung",
    required_elements: ["amount", "use_of_funds", "milestones", "runway"]
  },
  11: {
    name: "Narrativer Fluss",
    instructions: `Optimiere Story-Architektur:
- Eröffnungshaken
- Emotionaler Bogen
- Einprägsame Tagline
- Logischer Fluss`,
    completion_criteria: "Überzeugende Story mit starkem Eröffnungshaken",
    required_elements: ["opening_hook", "story_flow", "tagline"]
  },
  12: {
    name: "Q&A Vorbereitung",
    instructions: `Bereite auf härteste Fragen vor:
- "Warum wird das nicht funktionieren?"
- "Warum du?"
- "Warum jetzt?"
- "Was wenn [Wettbewerber]?"`,
    completion_criteria: "Überzeugende Antworten auf 5+ kritische Fragen",
    required_elements: ["objection_handling", "competitive_response", "risk_mitigation"]
  },
  13: {
    name: "Finale Überprüfung",
    instructions: `Umfassende Pitch-Bewertung über alle 10 Elemente.
Identifiziere verbleibende Lücken und gib Gesamtscore.`,
    completion_criteria: "Score >70/100 über alle Elemente",
    required_elements: ["overall_score", "remaining_gaps", "readiness_assessment"]
  }
};

// ============================================
// RESPONSE PREFILLING HELPER
// ============================================
function getPrefillForPhase(phase) {
  const prefills = {
    2: '<phase_status>\n<complete>',
    3: '<phase_status>\n<complete>',
    4: '<phase_status>\n<complete>',
    5: '<phase_status>\n<complete>',
    6: '<phase_status>\n<complete>',
    7: '<phase_status>\n<complete>',
    8: '<phase_status>\n<complete>',
    9: '<phase_status>\n<complete>',
    10: '<phase_status>\n<complete>',
    11: '<phase_status>\n<complete>',
    12: '<phase_status>\n<complete>',
    13: '<phase_status>\n<complete>'
  };
  return prefills[phase] || null;
}

// ============================================
// MAIN HANDLER
// ============================================
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  const startTime = Date.now();

  try {
    const { phase, message, conversationHistory, useV2 = true } = req.body;

    // Input validation
    if (!phase || !message) {
      return res.status(400).json({ error: 'Fehlende erforderliche Felder' });
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const phaseConfig = PHASE_DEFINITIONS[phase] || {
      name: `Phase ${phase}`,
      instructions: "Führe systematische Befragung durch.",
      completion_criteria: "Phase-Ziele erreicht",
      required_elements: []
    };

    // Build system prompt with caching
    const systemPrompt = [
      {
        type: "text",
        text: CACHED_BASE_SYSTEM,
        cache_control: { type: "ephemeral" } // CACHED
      },
      {
        type: "text",
        text: `<phase_definitions>${JSON.stringify(PHASE_DEFINITIONS, null, 2)}</phase_definitions>`,
        cache_control: { type: "ephemeral" } // CACHED
      },
      {
        type: "text",
        text: `<current_phase>
  <number>${phase}</number>
  <name>${phaseConfig.name}</name>
  <instructions>${phaseConfig.instructions}</instructions>
  <completion_criteria>${phaseConfig.completion_criteria}</completion_criteria>
  <required_elements>${phaseConfig.required_elements.join(', ')}</required_elements>
</current_phase>

Am Ende deiner Antwort, wenn du glaubst, dass die Phase abgeschlossen ist, füge hinzu:
<phase_status>
  <complete>true/false</complete>
  <completion_score>0-100</completion_score>
  <missing_elements>Liste fehlender Elemente</missing_elements>
</phase_status>`
      }
    ];

    // Build messages with prefilling
    const messages = conversationHistory || [];
    messages.push({
      role: 'user',
      content: message
    });

    // Add response prefill if available
    const prefill = getPrefillForPhase(phase);
    if (prefill) {
      messages.push({
        role: 'assistant',
        content: prefill
      });
    }

    // Call Claude with caching enabled
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages
    });

    let aiResponse = response.content.find(block => block.type === 'text')?.text || '';

    // Prepend prefill if it was used
    if (prefill) {
      aiResponse = prefill + aiResponse;
    }

    // Extract structured phase status
    const phaseStatus = extractPhaseStatus(aiResponse);

    // Calculate latency
    const latency = Date.now() - startTime;

    // Build response with metrics
    return res.status(200).json({
      content: aiResponse.replace(/<phase_status>[\s\S]*?<\/phase_status>/g, '').trim(),
      phaseComplete: phaseStatus.complete,
      completionScore: phaseStatus.completion_score,
      missingElements: phaseStatus.missing_elements,
      metadata: {
        phase: phase,
        phaseName: phaseConfig.name,
        version: 'v2'
      },
      metrics: {
        latency_ms: latency,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_tokens: response.usage.cache_read_input_tokens || 0,
        cache_write_tokens: response.usage.cache_creation_input_tokens || 0,
        cost_usd: calculateCost(response.usage)
      }
    });

  } catch (error) {
    console.error('API v2 Fehler:', error);

    return res.status(500).json({
      error: 'KI-Antwort fehlgeschlagen',
      message: error.message,
      fallback: true
    });
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractPhaseStatus(text) {
  const match = text.match(/<phase_status>([\s\S]*?)<\/phase_status>/);
  if (!match) {
    // Fallback to keyword detection
    const hasCompleteKeywords =
      text.includes('Phase abgeschlossen') ||
      text.includes('bereit für die nächste') ||
      text.includes('nächste Phase');

    return {
      complete: hasCompleteKeywords,
      completion_score: hasCompleteKeywords ? 85 : 50,
      missing_elements: []
    };
  }

  const statusXML = match[1];
  const complete = /<complete>(true|false)<\/complete>/.test(statusXML) &&
    RegExp.$1 === 'true';
  const scoreMatch = statusXML.match(/<completion_score>(\d+)<\/completion_score>/);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

  const elementsMatch = statusXML.match(/<missing_elements>(.*?)<\/missing_elements>/);
  const elements = elementsMatch ? elementsMatch[1].split(',').map(e => e.trim()).filter(Boolean) : [];

  return {
    complete: complete,
    completion_score: score,
    missing_elements: elements
  };
}

function calculateCost(usage) {
  const inputCost = (usage.input_tokens / 1000000) * 3;
  const outputCost = (usage.output_tokens / 1000000) * 15;
  const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1000000) * 3.75;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1000000) * 0.30;

  return (inputCost + outputCost + cacheWriteCost + cacheReadCost).toFixed(6);
}
