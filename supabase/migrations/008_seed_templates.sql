-- ============================================================
-- Fix Document Generator Pipeline:
--   1. Ensure generated_documents table exists
--   2. Add missing columns to templates (name_en, required_fields)
--   3. Seed essential compliance document templates
-- ============================================================

-- ─── 1. Create generated_documents if it does not exist ─────
-- Migration 003 assumes this table exists but no migration creates it.
CREATE TABLE IF NOT EXISTS generated_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    content         TEXT,
    template_id     UUID REFERENCES templates(id) ON DELETE SET NULL,
    input_data      JSONB DEFAULT '{}',
    letterhead_id   UUID,
    latency_ms      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Add missing columns to templates ────────────────────
-- The backend (docgen.py) writes name_en and required_fields,
-- but the original schema only has name_ar and fields.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS required_fields JSONB;

-- ─── 3. Seed compliance document templates ──────────────────
-- Uses ON CONFLICT to be idempotent (safe to re-run).

INSERT INTO templates (id, name, name_en, category, description, prompt_template, required_fields, created_at)
VALUES
  -- AML/KYC Policy
  (
    'c4c03a5a-8ab6-553a-a02e-e0a189ce6321',
    'سياسة مكافحة غسل الأموال',
    'AML Policy',
    'aml_policy',
    'إنشاء وثيقة سياسة مكافحة غسل الأموال وتمويل الإرهاب متوافقة مع متطلبات هيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإنشاء وثيقة سياسة شاملة لمكافحة غسل الأموال وتمويل الإرهاب (AML/CTF) '
    'متوافقة مع معايير هيئة السوق المالية للشركة التالية:\n\n'
    'اسم الشركة: {company_name}\n'
    'رقم الترخيص: {license_number}\n'
    'اسم مسؤول الالتزام: {compliance_officer_name}\n'
    'مستوى المخاطر: {risk_level}\n\n'
    'يجب أن تتضمن الوثيقة جميع الأقسام المطلوبة وفقاً للوائح هيئة السوق المالية '
    'بما في ذلك إجراءات العناية الواجبة، وتقييم المخاطر، والإبلاغ عن العمليات المشبوهة. '
    'اكتب الوثيقة باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "license_number", "label": "رقم الترخيص", "label_en": "License Number", "type": "text"},
      {"field_name": "compliance_officer_name", "label": "اسم مسؤول الالتزام", "label_en": "Compliance Officer Name", "type": "text"},
      {"field_name": "risk_level", "label": "مستوى المخاطر", "label_en": "Risk Level", "type": "select", "options": ["high", "medium", "low"]}
    ]'::jsonb,
    NOW()
  ),

  -- Compliance Report
  (
    'adc6b625-4e07-5fc9-9826-2e9225e7c1f0',
    'تقرير الالتزام السنوي',
    'Annual Compliance Report',
    'compliance_report',
    'إنشاء تقرير الالتزام السنوي وفقاً لمتطلبات هيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإنشاء تقرير التزام سنوي شامل ومتوافق مع معايير هيئة السوق المالية '
    'للشركة التالية:\n\n'
    'اسم الشركة: {company_name}\n'
    'فترة التقرير: {reporting_period}\n'
    'نوع الترخيص: {license_type}\n'
    'النتائج الرئيسية: {key_findings}\n\n'
    'يجب أن يتضمن التقرير ملخصاً تنفيذياً، ونتائج المراجعة، والتوصيات، '
    'وخطة العمل التصحيحية وفقاً لمتطلبات الإفصاح لهيئة السوق المالية. '
    'اكتب التقرير باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "reporting_period", "label": "فترة التقرير", "label_en": "Reporting Period", "type": "text"},
      {"field_name": "license_type", "label": "نوع الترخيص", "label_en": "License Type", "type": "text"},
      {"field_name": "key_findings", "label": "النتائج الرئيسية", "label_en": "Key Findings", "type": "textarea"}
    ]'::jsonb,
    NOW()
  ),

  -- Board Notification
  (
    '65e1ad56-c111-5e59-920f-1b67f872e213',
    'إشعار مجلس الإدارة',
    'Board Notification',
    'board_notification',
    'إنشاء خطاب إشعار مجلس الإدارة وفقاً لمتطلبات هيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإنشاء خطاب إشعار رسمي لمجلس الإدارة متوافق مع متطلبات هيئة السوق المالية '
    'بالتفاصيل التالية:\n\n'
    'اسم الشركة: {company_name}\n'
    'نوع الإشعار: {notification_type}\n'
    'التفاصيل: {details}\n'
    'تاريخ قرار مجلس الإدارة: {board_resolution_date}\n\n'
    'يجب أن يتضمن الخطاب جميع العناصر المطلوبة وفقاً لقواعد حوكمة الشركات '
    'الصادرة عن هيئة السوق المالية، بما في ذلك المراجع التنظيمية المناسبة. '
    'اكتب الخطاب باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "notification_type", "label": "نوع الإشعار", "label_en": "Notification Type", "type": "text"},
      {"field_name": "details", "label": "التفاصيل", "label_en": "Details", "type": "textarea"},
      {"field_name": "board_resolution_date", "label": "تاريخ قرار مجلس الإدارة", "label_en": "Board Resolution Date", "type": "text"}
    ]'::jsonb,
    NOW()
  ),

  -- Risk Assessment
  (
    'b8f7e2d1-3a9c-5b4e-8d6f-1c2e3a4b5c6d',
    'تقييم المخاطر',
    'Risk Assessment',
    'risk_assessment',
    'إعداد تقرير تقييم المخاطر الشامل وفقاً لمتطلبات هيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإعداد تقرير تقييم مخاطر شامل متوافق مع إطار إدارة المخاطر لهيئة السوق المالية '
    'بالتفاصيل التالية:\n\n'
    'اسم الشركة: {company_name}\n'
    'نطاق التقييم: {assessment_scope}\n'
    'الفترة المشمولة: {assessment_period}\n'
    'المخاطر المحددة: {identified_risks}\n\n'
    'يجب أن يتضمن التقرير تحديد المخاطر وتصنيفها، وتقييم الأثر والاحتمالية، '
    'وإجراءات التخفيف المقترحة، ومصفوفة المخاطر. '
    'اكتب التقرير باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "assessment_scope", "label": "نطاق التقييم", "label_en": "Assessment Scope", "type": "text"},
      {"field_name": "assessment_period", "label": "الفترة المشمولة", "label_en": "Assessment Period", "type": "text"},
      {"field_name": "identified_risks", "label": "المخاطر المحددة", "label_en": "Identified Risks", "type": "textarea"}
    ]'::jsonb,
    NOW()
  ),

  -- Suspicious Transaction Report (STR)
  (
    'a1b2c3d4-5e6f-5a7b-8c9d-0e1f2a3b4c5d',
    'تقرير العمليات المشبوهة (STR)',
    'Suspicious Transaction Report',
    'aml_policy',
    'إعداد تقرير عمليات مشبوهة لتقديمه للجهات المختصة وفقاً لمتطلبات هيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإنشاء تقرير عمليات مشبوهة (STR) شامل ومتوافق مع متطلبات هيئة السوق المالية '
    'ووحدة التحريات المالية بالتفاصيل التالية:\n\n'
    'اسم الشركة: {company_name}\n'
    'اسم العميل/الطرف المشتبه به: {suspect_name}\n'
    'وصف العملية المشبوهة: {transaction_description}\n'
    'المبلغ التقريبي: {amount}\n\n'
    'يجب أن يتضمن التقرير وصفاً تفصيلياً للعملية، ومؤشرات الاشتباه، '
    'والإجراءات المتخذة، وتوصية الإبلاغ. اكتب باللغة العربية مع ترجمة إنجليزية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "suspect_name", "label": "اسم العميل/الطرف المشتبه به", "label_en": "Suspect Name", "type": "text"},
      {"field_name": "transaction_description", "label": "وصف العملية المشبوهة", "label_en": "Transaction Description", "type": "textarea"},
      {"field_name": "amount", "label": "المبلغ التقريبي", "label_en": "Approximate Amount", "type": "text"}
    ]'::jsonb,
    NOW()
  ),

  -- Board Pack Compliance Section
  (
    'd4e5f6a7-b8c9-5d0e-1f2a-3b4c5d6e7f8a',
    'قسم الالتزام في حزمة مجلس الإدارة',
    'Board Pack Compliance Section',
    'compliance_report',
    'إعداد قسم الالتزام في حزمة مجلس الإدارة الدورية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإنشاء قسم الالتزام التنظيمي لحزمة مجلس الإدارة:\n\n'
    'اسم الشركة: {company_name}\n'
    'فترة التقرير: {reporting_period}\n'
    'ملخص حالة الالتزام: {compliance_summary}\n'
    'الحوادث أو المخالفات: {incidents}\n\n'
    'يجب أن يتضمن ملخصاً تنفيذياً، وحالة الالتزام الحالية، والمخاطر الرئيسية، '
    'والتوصيات لمجلس الإدارة. اكتب باللغة العربية مع ترجمة إنجليزية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "reporting_period", "label": "فترة التقرير", "label_en": "Reporting Period", "type": "text"},
      {"field_name": "compliance_summary", "label": "ملخص حالة الالتزام", "label_en": "Compliance Status Summary", "type": "textarea"},
      {"field_name": "incidents", "label": "الحوادث أو المخالفات", "label_en": "Incidents or Violations", "type": "textarea"}
    ]'::jsonb,
    NOW()
  ),

  -- Fund Prospectus Section
  (
    'e5f6a7b8-c9d0-5e1f-2a3b-4c5d6e7f8a9b',
    'قسم نشرة إصدار الصندوق',
    'Fund Prospectus Section',
    'fund_prospectus',
    'إنشاء أقسام الالتزام في نشرة إصدار الصندوق وفقاً لمتطلبات هيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بإنشاء أقسام الالتزام التنظيمي لنشرة إصدار الصندوق الاستثماري '
    'متوافقة مع لائحة صناديق الاستثمار الصادرة عن هيئة السوق المالية '
    'بالتفاصيل التالية:\n\n'
    'اسم الصندوق: {fund_name}\n'
    'نوع الصندوق: {fund_type}\n'
    'اسم مدير الصندوق: {manager_name}\n'
    'استراتيجية الاستثمار: {investment_strategy}\n\n'
    'يجب أن تتضمن الأقسام الإفصاحات المطلوبة، وعوامل المخاطر، '
    'والبيانات التنظيمية وفقاً للائحة صناديق الاستثمار لهيئة السوق المالية. '
    'اكتب الوثيقة باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية.',
    '[
      {"field_name": "fund_name", "label": "اسم الصندوق", "label_en": "Fund Name", "type": "text"},
      {"field_name": "fund_type", "label": "نوع الصندوق", "label_en": "Fund Type", "type": "select", "options": ["public", "private"]},
      {"field_name": "manager_name", "label": "اسم مدير الصندوق", "label_en": "Manager Name", "type": "text"},
      {"field_name": "investment_strategy", "label": "استراتيجية الاستثمار", "label_en": "Investment Strategy", "type": "textarea"}
    ]'::jsonb,
    NOW()
  ),

  -- CMA Reporting Form
  (
    'f6a7b8c9-d0e1-5f2a-3b4c-5d6e7f8a9b0c',
    'نموذج تقارير هيئة السوق المالية',
    'CMA Reporting Form',
    'cma_form',
    'إنشاء نماذج التقارير التنظيمية لهيئة السوق المالية',
    'أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). '
    'قم بملء نموذج التقارير التنظيمية لهيئة السوق المالية '
    'بالبيانات والتفاصيل التالية:\n\n'
    'اسم الشركة: {company_name}\n'
    'نوع النموذج: {form_type}\n'
    'فترة التقرير: {reporting_period}\n'
    'ملخص البيانات: {data_summary}\n\n'
    'يجب أن يتوافق النموذج مع التنسيق والمتطلبات المحددة من قبل هيئة السوق المالية، '
    'بما في ذلك جميع الحقول الإلزامية والإفصاحات المطلوبة. '
    'اكتب النموذج باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية.',
    '[
      {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
      {"field_name": "form_type", "label": "نوع النموذج", "label_en": "Form Type", "type": "text"},
      {"field_name": "reporting_period", "label": "فترة التقرير", "label_en": "Reporting Period", "type": "text"},
      {"field_name": "data_summary", "label": "ملخص البيانات", "label_en": "Data Summary", "type": "textarea"}
    ]'::jsonb,
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Add risk_assessment to the category color map (frontend already handles unknown categories gracefully)
