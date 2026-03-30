import logging

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import supabase, supabase_admin
from models import (
    SignUpRequest,
    CreateProfileRequest,
    SignInRequest,
    RefreshTokenRequest,
    UpdateProfileRequest,
    UserProfile,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/signup")
def signup(request: SignUpRequest):
    """Register a new user via Supabase Auth and create a profile row."""
    try:
        auth_response = supabase.auth.sign_up(
            {"email": request.email, "password": request.password}
        )
    except Exception as e:
        logger.exception("Supabase signup error")
        raise HTTPException(status_code=400, detail="Signup failed")

    if not auth_response.user:
        raise HTTPException(status_code=400, detail="Signup failed")

    # Create profile in our users table
    try:
        supabase_admin.table("users").insert(
            {
                "id": auth_response.user.id,
                "email": request.email,
                "name": request.name,
                "organization": request.organization,
                "language_pref": request.language_pref.value,
            }
        ).execute()
    except Exception:
        logger.exception("Failed to create user profile row after signup")
        # Auth user exists but profile row failed — still return success
        # so the user can sign in (get_current_user handles missing profiles)

    return {
        "user_id": auth_response.user.id,
        "email": request.email,
        "message": "Account created. Check your email for confirmation.",
    }


@router.post("/profile")
def create_profile(request: CreateProfileRequest):
    """Create a profile row for an already-registered Supabase auth user.

    Called by the frontend after Supabase client-side signup succeeds.
    This avoids the double-signup issue where both frontend and backend
    call supabase.auth.sign_up().
    """
    try:
        supabase_admin.table("users").insert(
            {
                "id": request.user_id,
                "email": request.email,
                "name": request.name,
                "organization": request.organization,
                "language_pref": request.language_pref.value,
            }
        ).execute()
    except Exception:
        logger.exception("Failed to create user profile row")
        raise HTTPException(status_code=400, detail="Failed to create profile")

    return {"status": "created", "user_id": request.user_id}


@router.post("/logout")
def logout(user: dict = Depends(get_current_user)):
    """Log out the current user.

    With JWT-based auth the actual session invalidation happens client-side
    via Supabase. This endpoint exists for audit logging and future
    server-side session revocation.
    """
    logger.info("User %s logged out", user.get("id"))
    return {"status": "logged_out"}


@router.post("/signin")
def signin(request: SignInRequest):
    """Sign in and return access + refresh tokens."""
    try:
        auth_response = supabase.auth.sign_in_with_password(
            {"email": request.email, "password": request.password}
        )
    except Exception as e:
        logger.exception("Supabase signin error")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not auth_response.session or not auth_response.user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "access_token": auth_response.session.access_token,
        "refresh_token": auth_response.session.refresh_token,
        "expires_in": auth_response.session.expires_in,
        "user": {
            "id": auth_response.user.id,
            "email": auth_response.user.email,
        },
    }


@router.post("/refresh")
def refresh(request: RefreshTokenRequest):
    """Refresh an expired access token."""
    try:
        auth_response = supabase.auth.refresh_session(request.refresh_token)
    except Exception as e:
        logger.exception("Supabase refresh error")
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if not auth_response.session:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return {
        "access_token": auth_response.session.access_token,
        "refresh_token": auth_response.session.refresh_token,
        "expires_in": auth_response.session.expires_in,
    }


@router.get("/me", response_model=UserProfile)
def get_profile(user: dict = Depends(get_current_user)):
    """Get the current user's profile."""
    return UserProfile(
        id=user["id"],
        email=user["email"],
        name=user.get("name", ""),
        organization=user.get("organization", ""),
        role=user.get("role", "compliance_officer"),
        firm_id=user.get("firm_id"),
        language_pref=user.get("language_pref", "ar"),
    )


@router.patch("/me")
def update_profile(
    request: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    """Update the current user's profile."""
    updates = request.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Convert enum to string for database
    if "language_pref" in updates:
        updates["language_pref"] = updates["language_pref"].value

    supabase_admin.table("users").update(updates).eq("id", user["id"]).execute()
    return {"status": "updated"}
