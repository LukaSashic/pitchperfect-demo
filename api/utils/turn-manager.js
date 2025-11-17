// utils/turn-manager.js
// Manages conversation turns and phase context

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        if (!supabase) {
            throw new Error('Supabase not initialized - check environment variables');
        }

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
        try {
            const { data, error } = await supabase
                .from('conversation_turns')
                .select('turn_number')
                .eq('user_id', this.userId)
                .eq('phase_number', this.phase)
                .order('turn_number', { ascending: false })
                .limit(1);

            if (error) {
                console.error('Error loading turn state:', error);
                throw error;
            }

            if (data && data.length > 0) {
                this.currentTurn = data[0].turn_number + 1;
            }

            this.loaded = true;
            console.log(`📊 Turn Manager loaded: Phase ${this.phase}, Turn ${this.currentTurn}`);

        } catch (error) {
            console.error('Failed to load turn state:', error);
            throw error;
        }
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

            if (error) {
                console.error('Error recording turn:', error);
                throw error;
            }

            console.log(`✅ Turn ${this.currentTurn} recorded for Phase ${this.phase}`);

            this.currentTurn++;

            return data;

        } catch (error) {
            console.error('Failed to record turn:', error);
            throw error;
        }
    }

    /**
     * Get conversation history for this phase
     */
    async getConversationHistory() {
        try {
            const { data, error } = await supabase
                .from('conversation_turns')
                .select('*')
                .eq('user_id', this.userId)
                .eq('phase_number', this.phase)
                .order('turn_number', { ascending: true });

            if (error) throw error;

            // Flatten into conversation format
            return data.flatMap(turn => [
                { role: 'user', content: turn.user_message },
                { role: 'assistant', content: turn.ai_response }
            ]);

        } catch (error) {
            console.error('Error loading conversation history:', error);
            return [];
        }
    }

    /**
     * Reset phase (restart from beginning)
     */
    async resetPhase() {
        try {
            const { error } = await supabase
                .from('conversation_turns')
                .delete()
                .eq('user_id', this.userId)
                .eq('phase_number', this.phase);

            if (error) throw error;

            console.log(`🔄 Phase ${this.phase} reset`);

            this.currentTurn = 1;

        } catch (error) {
            console.error('Error resetting phase:', error);
            throw error;
        }
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