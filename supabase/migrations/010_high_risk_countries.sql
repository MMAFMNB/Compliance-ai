-- High Risk Countries table for AML/CFT country risk tracking
CREATE TABLE IF NOT EXISTS high_risk_countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country TEXT NOT NULL,
    country_ar TEXT,
    risk_level TEXT NOT NULL,  -- 'high_risk', 'call_for_action', 'monitored'
    list_type TEXT,            -- 'FATF', 'local'
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(country, list_type)
);

ALTER TABLE high_risk_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY hrc_read ON high_risk_countries
    FOR SELECT TO authenticated USING (true);

CREATE POLICY hrc_service ON high_risk_countries
    FOR ALL TO service_role USING (true) WITH CHECK (true);
