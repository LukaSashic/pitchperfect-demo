// utils/turn-manager.js
// Manages conversation turns and phase context

import { createClient } from '@supabase/supabase-js';

// ✅ FIX: Use server-side environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key for server

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    console.log('✅ Supabase initialized in TurnManager');
} else {
    console.error('❌ Supabase credentials missing:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey
    });
}

/**
 * Turn Manager - Tracks conversation turns and context
 */
export class TurnManager {
    constructor(userId, projectId, phase, errorCode = null) {
        this.userId = userId;
        this.projectId = projectId;
        this.phase = phase;
        this.errorCode = errorCode;
        this.currentTurn = 1;
        this.loaded = false;
    }

    /**
     * Load current turn state from database
     */
    async loadState() {
        if (!supabase) {
            console.warn('Supabase not initialized - using localStorage fallback');
            return this.loadStateFromLocalStorage();
        }

        try {
            const { data, error } = await supabase
                .from('conversation_turns')
                .select('turn_number')
                .eq('user_id', this.userId)
                .eq('phase_number', this.phase)
                .order('turn_number', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                this.currentTurn = data[0].turn_number + 1;
            }

            this.loaded = true;
            console.log(`📊 Turn Manager loaded: Phase ${this.phase}, Turn ${this.currentTurn}`);

        } catch (error) {
            console.error('Error loading turn state:', error);
            // Fallback to localStorage
            this.loadStateFromLocalStorage();
        }
    }

    /**
     * Fallback: Load state from localStorage
     */
    loadStateFromLocalStorage() {
        const key = `turn_state_${this.userId}_${this.phase}`;
        const saved = localStorage.getItem(key);

        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.currentTurn = state.currentTurn || 1;
            } catch (e) {
                console.error('Error parsing localStorage turn state:', e);
            }
        }

        this.loaded = true;
    }

    /**
     * Get current coaching turn info
     */
    async getCoachingTurn() {
        if (!this.loaded) {
            await this.loadState();
        }

        return {
            phase: this.phase,
            turn: this.currentTurn,
            errorCode: this.errorCode
        };
    }

    /**
     * Record a conversation turn
     */
    async recordTurn(userMessage, aiResponse, xmlStructure = {}) {
        if (!supabase) {
            console.warn('Supabase not initialized - using localStorage fallback');
            return this.recordTurnToLocalStorage(userMessage, aiResponse);
        }

        try {
            const { data, error } = await supabase
                .from('conversation_turns')
                .insert({
                    user_id: this.userId,
                    project_id: this.projectId,
                    phase_number: this.phase,
                    turn_number: this.currentTurn,
                    error_code: this.errorCode,
                    user_message: userMessage,
                    ai_response: aiResponse,
                    ai_thinking: xmlStructure.thinking || null,
                    ai_analysis: xmlStructure.analysis || null,
                    success_criteria_met: {}
                })
                .select();

            if (error) throw error;

            console.log(`✅ Turn ${this.currentTurn} recorded for Phase ${this.phase}`);

            this.currentTurn++;
            this.saveStateToLocalStorage();

            return data;

        } catch (error) {
            console.error('Error recording turn:', error);
            // Fallback to localStorage
            this.recordTurnToLocalStorage(userMessage, aiResponse);
        }
    }

    /**
     * Fallback: Record turn to localStorage
     */
    recordTurnToLocalStorage(userMessage, aiResponse) {
        const key = `turns_${this.userId}_${this.phase}`;
        const turns = JSON.parse(localStorage.getItem(key) || '[]');

        turns.push({
            turn: this.currentTurn,
            userMessage,
            aiResponse,
            timestamp: new Date().toISOString()
        });

        localStorage.setItem(key, JSON.stringify(turns));

        this.currentTurn++;
        this.saveStateToLocalStorage();
    }

    /**
     * Save current state to localStorage
     */
    saveStateToLocalStorage() {
        const key = `turn_state_${this.userId}_${this.phase}`;
        localStorage.setItem(key, JSON.stringify({
            currentTurn: this.currentTurn,
            phase: this.phase
        }));
    }

    /**
     * Get conversation history for this phase
     */
    async getConversationHistory() {
        if (!supabase) {
            return this.getConversationHistoryFromLocalStorage();
        }

        try {
            const { data, error } = await supabase
                .from('conversation_turns')
                .select('*')
                .eq('user_id', this.userId)
                .eq('phase_number', this.phase)
                .order('turn_number', { ascending: true });

            if (error) throw error;

            return data.map(turn => ({
                role: 'user',
                content: turn.user_message
            })).concat(data.map(turn => ({
                role: 'assistant',
                content: turn.ai_response
            })));

        } catch (error) {
            console.error('Error loading conversation history:', error);
            return this.getConversationHistoryFromLocalStorage();
        }
    }

    /**
     * Fallback: Get history from localStorage
     */
    getConversationHistoryFromLocalStorage() {
        const key = `turns_${this.userId}_${this.phase}`;
        const turns = JSON.parse(localStorage.getItem(key) || '[]');

        return turns.flatMap(turn => [
            { role: 'user', content: turn.userMessage },
            { role: 'assistant', content: turn.aiResponse }
        ]);
    }

    /**
     * Reset phase (restart from beginning)
     */
    async resetPhase() {
        if (!supabase) {
            return this.resetPhaseInLocalStorage();
        }

        try {
            const { error } = await supabase
                .from('conversation_turns')
                .delete()
                .eq('user_id', this.userId)
                .eq('phase_number', this.phase);

            if (error) throw error;

            console.log(`🔄 Phase ${this.phase} reset`);

            this.currentTurn = 1;
            this.saveStateToLocalStorage();

        } catch (error) {
            console.error('Error resetting phase:', error);
            this.resetPhaseInLocalStorage();
        }
    }

    /**
     * Fallback: Reset phase in localStorage
     */
    resetPhaseInLocalStorage() {
        const turnsKey = `turns_${this.userId}_${this.phase}`;
        const stateKey = `turn_state_${this.userId}_${this.phase}`;

        localStorage.removeItem(turnsKey);
        localStorage.removeItem(stateKey);

        this.currentTurn = 1;
        console.log(`🔄 Phase ${this.phase} reset (localStorage)`);
    }
}

/**
 * Helper: Get or create TurnManager instance
 */
export async function getTurnManager(userId, projectId, phase, errorCode = null) {
    const manager = new TurnManager(userId, projectId, phase, errorCode);
    await manager.loadState();
    return manager;
}