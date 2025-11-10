import { supabase } from './supabase.js';

// Subscription tier definitions
const TIERS = {
    FREE: 'free',
    BASIC: 'basic',
    PRO: 'pro'
};

// Feature access matrix
const FEATURES = {
    DIAGNOSTIC: {
        free: true,
        basic: true,
        pro: true
    },
    WORKSHOP: {
        free: false,
        basic: true,
        pro: true
    },
    PDF_EXPORT: {
        free: false,
        basic: false,
        pro: true
    },
    UNLIMITED_PROJECTS: {
        free: false,
        basic: false,
        pro: true
    },
    PRIORITY_SUPPORT: {
        free: false,
        basic: false,
        pro: true
    }
};

/**
 * Get user's subscription tier
 * @returns {Promise<string>} Subscription tier (free, basic, pro)
 */
export async function getUserTier() {
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            return TIERS.FREE;
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('subscription_tier, subscription_status')
            .eq('id', session.user.id)
            .single();

        if (profileError || !profile) {
            console.error('Error fetching user tier:', profileError);
            return TIERS.FREE;
        }

        // Check if subscription is active
        if (profile.subscription_status !== 'active') {
            return TIERS.FREE;
        }

        return profile.subscription_tier || TIERS.FREE;
    } catch (error) {
        console.error('Error in getUserTier:', error);
        return TIERS.FREE;
    }
}

/**
 * Check if user has access to a specific feature
 * @param {string} featureName - Name of the feature to check
 * @returns {Promise<boolean>} Whether user has access
 */
export async function hasFeatureAccess(featureName) {
    try {
        const tier = await getUserTier();
        const feature = FEATURES[featureName];

        if (!feature) {
            console.error(`Unknown feature: ${featureName}`);
            return false;
        }

        return feature[tier] === true;
    } catch (error) {
        console.error('Error checking feature access:', error);
        return false;
    }
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} Whether user is logged in
 */
export async function isAuthenticated() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return !!session;
    } catch (error) {
        console.error('Error checking authentication:', error);
        return false;
    }
}

/**
 * Get current user profile
 * @returns {Promise<Object|null>} User profile or null
 */
export async function getCurrentUserProfile() {
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            return null;
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError) {
            console.error('Error fetching profile:', profileError);
            return null;
        }

        return profile;
    } catch (error) {
        console.error('Error in getCurrentUserProfile:', error);
        return null;
    }
}

/**
 * Redirect to login if not authenticated
 * @param {string} redirectUrl - URL to redirect to after login
 */
export async function requireAuth(redirectUrl = window.location.pathname) {
    const authenticated = await isAuthenticated();
    
    if (!authenticated) {
        const loginUrl = `/login.html?redirect=${encodeURIComponent(redirectUrl)}`;
        window.location.href = loginUrl;
        return false;
    }
    
    return true;
}

/**
 * Redirect to upgrade page if feature not accessible
 * @param {string} featureName - Name of the feature to check
 */
export async function requireFeature(featureName) {
    const hasAccess = await hasFeatureAccess(featureName);
    
    if (!hasAccess) {
        alert(`Diese Funktion erfordert ein Premium-Abonnement.\n\nFeature: ${featureName}`);
        window.location.href = '/dashboard.html#upgrade';
        return false;
    }
    
    return true;
}

// Export constants
export { TIERS, FEATURES };