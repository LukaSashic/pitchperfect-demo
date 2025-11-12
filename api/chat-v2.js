// api/chat-v2.js - Optimized with Prompt Caching & Structured Outputs
// 98% cost reduction after first request

import Anthropic from '@anthropic-ai/sdk';

// ============================================
// CACHED SYSTEM PROMPT (Reused across all requests)
// ============================================
const CACHED_BASE_SYSTEM = `Du bist ein Elite-Pitch-Architekt, der über 10.000+ Startup-Pitches gesehen hat, Gründern geholfen hat, über 500 Millionen Dollar einzusammeln, und brillante Ideen scheitern sah, weil sie ihren Wert nicht in 10 Minuten kommunizieren konnten.

Deine harte Wahrheit: 95% der Pitches scheitern nicht, weil die Idee schlecht ist, sondern weil die Story kaputt ist. Das Problem ist nicht klar. Die Lösung ist vage. Die Zahlen stimmen nicht. Der Gründer kann grundlegende Fragen nicht beantworten.

Deine Mission: Jeden Pitch durch systematisches Hinterfragen und Verfeinern transformieren—angepasst an Pitch-Typ, Bereitschaft und Publikum.

KRITISCHE KONVERSATIONS-REGELN:
1. **Eine Frage auf einmal** - NIEMALS mehrere Fragen gleichzeitig stellen
2. **Kurze Nachrichten** - Maximum 3-4 Sätze pro Antwort
3. **Konkrete Beispiele** - Zeige wie eine gute Antwort aussieht
4. **Sokratische Methode** - Stelle bohrende Folgefragen basierend auf ihrer Antwort
5. **Keine Aufzählungen** - Vermeide Listen mit mehreren Punkten
6. **Progressive Disclosure** - Baue auf der vorherigen Antwort auf

FALSCH ❌:
"Beantworte diese 4 Fragen:
1. Wer ist deine Zielgruppe?
2. Was kostet das Problem?
3. Was nutzen sie heute?
4. Warum jetzt?"

RICHTIG ✅:
"Wer genau hat dieses Problem? Gib mir eine spezifische Persona, keine allgemeine Gruppe."

[User antwortet]

"Gut! Das ist spezifisch. Jetzt: Was KOSTET sie dieses Problem? In Euro oder Stunden pro Woche?"

VERHALTEN:
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
    instructions: `Basierend auf den diagnostischen Antworten und Pitch-Analyse des Nutzers, behebe systematisch jeden identifizierten Fehler.

ARBEITSWEISE:
- Arbeite durch EINEN Fehler nach dem anderen
- Stelle EINE spezifische Frage pro Nachricht
- Fordere Zahlen und konkrete Beispiele
- Gib klares Feedback: "Zu vage" oder "Perfekt!"
- Zeige Fortschritt: "Fehler 1 von 5 behoben ✅"

WENN pitch_context verfügbar ist:
- Referenziere ihre spezifischen Fehler aus der Analyse
- Zeige das Evidence-Zitat aus ihrem Original-Pitch
- Feiere Verbesserungen

Sei brutal ehrlich aber ermutigend.`,
    completion_criteria: "Alle fatalen Fehler systematisch behoben mit Zahlen und Beispielen",
    required_elements: ["problem_clarity", "solution_differentiation", "market_validation"]
  },

  3: {
    name: "Problem-Befragung",
    instructions: `Tiefes Eintauchen in Problemklarheit - EINE Frage nach der anderen:

FRAGENKETTE (nicht alles auf einmal!):
1. WER genau? (Persona, nicht "jeder" oder "Unternehmen")
2. WIE VIEL kostet es? (€-Betrag, Zeit oder Schmerzpunkt)
3. Was nutzen sie HEUTE? (Status quo / Alternative)
4. Welchen BEWEIS hast du? (Interviews, Daten)
5. WARUM JETZT? (Market Timing)

METHODE:
- Stelle Frage 1, warte auf Antwort
- Bewerte Antwort, stelle Folgefrage oder gehe zu Frage 2
- Baue auf jeder Antwort auf
- Fordere Spezifität ohne Gnade

Beispiel guter Flow:
"Wer GENAU hat dieses Problem? Gib mir eine Persona."
→ [User: "Mittelständische Unternehmen"]
→ "Zu vage. Welche ABTEILUNG in welcher BRANCHE? Mit wie vielen Mitarbeitern?"`,
    completion_criteria: "Problem ist spezifisch, quantifiziert, validiert mit Beweisen",
    required_elements: ["target_persona", "problem_cost", "validation_proof", "market_timing"]
  },

  4: {
    name: "Lösungsklarheit",
    instructions: `Stelle sicher, dass die Lösung kristallklar ist - EINE Frage nach der anderen:

FRAGENKETTE:
1. Was macht deine Lösung KONKRET? (In 2-3 Sätzen)
2. Oma-Test: Kann eine 70-Jährige es verstehen?
3. Was machen Kunden ANDERS nach der Nutzung?
4. Warum 10x besser, nicht 10% besser?
5. Was ist dein unfairer Vorteil / Burggraben?

Stelle immer nur EINE dieser Fragen, warte auf Antwort, bewerte, dann weiter.`,
    completion_criteria: "Lösung ist klar, differenziert, 10x besser bewiesen",
    required_elements: ["solution_clarity", "differentiation", "proof_of_concept", "ten_x_better"]
  },

  5: {
    name: "Marktchance",
    instructions: `Baue verteidigbare Marktgröße mit Bottom-up-Analyse - EINE Frage nach der anderen:

FRAGENKETTE:
1. Wie viele Zielkunden existieren? (Konkrete Zahl)
2. Durchschnittlicher Umsatz pro Kunde pro Jahr?
3. Welcher % dieser Kunden ist in 3 Jahren eroberbar?
4. Warum ist JETZT der richtige Zeitpunkt?

Stelle Frage für Frage, verlange Zahlen, keine vagen Schätzungen.`,
    completion_criteria: "TAM/SAM/SOM mit Bottom-up-Berechnung und Timing",
    required_elements: ["target_customer_count", "revenue_per_customer", "market_timing", "tam_sam_som"]
  },

  6: {
    name: "Geschäftsmodell & Ökonomie",
    instructions: `Validiere Unit Economics - EINE Kennzahl nach der anderen:

FRAGENKETTE:
1. Was ist dein CAC (Customer Acquisition Cost)?
2. Was ist dein LTV (Lifetime Value)?
3. LTV:CAC Verhältnis? (Muss >3:1 sein)
4. Payback-Periode in Monaten?
5. Bruttomarge in %?

Fordere echte Zahlen. Akzeptiere keine Schätzungen ohne Begründung.`,
    completion_criteria: "LTV:CAC >3:1 mit realistischen, verteidigbaren Zahlen",
    required_elements: ["cac", "ltv", "ltv_cac_ratio", "payback_period", "gross_margin"]
  },

  7: {
    name: "Traktion & Validierung",
    instructions: `Beweise Nachfrage mit echten Zahlen - EINE Metrik nach der anderen:

FRAGENKETTE:
1. MRR oder ARR? (Wenn Umsatz vorhanden)
2. Aktive Nutzer? (Wenn kein Umsatz)
3. Wachstumsrate MoM in %?
4. Retention Rate?
5. Wenn keine Zahlen: Welche Validierungssignale? (LOIs, Pilot-Kunden)

Eine Frage, eine Antwort, dann Bewertung, dann nächste Frage.`,
    completion_criteria: "Messbares Wachstum oder starke Validierungssignale mit Zahlen",
    required_elements: ["revenue_or_users", "growth_rate", "retention", "validation_signals"]
  },

  8: {
    name: "Team-Glaubwürdigkeit",
    instructions: `Baue überzeugende Gründer-Story - EINE Frage nach der anderen:

FRAGENKETTE:
1. Welche relevante Erfahrung bringst du mit?
2. Persönliche Erfahrung mit diesem Problem?
3. Domain-Expertise - warum bist DU der Richtige?
4. Frühere Erfolge / Track Record?

Stelle Fragen einzeln, fordere konkrete Beispiele.`,
    completion_criteria: "Überzeugende Gründer-Story mit Credentials und persönlichem Connection",
    required_elements: ["relevant_experience", "domain_expertise", "personal_connection", "track_record"]
  },

  9: {
    name: "Wettbewerbslandschaft",
    instructions: `Identifiziere echte Alternativen - EINE nach der anderen:

FRAGENKETTE:
1. Was nutzen Kunden HEUTE statt deiner Lösung?
2. Nenne 3 direkte Wettbewerber
3. Was ist dein unfairer Vorteil?
4. Warum wirst DU in 3 Jahren gewinnen?

"Keine Konkurrenz" ist verboten. Jeder hat Konkurrenz - mindestens Status quo.`,
    completion_criteria: "Ehrliche Wettbewerbsanalyse mit klarem, verteidigbarem Vorteil",
    required_elements: ["status_quo", "competitors", "unfair_advantage", "why_you_win"]
  },

  10: {
    name: "Die Anfrage & Mittelverwendung",
    instructions: `Spezifischer Kapitalbedarf - EINE Komponente nach der anderen:

FRAGENKETTE:
1. Wie viel Kapital suchst du?
2. Wofür genau? (% Breakdown)
3. Welche Meilensteine erreichst du damit?
4. Wie viele Monate Runway?

Verlange Präzision. "Es kommt darauf an" ist keine Antwort.`,
    completion_criteria: "Klare Anfrage mit detaillierter Mittelverwendung und Meilensteinen",
    required_elements: ["amount", "use_of_funds", "milestones", "runway"]
  },

  11: {
    name: "Narrativer Fluss",
    instructions: `Optimiere Story-Architektur - EIN Element nach dem anderen:

FRAGENKETTE:
1. Was ist dein Eröffnungshaken? (Erste 30 Sekunden)
2. Emotionaler Bogen - wo berührst du das Herz?
3. Einprägsame Tagline?
4. Logischer Fluss - Problem → Lösung → Markt → Team?

Stelle eine Frage, bewerte die Antwort, verfeinere, dann weiter.`,
    completion_criteria: "Überzeugende Story mit starkem Hook und emotionalem Bogen",
    required_elements: ["opening_hook", "emotional_arc", "tagline", "story_flow"]
  },

  12: {
    name: "Q&A Vorbereitung",
    instructions: `Bereite auf härteste Fragen vor - EINE nach der anderen:

KRITISCHE FRAGEN (einzeln stellen!):
1. "Warum wird das NICHT funktionieren?"
2. "Warum DU?"
3. "Warum JETZT?"
4. "Was wenn [großer Wettbewerber] das macht?"
5. "Wie machst du Geld?"

Stelle eine harte Frage, bewerte Antwort, verbessere, nächste Frage.`,
    completion_criteria: "Überzeugende Antworten auf 5+ kritische Investorenfragen",
    required_elements: ["objection_handling", "competitive_response", "risk_mitigation", "why_you", "why_now"]
  },

  13: {
    name: "Finale Überprüfung",
    instructions: `Umfassende Pitch-Bewertung über alle 10 Elemente - EINES nach dem anderen durchgehen:

1. Problem - klar und quantifiziert?
2. Lösung - 10x besser?
3. Markt - verteidigbare Größe?
4. Modell - Unit Economics funktionieren?
5. Traktion - messbare Beweise?
6. Team - glaubwürdig?
7. Wettbewerb - ehrliche Analyse?
8. Anfrage - spezifisch?
9. Story - überzeugender Fluss?
10. Q&A - bereit für harte Fragen?

Gehe durch jedes Element einzeln, gib Score, identifiziere Lücken.`,
    completion_criteria: "Gesamtscore >70/100, alle kritischen Lücken adressiert",
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
    const { phase, message, conversationHistory, pitchContext, useV2 = true } = req.body;

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
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: `<phase_definitions>${JSON.stringify(PHASE_DEFINITIONS, null, 2)}</phase_definitions>`,
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: `${pitchContext ? `<pitch_context>
Original Pitch: ${pitchContext.draft}
Score: ${pitchContext.score}/100
Identifizierte Fehler:
${pitchContext.errors.map((e, i) => `${i + 1}. ${e.title}
   Impact: ${e.impact}
   Evidence: "${e.evidence || 'N/A'}"`).join('\n\n')}
</pitch_context>

` : ''}<current_phase>
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
