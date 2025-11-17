// api/chat-v2.js - V2 with XML Structure & Turn Tracking
// Integrates: XML Parser, Turn Manager, One-Question-at-a-Time

import Anthropic from '@anthropic-ai/sdk';
import { parseCoachingResponse, extractPhaseStatus } from './utils/xml-parser.js';
import { getTurnManager } from './utils/turn-manager.js';

// ============================================
// CACHED SYSTEM PROMPT
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

**BEISPIEL RICHTIG ✅:**
"Wer genau hat dieses Problem? Gib mir eine spezifische Persona, keine allgemeine Gruppe."

[User antwortet: "Mittelständische Unternehmen"]

"Zu vage. Welche ABTEILUNG in welcher BRANCHE? Mit wie vielen Mitarbeitern?"

**WICHTIG:**
- Kurze Nachrichten (3-4 Sätze maximum)
- EINE Frage pro Antwort
- Konkrete Beispiele zeigen
- Sei direkt: "Das ist zu allgemein. Sei konkret."

**XML STRUKTUR PFLICHT:**
Jede Antwort MUSS diese Struktur haben:

<thinking>
[Deine interne Überlegung]
</thinking>

<analysis>
[Bewertung der Nutzerantwort]
</analysis>

<response>
[NUR DIESER TEIL wird dem Nutzer gezeigt]
</response>`;

// Phase Definitions
const PHASE_DEFINITIONS = {
  2: {
    name: "Fatale Fehler Diagnose",
    instructions: `Arbeite durch EINEN Fehler nach dem anderen.`,
    completion_criteria: "Alle fatalen Fehler behoben",
    required_elements: ["problem_clarity", "solution_differentiation"]
  },
  3: {
    name: "Problem-Befragung",
    instructions: `EINE Frage nach der anderen: WER, WIE VIEL, WAS HEUTE, BEWEIS, WARUM JETZT`,
    completion_criteria: "Problem spezifisch, quantifiziert, validiert",
    required_elements: ["target_persona", "problem_cost", "validation_proof"]
  }
};

// ============================================
// HELPER: Build Phase Context Safely
// ============================================
function buildPhaseContext(phase, phaseConfig, pitchContext, currentTurn) {
  let context = '';

  // Add pitch context if available (Phase 2 only)
  if (pitchContext && phase === 2) {
    context += `<pitch_context>
Original Pitch: ${pitchContext.draft || 'N/A'}
Score: ${pitchContext.score || 0}/100
Identifizierte Fehler:
${(pitchContext.errors || []).map((e, i) => `${i + 1}. ${e.title || 'Unbekannt'}
   Impact: ${e.impact || 'N/A'}
   Evidence: "${e.evidence || 'N/A'}"`).join('\n\n')}
</pitch_context>

`;
  }

  // Add current phase info
  context += `<current_phase>
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
</phase_status>`;

  return context;
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
        text: buildPhaseContext(phase, phaseConfig, pitchContext, currentTurn)
      }
    ];

    // Build messages
    const messages = conversationHistory.slice();
    messages.push({
      role: 'user',
      content: message
    });

    // Add response prefill
    messages.push({
      role: 'assistant',
      content: '<thinking>'
    });

    console.log(`🤖 Calling Claude API for Phase ${phase}, Turn ${currentTurn?.turn || '?'}...`);

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages
    });

    let aiResponse = response.content.find(block => block.type === 'text')?.text || '';
    aiResponse = '<thinking>' + aiResponse;

    console.log('✅ Claude response received');

    // Parse XML structure
    const parsed = parseCoachingResponse(aiResponse);

    if (!parsed.hasXmlStructure) {
      console.warn('⚠️ Response missing XML structure');
    }

    // Extract phase status
    const phaseStatus = extractPhaseStatus(aiResponse);

    // Record turn
    if (turnManager) {
      try {
        await turnManager.recordTurn(message, parsed.response || aiResponse, {
          thinking: parsed.thinking,
          analysis: parsed.analysis
        });
        console.log('✅ Turn recorded to database');
      } catch (error) {
        console.error('Error recording turn:', error);
      }
    }

    // Calculate metrics
    const latency = Date.now() - startTime;

    // Return response
    return res.status(200).json({
      content: parsed.response || aiResponse.replace(/<[^>]+>/g, '').trim(),
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
    console.error('❌ API Error:', error);

    return res.status(500).json({
      error: 'KI-Antwort fehlgeschlagen',
      message: error.message
    });
  }
}

// ============================================
// HELPER: Calculate Cost
// ============================================
function calculateCost(usage) {
  const inputCost = (usage.input_tokens / 1000000) * 3;
  const outputCost = (usage.output_tokens / 1000000) * 15;
  const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1000000) * 3.75;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1000000) * 0.30;

  return (inputCost + outputCost + cacheWriteCost + cacheReadCost).toFixed(6);
}