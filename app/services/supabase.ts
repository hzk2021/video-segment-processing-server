import { createClient } from '@supabase/supabase-js';
import { config } from '../config/config';

// Function to safely create a Supabase client
const createSafeClient = (schema: string) => {
  try {
    // Validate URL format before creating client
    if (!config.supabase.url || !config.supabase.url.startsWith('https://')) {
      console.error(`Invalid Supabase URL format: "${config.supabase.url}". Must start with https://`);
      return null;
    }
    
    if (!config.supabase.anonKey) {
      console.error('Missing Supabase anon key');
      return null;
    }
    
    return createClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        db: {
          schema: schema
        }
      }
    );
  } catch (error) {
    console.error(`Failed to create Supabase client for ${schema} schema:`, error);
    return null;
  }
};

// Create clients with error handling
export const supabasePublic = createSafeClient('public');
export const supabasePGMQPublic = createSafeClient('pgmq_public');
