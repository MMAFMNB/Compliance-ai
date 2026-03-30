"""Shared Anthropic API utilities with retry logic."""

import logging
import random
import time

import anthropic

from config import ANTHROPIC_API_KEY, MODEL

logger = logging.getLogger(__name__)

# Shared client instance
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def call_anthropic(
    messages: list,
    system: str | None = None,
    max_tokens: int = 4096,
    model: str | None = None,
    retries: int = 5,
    **kwargs,
) -> anthropic.types.Message:
    """Call Anthropic API with exponential backoff on rate limits and transient errors.

    Args:
        messages: List of message dicts for the API.
        system: Optional system prompt.
        max_tokens: Maximum tokens to generate.
        model: Model override (defaults to config MODEL).
        retries: Number of retry attempts.
        **kwargs: Additional args passed to messages.create().

    Returns:
        The full Anthropic Message response object.

    Raises:
        anthropic.RateLimitError: After all retries exhausted.
        anthropic.APIStatusError: For non-transient server errors.
    """
    create_kwargs = {
        "model": model or MODEL,
        "max_tokens": max_tokens,
        "messages": messages,
        **kwargs,
    }
    if system:
        create_kwargs["system"] = system

    for attempt in range(retries):
        try:
            return client.messages.create(**create_kwargs)
        except anthropic.RateLimitError:
            if attempt < retries - 1:
                base_wait = min(10 * (2 ** attempt), 120)
                wait = base_wait + random.uniform(0, base_wait * 0.3)
                logger.warning(
                    "Rate limited — retrying in %.0fs (attempt %d/%d)",
                    wait, attempt + 2, retries,
                )
                time.sleep(wait)
            else:
                logger.error("Rate limit exceeded after %d retries", retries)
                raise
        except anthropic.APIConnectionError:
            if attempt < retries - 1:
                wait = 5 * (attempt + 1) + random.uniform(0, 3)
                logger.warning("Connection error — retrying in %.0fs", wait)
                time.sleep(wait)
            else:
                raise
        except anthropic.APIStatusError as e:
            if e.status_code in (500, 502, 503, 529) and attempt < retries - 1:
                wait = 10 * (2 ** attempt) + random.uniform(0, 5)
                logger.warning(
                    "API error %d — retrying in %.0fs", e.status_code, wait
                )
                time.sleep(wait)
            else:
                raise
