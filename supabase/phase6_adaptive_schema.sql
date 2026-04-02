-- ============================================================
-- Phase 6: Adaptive Learning & Knowledge Base Schema
-- TAM Compliance AI
-- ============================================================

-- ─── Firm Knowledge Base ──────────────────────────────────
-- Stores firm-specific documents, policies, and decisions
-- that the AI uses to give more relevant answers over time.
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),

  -- Content
  title TEXT NOT NULL,
  title_ar TEXT,
  content TEXT NOT NULL,
  content_ar TEXT,
  category TEXT NOT NULL,          -- policy, decision, procedure, template, guideline, faq
  tags JSONB DEFAULT '[]',

  -- Source tracking
  source_type TEXT,                -- manual, feedback, document, chat_extract
  source_id TEXT,                  -- reference to feedback ID, document ID, etc.

  -- Embedding for RAG
  embedding_status TEXT DEFAULT 'pending',  -- pending, embedded, failed
  chunk_count INT DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_firm ON knowledge_base(firm_id);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_active ON knowledge_base(is_active);


-- ─── Firm Prompt Configurations ───────────────────────────
-- Stores firm-specific prompt overrides and preferences
-- that adapt the AI behavior to each firm's style.
CREATE TABLE IF NOT EXISTS prompt_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),

  -- Prompt customization
  config_key TEXT NOT NULL,        -- tone, formality, terminology, focus_areas, disclaimers
  config_value TEXT NOT NULL,
  config_value_ar TEXT,
  description TEXT,

  -- Learning source
  learned_from TEXT,               -- manual, feedback_analysis, usage_patterns
  confidence_score NUMERIC(5, 2) DEFAULT 50.0,  -- 0-100 how confident we are

  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(firm_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_prompt_configs_firm ON prompt_configs(firm_id);


-- ─── Accuracy Metrics ─────────────────────────────────────
-- Tracks AI output quality over time per feature per firm.
CREATE TABLE IF NOT EXISTS accuracy_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),

  -- What we're measuring
  feature TEXT NOT NULL,           -- chat, docgen, review, checklist, etc.
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT DEFAULT 'weekly',  -- daily, weekly, monthly

  -- Metrics
  total_interactions INT DEFAULT 0,
  approved_count INT DEFAULT 0,
  needs_edit_count INT DEFAULT 0,
  rejected_count INT DEFAULT 0,
  approval_rate NUMERIC(5, 2) DEFAULT 0.0,

  -- Quality signals
  avg_response_time_ms INT,
  avg_edit_distance NUMERIC(10, 2),  -- how much users edit AI output
  user_satisfaction_score NUMERIC(5, 2),

  -- Trend
  improvement_vs_previous NUMERIC(5, 2),  -- percentage change from prior period

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accuracy_firm ON accuracy_metrics(firm_id);
CREATE INDEX IF NOT EXISTS idx_accuracy_feature ON accuracy_metrics(feature);
CREATE INDEX IF NOT EXISTS idx_accuracy_period ON accuracy_metrics(period_start);


-- ─── Learning Events Log ──────────────────────────────────
-- Tracks when the system learns something new (prompt update,
-- knowledge addition, etc.) for transparency.
CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id),

  event_type TEXT NOT NULL,        -- kb_added, prompt_updated, metric_computed, feedback_processed
  description TEXT,
  description_ar TEXT,
  details JSONB DEFAULT '{}',

  triggered_by TEXT,               -- system, admin, feedback_threshold
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_events_firm ON learning_events(firm_id);


-- ─── Enable RLS ───────────────────────────────────────────
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accuracy_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;
