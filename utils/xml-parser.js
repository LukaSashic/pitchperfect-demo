// utils/xml-parser.js
// Extracts structured XML tags from Claude responses

/**
 * Parse Claude response with XML structure
 * @param {string} rawResponse - Raw response from Claude API
 * @returns {Object} Parsed components
 */
export function parseCoachingResponse(rawResponse) {
    if (!rawResponse) {
        return {
            thinking: null,
            analysis: null,
            question: null,
            progressNote: null,
            response: rawResponse,
            hasXmlStructure: false
        };
    }

    const thinking = extractTag(rawResponse, 'thinking');
    const analysis = extractTag(rawResponse, 'analysis');
    const question = extractTag(rawResponse, 'question');
    const progressNote = extractTag(rawResponse, 'progress_note');
    const response = extractTag(rawResponse, 'response');

    return {
        thinking,      // For logging/debugging
        analysis,      // For system improvement
        question,      // For internal tracking
        progressNote,  // For criteria monitoring
        response: response || rawResponse, // Fallback to full response if no <response> tag
        hasXmlStructure: !!response
    };
}

/**
 * Extract content from XML tag
 * @param {string} text - Text containing XML tags
 * @param {string} tagName - Name of tag to extract
 * @returns {string|null} Extracted content or null
 */
function extractTag(text, tagName) {
    const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
}

/**
 * Validate XML structure is present
 * @param {string} response - Response to validate
 * @returns {Object} Validation result
 */
export function validateXmlStructure(response) {
    const required = ['thinking', 'analysis', 'response'];
    const parsed = parseCoachingResponse(response);

    const missing = required.filter(tag => !parsed[tag]);

    return {
        valid: missing.length === 0,
        missing,
        parsed
    };
}

/**
 * Extract phase completion status from response
 * @param {string} text - Response text
 * @returns {Object} Phase status
 */
export function extractPhaseStatus(text) {
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
    const elements = elementsMatch ?
        elementsMatch[1].split(',').map(e => e.trim()).filter(Boolean) :
        [];

    return {
        complete,
        completion_score: score,
        missing_elements: elements
    };
}