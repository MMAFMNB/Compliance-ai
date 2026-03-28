import logging

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import SUPABASE_URL, SUPABASE_JWT_SECRET
from database import supabase_admin

logger = logging.getLogger(__name__)

security = HTTPBearer()

AUDIENCE = "authenticated"

# Supabase JWKS endpoint for ES256 (asymmetric) key verification
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(JWKS_URL, cache_keys=True)
    return _jwks_client


def decode_jwt(token: str) -> dict:
    """Decode and validate a Supabase JWT.

    Tries JWKS (ES256) first, falls back to shared secret (HS256)
    for backwards compatibility.
    """
    # Inspect token header to determine algorithm
    try:
        header = jwt.get_unverified_header(token)
        logger.info("JWT header: alg=%s, kid=%s", header.get("alg"), header.get("kid"))
    except Exception:
        logger.exception("Failed to decode JWT header")

    # Try asymmetric verification via JWKS (ES256)
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience=AUDIENCE,
        )
        logger.info("JWT validated via JWKS (ES256) for user %s", payload.get("sub"))
        return payload
    except Exception as jwks_err:
        logger.warning("JWKS verification failed: %s", jwks_err)

    # Fall back to symmetric HS256 with shared secret
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=AUDIENCE,
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from the Authorization header.

    Returns a dict with at least 'id' and 'email' from the JWT claims.
    Also fetches the user profile from the database if it exists.
    """
    payload = decode_jwt(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: no subject",
        )

    # Fetch profile from our users table
    try:
        result = (
            supabase_admin.table("users")
            .select("*")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception:
        logger.debug("No profile row found for user %s", user_id)

    # Return minimal info from JWT if no profile row yet
    return {
        "id": user_id,
        "email": payload.get("email", ""),
        "name": "",
        "organization": "",
        "role": "compliance_officer",
        "language_pref": "ar",
    }
