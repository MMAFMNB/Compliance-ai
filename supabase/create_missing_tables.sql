-- ============================================================
-- Create missing tables for TAM Compliance AI
-- Run this in the Supabase Dashboard SQL Editor
-- ============================================================

-- 1. Deadlines (Calendar)
CREATE TABLE IF NOT EXISTS public.deadlines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    title_en text,
    description text,
    deadline_date date NOT NULL,
    category text DEFAULT 'other',
    frequency text DEFAULT 'one_time',
    is_recurring boolean DEFAULT false,
    cma_reference text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- 2. User Deadline Tracking
CREATE TABLE IF NOT EXISTS public.user_deadlines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    deadline_id uuid REFERENCES public.deadlines(id) ON DELETE CASCADE,
    status text DEFAULT 'pending',
    notes text,
    completed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, deadline_id)
);

-- 3. Impact Analyses
CREATE TABLE IF NOT EXISTS public.impact_analyses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    alert_id uuid REFERENCES public.alerts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    impact_level text,
    affected_areas text[],
    analysis_ar text,
    analysis_en text,
    action_items jsonb,
    latency_ms integer,
    created_at timestamptz DEFAULT now()
);

-- 4. Document Templates
CREATE TABLE IF NOT EXISTS public.templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    name_ar text,
    description text,
    category text DEFAULT 'general',
    fields jsonb,
    prompt_template text,
    created_at timestamptz DEFAULT now()
);

-- 5. Compliance Assessments
CREATE TABLE IF NOT EXISTS public.compliance_assessments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    firm_id uuid,
    title text,
    status text DEFAULT 'draft',
    score numeric,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

-- 6. Assessment Items
CREATE TABLE IF NOT EXISTS public.assessment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    assessment_id uuid REFERENCES public.compliance_assessments(id) ON DELETE CASCADE,
    requirement text NOT NULL,
    category text,
    status text DEFAULT 'pending',
    notes text,
    evidence text,
    created_at timestamptz DEFAULT now()
);

-- 7. Self Assessments
CREATE TABLE IF NOT EXISTS public.self_assessments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    firm_id uuid,
    assessment_data jsonb,
    score numeric,
    status text DEFAULT 'draft',
    created_at timestamptz DEFAULT now()
);

-- 8. Compliance Requirements
CREATE TABLE IF NOT EXISTS public.compliance_requirements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    firm_id uuid,
    title text NOT NULL,
    title_en text,
    category text,
    description text,
    regulation_reference text,
    priority text DEFAULT 'medium',
    status text DEFAULT 'pending',
    due_date date,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Enable RLS + service role bypass policies
-- ============================================================

ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impact_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_deadlines ON public.deadlines FOR ALL TO service_role USING (true);
CREATE POLICY service_role_user_deadlines ON public.user_deadlines FOR ALL TO service_role USING (true);
CREATE POLICY service_role_impact_analyses ON public.impact_analyses FOR ALL TO service_role USING (true);
CREATE POLICY service_role_templates ON public.templates FOR ALL TO service_role USING (true);
CREATE POLICY service_role_compliance_assessments ON public.compliance_assessments FOR ALL TO service_role USING (true);
CREATE POLICY service_role_assessment_items ON public.assessment_items FOR ALL TO service_role USING (true);
CREATE POLICY service_role_self_assessments ON public.self_assessments FOR ALL TO service_role USING (true);
CREATE POLICY service_role_compliance_requirements ON public.compliance_requirements FOR ALL TO service_role USING (true);
