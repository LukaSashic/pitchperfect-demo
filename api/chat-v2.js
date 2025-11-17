// api/chat-v2.js - V2 with XML Structure & Turn Tracking
// Integrates: XML Parser, Turn Manager, One-Question-at-a-Time

import Anthropic from '@anthropic-ai/sdk';
import { parseCoachingResponse, extractPhaseStatus } from '../utils/xml-parser.js';
import { getTurnManager } from '../utils/turn-manager.js';

// ============================================
// CACHED SYSTEM PROMPT (Reused across requests)
// ============================================
const CACHED_BASE_SYSTEM = `Du bist ein Elite-Pitch-Architekt, der über 10.000+ Startup-Pitches gesehen hat, Gründern geholfen hat, über 500 Millionen Dollar einzusammeln, und brillante Ideen scheitern sah, weil sie ihren Wert nicht in 10 Minuten kommunizieren konnten.

**KRITISCHE KONVERSATIONS-REGEL:**
**Du stellst IMMER NUR EINE FRAGE pro Antwort. NIEMALS mehrere Fragen gleichzeitig.**

**RICHTIGE METHODE ✅:**
1. Stelle EINE spezifische Frage
2. Warte auf Antwort des Nutzers
3. Bewerte die Antwort
4. Stelle EINE Folgefrage basierend auf ihrer Antwort
5. Wiederhole

**FALSCHE METHODE ❌:**
"Beantworte diese 4 Fragen:
1. Wer ist deine Zielgruppe?
2. Was kostet das Problem?
3. Was nutzen sie heute?
4. Warum jetzt?"

**BEISPIEL RICHTIG ✅:**
"Wer genau hat dieses Problem? Gib mir eine spezifische Persona, keine allgemeine Gruppe."

[User antwortet: "Mittelständische Unternehmen"]

"Zu vage. Welche ABTEILUNG in welcher BRANCHE? Mit wie vielen Mitarbeitern?"

**WICHTIG:**
- Kurze Nachrichten (3-4 Sätze maximum)
- EINE Frage pro Antwort
- Konkrete Beispiele zeigen
- Baue auf vorheriger Antwort auf
- Sei direkt: "Das ist zu allgemein. Sei konkret."
- Fordere Zahlen: "Gib mir die tatsächliche Zahl"

**XML STRUKTUR PFLICHT:**
Jede Antwort MUSS diese Struktur haben:

<thinking>
[Deine interne Überlegung - was ist der nächste beste Schritt?]
</thinking>

<analysis>
[Bewertung der Nutzerantwort - Stärken/Schwächen]
</analysis>

<question>
[Die EINE Frage, die du stellen wirst]
</question>

<progress_note>
[Fortschritt zu Erfolgskriterien]
</progress_note>

<response>
[NUR DIESER TEIL wird dem Nutzer gezeigt]
[Enthält deine EINE Frage und kurzes Feedback]
</response>`;

// Phase Definitions (cached)
const PHASE_DEFINITIONS = {
  2: {
    name: "Fatale Fehler Diagnose",
    instructions: `Arbeite durch EINEN Fehler nach dem anderen aus der Diagnose.

**ARBEITSWEISE:**
1. Identifiziere den schwerwiegendsten Fehler
2. Zeige das Evidence-Zitat aus ihrem Pitch
3. Stelle EINE spezifische Frage zur Verbesserung
4. Warte auf Antwort
5. Bewerte, ob behoben → Wenn ja, nächster Fehler

**EINE FRAGE REGEL:**
Stelle nie mehr als EINE Frage. Baue auf jeder Antwort auf.

Beispiel:
"Dein Pitch sagt: '${pitchContext?.errors?.[0]?.evidence}'
Das ist zu vage. Was ist der EXAKTE Schmerzpunkt in Euro oder Stunden?"

[Warte auf Antwort, dann nächste Frage]`,
    completion_criteria: "Alle fatalen Fehler behoben mit Zahlen und Beweisen",
    required_elements: ["problem_clarity", "solution_differentiation", "market_validation"]
  },

  3: {
    name: "Problem-Befragung",
    instructions: `Tiefes Eintauchen in Problemklarheit - EINE Frage nach der anderen:

**FRAGENKETTE (nicht alles auf einmal!):**
1. WER genau? (Persona, nicht "jeder")
2. WIE VIEL kostet es? (€-Betrag, Zeit)
3. Was nutzen sie HEUTE? (Status quo)
4. Welchen BEWEIS hast du? (Interviews, Daten)
5. WARUM JETZT? (Market Timing)

**METHODE:**
- Stelle Frage 1, warte auf Antwort
- Bewerte, stelle Folgefrage oder gehe zu Frage 2
- Baue auf jeder Antwort auf
- Fordere Spezifität

Stelle immer nur EINE Frage, warte, bewerte, dann weiter.`,
    completion_criteria: "Problem spezifisch, quantifiziert, validiert",
    required_elements: ["target_persona", "problem_cost", "validation_proof", "market_timing"]
  },

  4: {
    name: "Lösungsklarheit",
    instructions: `Stelle sicher, dass die Lösung kristallklar ist - EINE Frage nach der anderen:

**FRAGENKETTE:**
1. Was macht deine Lösung KONKRET? (In 2-3 Sätzen)
2. Oma-Test: Kann eine 70-Jährige es verstehen?
3. Was machen Kunden ANDERS nach der Nutzung?
4. Warum 10x besser, nicht 10% besser?

Stelle nur EINE dieser Fragen, warte auf Antwort, bewerte, dann weiter.`,
    completion_criteria: "Lösung klar, differenziert, 10x besser bewiesen",
    required_elements: ["solution_clarity", "differentiation", "proof_of_concept"]
  }
};

// ============================================
// MAIN HANDLER
// ============================================
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  const startTime = Date.now();

  try {
    const {
      phase,
      message,
      conversationHistory = [],
      pitchContext,
      userId,
      projectId
    } = req.body;

    // Validation
    if (!phase || !message) {
      return res.status(400).json({ error: 'Fehlende erforderliche Felder: phase, message' });
    }

    if (!userId) {
      console.warn('⚠️ No userId provided - turn tracking disabled');
    }

    // Initialize Turn Manager (if userId available)
    let turnManager = null;
    let currentTurn = null;

    if (userId && projectId) {
      try {
        turnManager = await getTurnManager(userId, projectId, phase);
        currentTurn = await turnManager.getCoachingTurn();
        console.log(`📊 Turn ${currentTurn.turn} for Phase ${phase}`);
      } catch (error) {
        console.error('Turn manager initialization failed:', error);
        // Continue without turn tracking
      }
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const phaseConfig = PHASE_DEFINITIONS[phase] || {
      name: `Phase ${phase}`,
      instructions: "Führe systematische Befragung durch - EINE Frage nach der anderen.",
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
  <turn>${currentTurn?.turn || 'unknown'}</turn>
  <instructions>${phaseConfig.instructions}</instructions>
  <completion_criteria>${phaseConfig.completion_criteria}</completion_criteria>
  <required_elements>${phaseConfig.required_elements.join(', ')}</required_elements>
</current_phase>

**ERINNERUNG:** Stelle NUR EINE Frage pro Antwort. Nutze die XML-Struktur.

Am Ende deiner Antwort, wenn du glaubst, dass die Phase abgeschlossen ist, füge hinzu:
<phase_status>
  <complete>true/false</complete>
  <completion_score>0-100</completion_score>
  <missing_elements>Liste fehlender Elemente</missing_elements>
</phase_status>`
      }
    ];

    // Build messages
    const messages = conversationHistory.slice(); // Copy array
    messages.push({
      role: 'user',
      content: message
    });

    // Add response prefill to enforce XML structure
    messages.push({
      role: 'assistant',
      content: '<thinking>'
    });

    console.log(`🤖 Calling Claude API for Phase ${phase}...`);

    // Call Claude with caching
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages
    });

    let aiResponse = response.content.find(block => block.type === 'text')?.text || '';

    // Prepend the prefill
    aiResponse = '<thinking>' + aiResponse;

    console.log('✅ Claude response received');

    // Parse XML structure
    const parsed = parseCoachingResponse(aiResponse);

    if (!parsed.hasXmlStructure) {
      console.warn('⚠️ Response missing XML structure - falling back to full text');
    }

    // Extract phase status
    const phaseStatus = extractPhaseStatus(aiResponse);

    // Record turn in database
    if (turnManager) {
      try {
        await turnManager.recordTurn(message, parsed.response || aiResponse, {
          thinking: parsed.thinking,
          analysis: parsed.analysis
        });
        console.log('✅ Turn recorded to database');
      } catch (error) {
        console.error('Error recording turn:', error);
        // Continue anyway - turn tracking is non-critical
      }
    }

    // Calculate metrics
    const latency = Date.now() - startTime;

    // Return response
    return res.status(200).json({
      content: parsed.response || aiResponse.replace(/<[^>]+>/g, '').trim(), // Strip XML if parser failed
      phaseComplete: phaseStatus.complete,
      completionScore: phaseStatus.completion_score,
      missingElements: phaseStatus.missing_elements,
      metadata: {
        phase: phase,
        phaseName: phaseConfig.name,
        turn: currentTurn?.turn || null,
        version: 'v2-xml',
        xmlParsed: parsed.hasXmlStructure
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
    console.error('❌ API v2 Error:', error);

    return res.status(500).json({
      error: 'KI-Antwort fehlgeschlagen',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// ============================================
// HELPER: Calculate API cost
// ============================================
function calculateCost(usage) {
  const inputCost = (usage.input_tokens / 1000000) * 3;
  const outputCost = (usage.output_tokens / 1000000) * 15;
  const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1000000) * 3.75;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1000000) * 0.30;

  return (inputCost + outputCost + cacheWriteCost + cacheReadCost).toFixed(6);
}