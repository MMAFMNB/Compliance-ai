import logging
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from contextlib import asynccontextmanager

from config import FRONTEND_URL

logging.basicConfig(level=logging.INFO)
from chat import router as chat_router
from conversations import router as conversations_router
from auth_routes import router as auth_router
from review import router as review_router
from dashboard import router as dashboard_router
from calendar_routes import router as calendar_router
from docgen import router as docgen_router
from admin_routes import router as admin_router
from feedback import router as feedback_router
from adaptive_prompts import router as adaptive_prompts_router
from knowledge_base import router as knowledge_base_router
from accuracy_tracking import router as accuracy_router

@asynccontextmanager
async def lifespan(app):
    """Start scheduler on startup, stop on shutdown."""
    from scheduler import start_scheduler, stop_scheduler
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="TAM Compliance AI",
    description="CMA Regulatory Compliance Assistant API",
    version="3.0.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "https://tam-compliance-ai-frontend.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers(request: Request) -> dict:
    """Return CORS headers matching the request origin."""
    origin = request.headers.get("origin", "")
    import re
    if origin in ALLOWED_ORIGINS or re.match(r"https://.*\.vercel\.app$", origin):
        return {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
        }
    return {}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions so CORS headers are still returned."""
    logging.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
        headers=_cors_headers(request),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure HTTPException responses also include CORS headers."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=_cors_headers(request),
    )


# ─── Usage tracking middleware ────────────────────────────
# Logs POST/PUT/PATCH/DELETE requests to usage_events for analytics.
# Runs after the response so it never blocks the request.

TRACKED_PREFIXES = (
    "/api/chat", "/api/review", "/api/documents",
    "/api/calendar", "/api/knowledge", "/api/prompts", "/api/accuracy",
)

@app.middleware("http")
async def usage_tracking_middleware(request: Request, call_next):
    response = await call_next(request)
    # Only track mutating or primary-use endpoints on success
    if (
        request.method in ("POST", "PUT", "PATCH", "DELETE")
        and response.status_code < 400
        and any(request.url.path.startswith(p) for p in TRACKED_PREFIXES)
    ):
        # Extract user_id from request state if available (set by auth dependency)
        # We fire-and-forget the insert to avoid slowing the response
        try:
            from database import supabase_admin as _sa
            # Determine event type from the path
            path = request.url.path
            event_type = path.split("/api/")[1].split("/")[0] if "/api/" in path else "unknown"
            _sa.table("usage_events").insert({
                "event_type": event_type,
                "metadata": {"method": request.method, "path": path},
            }).execute()
        except Exception:
            pass  # Never fail the request due to usage tracking
    return response


app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(review_router)
app.include_router(dashboard_router)
app.include_router(calendar_router)
app.include_router(docgen_router)
app.include_router(admin_router)
app.include_router(feedback_router)
app.include_router(adaptive_prompts_router)
app.include_router(knowledge_base_router)
app.include_router(accuracy_router)



@app.get("/")
def health():
    return {"status": "ok", "service": "TAM Compliance AI", "version": "3.0.0"}




if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
