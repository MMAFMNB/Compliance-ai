-- ============================================================
-- Regulatory Obligations: parsed from CMA circulars via AI
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_obligations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id        UUID REFERENCES alerts(id) ON DELETE CASCADE,
    obligation      TEXT NOT NULL,          -- Arabic text
    obligation_en   TEXT,                   -- English text
    category        VARCHAR(50),            -- e.g. aml_kyc, reporting, governance
    deadline        TEXT,                   -- e.g. "Within 30 days", "2026-06-30"
    deadline_date   DATE,                   -- parsed date if applicable
    priority        VARCHAR(10) DEFAULT 'medium',  -- high / medium / low
    affected_roles  TEXT[],                 -- e.g. {'compliance_officer','fund_manager'}
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    status          VARCHAR(20) DEFAULT 'pending', -- pending / acknowledged / completed
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obligations_alert_id ON regulatory_obligations (alert_id);
CREATE INDEX IF NOT EXISTS idx_obligations_category ON regulatory_obligations (category);
CREATE INDEX IF NOT EXISTS idx_obligations_deadline_date ON regulatory_obligations (deadline_date);
CREATE INDEX IF NOT EXISTS idx_obligations_status ON regulatory_obligations (status);
CREATE INDEX IF NOT EXISTS idx_obligations_priority ON regulatory_obligations (priority);

-- RLS: all authenticated users can read obligations
ALTER TABLE regulatory_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY obligations_read ON regulatory_obligations
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only service role can insert/update (via backend)
CREATE POLICY obligations_service ON regulatory_obligations
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Add is_processed and parsed_at columns to alerts for tracking parsing status
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_parsed BOOLEAN DEFAULT false;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMPTZ;
