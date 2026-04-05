import os
from pathlib import Path
from dotenv import load_dotenv

# Always load .env from the backend directory, regardless of cwd
load_dotenv(Path(__file__).resolve().parent / ".env")

# Anthropic
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
MODEL = os.getenv("MODEL", "claude-sonnet-4-6")

# Embeddings (local model, no API key needed)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-large")

# Supabase
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]

# CORS
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# System prompt — loaded from file at startup
SYSTEM_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "system_prompt.txt")


# ─── CMA.gov.sa Document Sources ────────────────────────────
CMA_SOURCE_NAME = "cma.gov.sa"
CMA_BASE_URL = "https://cma.gov.sa"

# ─── AML.gov.sa Document Sources ────────────────────────────
AML_SOURCE_NAME = "aml.gov.sa"
AML_BASE_URL = "https://www.aml.gov.sa"

# High Risk Countries page (scraped as HTML, not PDF)
AML_HIGH_RISK_COUNTRIES_URL = f"{AML_BASE_URL}/ar-sa/Pages/HighRiskCountries.aspx"

# Pages to check for new publications
AML_RULES_PAGE = f"{AML_BASE_URL}/ar-sa/RulesAndRegulations/Pages/default.aspx"
AML_INSTRUCTIONS_PAGE = f"{AML_BASE_URL}/ar-sa/RulesAndInstructions/Pages/default.aspx"
AML_GUIDANCE_PAGE = f"{AML_BASE_URL}/ar-sa/GuidanceReports/Pages/default.aspx"


def load_system_prompt() -> str:
    with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read()
