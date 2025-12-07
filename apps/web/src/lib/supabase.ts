import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY;

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
