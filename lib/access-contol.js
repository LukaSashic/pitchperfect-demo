// Feature access by tier
const TIER_FEATURES = {
  free: {
    diagnostic: true,
    workshopPhases: 1,  // Only 1 teaser phase
    export: false,
    savedProjects: 1,
    tracks: ['basic'],
    analytics: false,
    support: 'community'
  },
  core: {
    diagnostic: true,
    workshopPhases: 6,  // Core phases
    export: 'basic',  // Text script only
    savedProjects: 5,
    tracks: ['all-core'],  // All core tracks
    analytics: 'basic',
    support: 'email'
  },
  professional: {
    diagnostic: true,
    workshopPhases: 12,  // All phases
    export: 'advanced',  // Script + outline + talking points
    savedProjects: -1,  // Unlimited
    tracks: 'all',
    analytics: 'advanced',
    support: 'priority',
    collaboration: true,
    multipleVersions: true
  }
}

// Pricing info
export const PRICING = {
  free: {
    name: 'Kostenlos',
    priceMonthly: 0,
    priceAnnual: 0,
    description: 'Perfekt zum Ausprobieren',
    features: [
      '5-Minuten Pitch-Diagnose',
      'Personalisierter Bericht',
      '1 Workshop-Phase (Teaser)',
      '1 gespeichertes Projekt'
    ]
  },
  core: {
    name: 'Core',
    priceMonthly: 29,
    priceAnnual: 290,
    stripePriceIdMonthly: 'price_xxx', // Replace with actual Stripe price ID later
    stripePriceIdAnnual: 'price_yyy',
    description: 'Für fokussierte Pitch-Optimierung',
    features: [
      'Alles in Kostenlos',
      '6 adaptive Workshop-Phasen',
      'Alle Core-Tracks',
      'Export: Text Script',
      'Bis zu 5 Projekte',
      'Email Support'
    ],
    popular: true
  },
  professional: {
    name: 'Professional',
    priceMonthly: 79,
    priceAnnual: 790,
    stripePriceIdMonthly: 'price_zzz',
    stripePriceIdAnnual: 'price_aaa',
    description: 'Für umfassende Pitch-Perfektion',
    features: [
      'Alles in Core',
      'Alle 12 Workshop-Phasen',
      'Alle Tracks (inkl. Advanced)',
      'Export: Script + Outline + Points',
      'Unbegrenzte Projekte',
      'Team-Kollaboration',
      'Priority Support',
      'Advanced Analytics'
    ]
  }
}

// Access control functions
export const AccessControl = {
  // Check if user can access a feature
  canAccess: (userTier, feature) => {
    const tierFeatures = TIER_FEATURES[userTier] || TIER_FEATURES.free
    return tierFeatures[feature] !== false && tierFeatures[feature] !== 0
  },

  // Check if user can access a specific phase
  canAccessPhase: (userTier, phaseNumber) => {
    const tierFeatures = TIER_FEATURES[userTier] || TIER_FEATURES.free
    return phaseNumber <= tierFeatures.workshopPhases
  },

  // Check if user can create more projects
  canCreateProject: (userTier, currentProjectCount) => {
    const tierFeatures = TIER_FEATURES[userTier] || TIER_FEATURES.free
    const limit = tierFeatures.savedProjects
    return limit === -1 || currentProjectCount < limit
  },

  // Get upgrade suggestion for blocked feature
  getUpgradeSuggestion: (userTier, blockedFeature) => {
    if (userTier === 'free') {
      return {
        title: '🔓 Unlock Vollständigen Workshop',
        message: 'Optimiere deinen Pitch in 6 fokussierten Phasen',
        targetTier: 'core',
        price: '€29/Monat',
        cta: 'Zu Core upgraden',
        benefits: [
          '6 adaptive Workshop-Phasen',
          'Alle Core-Tracks verfügbar',
          'Export als Text Script',
          'Bis zu 5 gespeicherte Projekte'
        ]
      }
    } else if (userTier === 'core') {
      return {
        title: '🚀 Upgrade zu Professional',
        message: 'Erhalte Zugang zu allen 12 Phasen und erweiterten Features',
        targetTier: 'professional',
        price: '€79/Monat',
        cta: 'Zu Professional upgraden',
        benefits: [
          'Alle 12 Workshop-Phasen',
          'Erweiterte Export-Formate',
          'Unbegrenzte Projekte',
          'Team-Kollaboration',
          'Priority Support'
        ]
      }
    }
    return null
  },

  // Get feature details by tier
  getFeatures: (tier) => {
    return TIER_FEATURES[tier] || TIER_FEATURES.free
  },

  // Get pricing details
  getPricing: (tier) => {
    return PRICING[tier]
  }
}