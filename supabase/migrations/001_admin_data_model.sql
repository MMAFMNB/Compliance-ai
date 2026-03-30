-- ============================================================
-- Admin Data Model: Firms, Roles, Audit Log, Usage Events
-- Run against the Supabase SQL editor or via supabase db push
-- ============================================================

-- 1. Firms table
CREATE TABLE IF NOT EXISTS firms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    name_ar     VARCHAR(255),
    cma_license VARCHAR(100),
    is_active   BOOLEAN DEFAULT true,
    settings    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_firms_cma_license ON firms (cma_license);
CREATE INDEX IF NOT EXISTS idx_firms_is_active ON firms (is_active);

-- 2. Role enum type (safe CREATE if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'super_admin',
            'firm_admin',
            'compliance_officer',
            'analyst',
            'auditor',
            'read_only'
        );
    END IF;
END$$;

-- 3. Extend users table with firm_id and role columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES firms(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'compliance_officer';

-- Drop the old text role column if it exists and conflicts
-- (The existing 'role' column is TEXT; we need to migrate it)
-- NOTE: If the column already exists as TEXT, run this block to convert:
DO $$
BEGIN
    -- Check if role column exists and is text type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
        AND data_type = 'text'
    ) THEN
        -- Rename old column, add new typed column, migrate data
        ALTER TABLE users RENAME COLUMN role TO role_old;
        ALTER TABLE users ADD COLUMN role user_role DEFAULT 'compliance_officer';
        UPDATE users SET role = CASE
            WHEN role_old = 'super_admin' THEN 'super_admin'::user_role
            WHEN role_old = 'firm_admin' THEN 'firm_admin'::user_role
            WHEN role_old = 'compliance_officer' THEN 'compliance_officer'::user_role
            WHEN role_old = 'analyst' THEN 'analyst'::user_role
            WHEN role_old = 'auditor' THEN 'auditor'::user_role
            WHEN role_old = 'read_only' THEN 'read_only'::user_role
            ELSE 'compliance_officer'::user_role
        END;
        ALTER TABLE users DROP COLUMN role_old;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_users_firm_id ON users (firm_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 4. Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    firm_id       UUID REFERENCES firms(id) ON DELETE SET NULL,
    action        VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id   TEXT,
    details       JSONB DEFAULT '{}',
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_firm_id ON audit_log (firm_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

-- 5. Usage events table (for analytics / billing)
CREATE TABLE IF NOT EXISTS usage_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    firm_id     UUID REFERENCES firms(id) ON DELETE SET NULL,
    event_type  VARCHAR(50) NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_firm_id ON usage_events (firm_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events (event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events (created_at DESC);

-- 6. Helper functions for role checks
CREATE OR REPLACE FUNCTION is_super_admin(uid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM users WHERE id = uid AND role = 'super_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_firm_admin(uid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM users WHERE id = uid AND role IN ('super_admin', 'firm_admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_firm_id(uid UUID)
RETURNS UUID AS $$
    SELECT firm_id FROM users WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 7. Row Level Security policies

-- Firms: super_admin sees all, firm_admin/users see only their own firm
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY firms_super_admin ON firms
    FOR ALL
    USING (is_super_admin(auth.uid()));

CREATE POLICY firms_own_firm ON firms
    FOR SELECT
    USING (id = get_user_firm_id(auth.uid()));

-- Audit log: super_admin sees all, firm_admin sees own firm's logs
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_super_admin ON audit_log
    FOR ALL
    USING (is_super_admin(auth.uid()));

CREATE POLICY audit_log_firm_admin ON audit_log
    FOR SELECT
    USING (
        is_firm_admin(auth.uid())
        AND firm_id = get_user_firm_id(auth.uid())
    );

-- Usage events: super_admin sees all, firm_admin sees own firm
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_events_super_admin ON usage_events
    FOR ALL
    USING (is_super_admin(auth.uid()));

CREATE POLICY usage_events_firm_admin ON usage_events
    FOR SELECT
    USING (
        is_firm_admin(auth.uid())
        AND firm_id = get_user_firm_id(auth.uid())
    );

-- Users: super_admin manages all, firm_admin manages own firm's users
-- (RLS on users table — only if not already enabled)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = 'users' AND rowsecurity = true
    ) THEN
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    END IF;
END$$;

-- Drop existing policies to avoid conflicts, then recreate
DROP POLICY IF EXISTS users_super_admin ON users;
DROP POLICY IF EXISTS users_firm_admin ON users;
DROP POLICY IF EXISTS users_own_profile ON users;

CREATE POLICY users_super_admin ON users
    FOR ALL
    USING (is_super_admin(auth.uid()));

CREATE POLICY users_firm_admin ON users
    FOR ALL
    USING (
        is_firm_admin(auth.uid())
        AND firm_id = get_user_firm_id(auth.uid())
    );

CREATE POLICY users_own_profile ON users
    FOR SELECT
    USING (id = auth.uid());

-- 8. Seed a default firm for existing users
INSERT INTO firms (id, name, name_ar, cma_license)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'TAM Capital',
    'تام المالية',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- Link existing users that have no firm_id
UPDATE users SET firm_id = '00000000-0000-0000-0000-000000000001'
WHERE firm_id IS NULL;

-- 9. Updated_at trigger for firms
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS firms_updated_at ON firms;
CREATE TRIGGER firms_updated_at
    BEFORE UPDATE ON firms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
