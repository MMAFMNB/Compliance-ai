-- ============================================================
-- Phase 5: AML/CFT Case Management & Suitability Schema
-- TAM Compliance AI
-- ============================================================

-- AML Case status enum
DO $$ BEGIN
  CREATE TYPE aml_case_status AS ENUM (
    'open', 'under_review', 'escalated', 'reported', 'closed', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AML Case priority enum
DO $$ BEGIN
  CREATE TYPE aml_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AML Case type enum
DO $$ BEGIN
  CREATE TYPE aml_case_type AS ENUM (
    'suspicious_transaction', 'unusual_activity', 'sanctions_match',
    'pep_match', 'threshold_breach', 'tip_off', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── AML Cases ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aml_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),
  case_number TEXT UNIQUE NOT NULL,
  case_type aml_case_type NOT NULL DEFAULT 'suspicious_transaction',
  status aml_case_status NOT NULL DEFAULT 'open',
  priority aml_priority NOT NULL DEFAULT 'medium',

  -- Subject info
  subject_name TEXT NOT NULL,
  subject_name_ar TEXT,
  subject_id_type TEXT,          -- national_id, iqama, passport, cr
  subject_id_number TEXT,
  subject_account_number TEXT,
  subject_type TEXT DEFAULT 'individual',  -- individual, entity

  -- Case details
  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  description_ar TEXT,
  total_amount NUMERIC(18, 2),
  currency TEXT DEFAULT 'SAR',
  transaction_date TIMESTAMPTZ,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  escalated_to UUID REFERENCES auth.users(id),
  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ,

  -- STR tracking
  str_generated BOOLEAN DEFAULT false,
  str_submitted_to_safiu BOOLEAN DEFAULT false,
  str_reference_number TEXT,
  str_submitted_at TIMESTAMPTZ,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_aml_cases_firm ON aml_cases(firm_id);
CREATE INDEX IF NOT EXISTS idx_aml_cases_status ON aml_cases(status);
CREATE INDEX IF NOT EXISTS idx_aml_cases_assigned ON aml_cases(assigned_to);


-- ─── AML Case Evidence ────────────────────────────────────
CREATE TABLE IF NOT EXISTS aml_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES aml_cases(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,   -- transaction, document, screenshot, note, correspondence
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_evidence_case ON aml_evidence(case_id);


-- ─── AML Case Timeline (Audit Trail) ─────────────────────
CREATE TABLE IF NOT EXISTS aml_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES aml_cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,          -- created, status_changed, evidence_added, note_added, escalated, str_generated, assigned, closed
  details TEXT,
  details_ar TEXT,
  old_value TEXT,
  new_value TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_timeline_case ON aml_timeline(case_id);


-- ─── STR Reports ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS str_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES aml_cases(id) ON DELETE CASCADE,
  firm_id UUID REFERENCES firms(id),

  -- Report content (bilingual)
  report_en TEXT,
  report_ar TEXT,
  summary TEXT,
  summary_ar TEXT,

  -- SAFIU fields
  reporting_entity TEXT,
  reporting_entity_license TEXT,
  report_date TIMESTAMPTZ DEFAULT NOW(),
  suspicion_indicators JSONB DEFAULT '[]',
  recommended_actions JSONB DEFAULT '[]',

  -- Status
  status TEXT DEFAULT 'draft',   -- draft, reviewed, submitted
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_str_reports_case ON str_reports(case_id);


-- ─── Watchlist Screening Results ──────────────────────────
CREATE TABLE IF NOT EXISTS screening_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),
  case_id UUID REFERENCES aml_cases(id),

  -- Screened subject
  screened_name TEXT NOT NULL,
  screened_id_number TEXT,

  -- Results
  match_found BOOLEAN DEFAULT false,
  match_score NUMERIC(5, 2),
  matched_list TEXT,             -- ofac, un_sanctions, sama_local, pep, eu_sanctions
  matched_entity TEXT,
  match_details JSONB DEFAULT '{}',

  -- Status
  status TEXT DEFAULT 'pending', -- pending, cleared, escalated, confirmed_match
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,

  screened_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screening_firm ON screening_results(firm_id);


-- ─── Client Suitability Assessments ──────────────────────
CREATE TABLE IF NOT EXISTS suitability_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),

  -- Client info
  client_name TEXT NOT NULL,
  client_name_ar TEXT,
  client_id_number TEXT,
  client_type TEXT DEFAULT 'individual',  -- individual, institutional

  -- Risk profile
  risk_tolerance TEXT,           -- conservative, moderate, aggressive
  investment_experience TEXT,    -- none, limited, moderate, extensive
  investment_horizon TEXT,       -- short, medium, long
  annual_income_range TEXT,
  net_worth_range TEXT,
  investment_objectives JSONB DEFAULT '[]',
  source_of_funds TEXT,

  -- Assessment results
  overall_risk_score NUMERIC(5, 2),
  risk_category TEXT,            -- low, medium, high
  suitable_products JSONB DEFAULT '[]',
  unsuitable_products JSONB DEFAULT '[]',
  ai_assessment TEXT,            -- Claude's analysis (EN)
  ai_assessment_ar TEXT,         -- Claude's analysis (AR)
  conditions TEXT,
  conditions_ar TEXT,

  -- Status
  status TEXT DEFAULT 'draft',   -- draft, completed, approved, expired
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suitability_firm ON suitability_assessments(firm_id);
CREATE INDEX IF NOT EXISTS idx_suitability_client ON suitability_assessments(client_id_number);


-- ─── Enable RLS ───────────────────────────────────────────
ALTER TABLE aml_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE str_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE suitability_assessments ENABLE ROW LEVEL SECURITY;
