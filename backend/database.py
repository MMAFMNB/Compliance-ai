from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Public client — respects RLS, used with user JWTs
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Service role client — bypasses RLS, used for admin operations
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
