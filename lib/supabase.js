import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helpers
export const auth = {
  // Sign up new user
  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })
    
    if (error) throw error
    return data
  },

  // Sign in
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) throw error
    return data
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // Get current user
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },

  // Get user profile with subscription info
  getUserProfile: async () => {
    const user = await auth.getCurrentUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) throw error
    return data
  },

  // Listen to auth state changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Profile helpers
export const profiles = {
  // Get user's tier
  getTier: async () => {
    const profile = await auth.getUserProfile()
    return profile?.tier || 'free'
  },

  // Update subscription info (called by webhook)
  updateSubscription: async (userId, subscriptionData) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        tier: subscriptionData.tier,
        stripe_customer_id: subscriptionData.customerId,
        stripe_subscription_id: subscriptionData.subscriptionId,
        subscription_status: subscriptionData.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (error) throw error
  }
}

// Projects helpers
export const projects = {
  // Create new project
  create: async (projectData) => {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('pitch_projects')
      .insert({
        user_id: user.id,
        ...projectData
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Get all user projects
  getAll: async () => {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('pitch_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return data
  },

  // Get single project
  getById: async (projectId) => {
    const { data, error } = await supabase
      .from('pitch_projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (error) throw error
    return data
  },

  // Update project
  update: async (projectId, updates) => {
    const { data, error } = await supabase
      .from('pitch_projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Delete project
  delete: async (projectId) => {
    const { error } = await supabase
      .from('pitch_projects')
      .delete()
      .eq('id', projectId)

    if (error) throw error
  }
}

// Usage tracking
export const usage = {
  track: async (eventType, eventData = {}) => {
    const user = await auth.getCurrentUser()
    if (!user) return // Don't track anonymous users

    const { error } = await supabase
      .from('usage_events')
      .insert({
        user_id: user.id,
        event_type: eventType,
        event_data: eventData
      })

    if (error) console.error('Usage tracking error:', error)
  }
}