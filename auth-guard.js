/**
 * Authentication Guard
 * Protects routes by checking if user is logged in
 * Add this script to any page that requires authentication
 */

// Supabase configuration
const SUPABASE_URL = 'https://cfqwzxomkgvphlhywwpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmcXd6eG9ta2d2cGhsaHl3d3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NTQxMzksImV4cCI6MjA3ODMzMDEzOX0.cVBxieYS9yxvxxs9ct02sIgwGczngJ2lOE6Y-o7H-Zc';

// Initialize Supabase (if not already initialized)
if (typeof supabaseClient === 'undefined') {
    const { createClient } = supabase;
    var supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    });
}

/**
 * Check if user is authenticated
 * Redirects to login if not authenticated
 */
async function requireAuth() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error) {
            console.error('Auth check error:', error);
            redirectToLogin();
            return null;
        }

        if (!session || !session.user) {
            redirectToLogin();
            return null;
        }

        return session.user;
    } catch (error) {
        console.error('Auth guard error:', error);
        redirectToLogin();
        return null;
    }
}

/**
 * Get current user with profile data
 */
async function getCurrentUserWithProfile() {
    const user = await requireAuth();
    if (!user) return null;

    try {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('Profile fetch error:', error);
            return { user, profile: null };
        }

        return { user, profile };
    } catch (error) {
        console.error('Profile fetch error:', error);
        return { user, profile: null };
    }
}

/**
 * Check if user has access to a feature based on tier
 */
function hasAccess(userTier, requiredTier) {
    const tiers = {
        'free': 0,
        'core': 1,
        'professional': 2
    };

    const userLevel = tiers[userTier?.toLowerCase()] || 0;
    const requiredLevel = tiers[requiredTier?.toLowerCase()] || 0;

    return userLevel >= requiredLevel;
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
    const currentPath = window.location.pathname;
    const returnUrl = encodeURIComponent(currentPath);
    window.location.href = `/login.html?returnUrl=${returnUrl}`;
}

/**
 * Redirect to upgrade page
 */
function redirectToUpgrade() {
    window.location.href = '/pricing.html';
}

/**
 * Show upgrade prompt if user doesn't have access
 */
function showUpgradePrompt(featureName, requiredTier) {
    const tierNames = {
        'core': 'CORE',
        'professional': 'PROFESSIONAL'
    };

    return `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
            border-radius: 12px;
            text-align: center;
            margin: 20px 0;
        ">
            <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
            <h3 style="margin-bottom: 12px; font-size: 24px;">
                ${featureName} ist ein Premium-Feature
            </h3>
            <p style="margin-bottom: 20px; opacity: 0.9;">
                Upgrade auf ${tierNames[requiredTier]} um Zugriff zu erhalten
            </p>
            <button onclick="window.location.href='/pricing.html'" style="
                background: white;
                color: #667eea;
                border: none;
                padding: 12px 32px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
            ">
                Jetzt upgraden
            </button>
        </div>
    `;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        requireAuth,
        getCurrentUserWithProfile,
        hasAccess,
        redirectToLogin,
        redirectToUpgrade,
        showUpgradePrompt
    };
}

console.log('✅ Auth guard loaded');