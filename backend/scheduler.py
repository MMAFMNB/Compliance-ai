"""Daily scheduler: scrape CMA, process alerts, extract deadlines."""

import logging

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def daily_scrape_job():
    """Full daily pipeline: scrape → impact summaries → parse obligations → extract deadlines."""
    logger.info("=== Daily scraper job started ===")
    try:
        from scraper import run_scraper
        result = run_scraper(parse_circulars=True)
        logger.info("Scraper result: %s", result)

        # After obligations are extracted, sync deadlines to the calendar
        deadlines_added = sync_obligations_to_deadlines()
        result["deadlines_added"] = deadlines_added
        logger.info("=== Daily scraper job finished: %s ===", result)
        return result
    except Exception:
        logger.exception("Daily scraper job failed")
        return {}


def sync_obligations_to_deadlines() -> int:
    """Convert regulatory obligations with deadline_date into calendar deadlines.

    Only creates deadlines for obligations that have a concrete date and
    haven't already been added (dedup by obligation ID stored in cma_reference).
    """
    from database import supabase_admin

    # Get obligations that have a deadline_date set
    try:
        result = (
            supabase_admin.table("regulatory_obligations")
            .select("id, obligation, obligation_en, deadline_date, category, alert_id, priority")
            .not_.is_("deadline_date", "null")
            .execute()
        )
    except Exception:
        logger.exception("Failed to fetch obligations for deadline sync")
        return 0

    if not result.data:
        return 0

    # Get existing deadline references to avoid duplicates
    try:
        existing = (
            supabase_admin.table("deadlines")
            .select("cma_reference")
            .like("cma_reference", "obligation:%")
            .execute()
        )
        existing_refs = {row["cma_reference"] for row in existing.data}
    except Exception:
        existing_refs = set()

    # Map obligation categories to deadline categories
    CATEGORY_MAP = {
        "reporting": "quarterly_report",
        "aml_kyc": "aml",
        "governance": "board_notification",
        "disclosure": "annual_report",
        "fund_report": "fund_report",
    }

    new_deadlines = []
    for ob in result.data:
        ref = f"obligation:{ob['id']}"
        if ref in existing_refs:
            continue

        category = CATEGORY_MAP.get(ob.get("category", ""), "other")

        new_deadlines.append({
            "title": ob.get("obligation", "")[:200],
            "title_en": (ob.get("obligation_en") or "")[:200] or None,
            "description": f"التزام تنظيمي مستخرج من تنبيه رقم {ob.get('alert_id', '')}",
            "deadline_date": ob["deadline_date"],
            "category": category,
            "frequency": "one_time",
            "is_recurring": False,
            "cma_reference": ref,
        })

    if not new_deadlines:
        return 0

    try:
        supabase_admin.table("deadlines").insert(new_deadlines).execute()
        logger.info("Added %d deadlines from regulatory obligations", len(new_deadlines))
    except Exception:
        logger.exception("Failed to insert obligation-based deadlines")
        return 0

    return len(new_deadlines)


def start_scheduler():
    """Start the background scheduler with the daily scrape job."""
    if scheduler.running:
        logger.info("Scheduler already running")
        return

    # Run daily at 06:00 AM (Saudi Arabia time, UTC+3 → 03:00 UTC)
    scheduler.add_job(
        daily_scrape_job,
        "cron",
        hour=3,
        minute=0,
        id="daily_cma_scrape",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started — daily scrape job scheduled at 06:00 AST (03:00 UTC)")


def stop_scheduler():
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
