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


def load_system_prompt() -> str:
    with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read()
