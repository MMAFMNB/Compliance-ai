"""CMA website scraper: detect new circulars, amendments, and publications."""

import logging
import re
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

from database import supabase_admin

logger = logging.getLogger(__name__)

CMA_BASE_URL = "https://cma.gov.sa"
CMA_NEWS_URL_EN = f"{CMA_BASE_URL}/en/MediaCenter/NEWS/Pages/default.aspx"
CMA_CIRCULARS_URL_EN = f"{CMA_BASE_URL}/en/RulesRegulations/CMACirculars/Pages/default.aspx"
CMA_REGULATIONS_URL_EN = f"{CMA_BASE_URL}/en/RulesRegulations/Regulations/Pages/default.aspx"

REQUEST_TIMEOUT = 30
USER_AGENT = "TAM-Compliance-AI/1.0 (+https://tam.capital)"


def _fetch_page(url: str) -> str | None:
    """Fetch a page with error handling."""
    try:
        response = httpx.get(
            url,
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.text
    except httpx.HTTPError:
        logger.exception("Failed to fetch %s", url)
        return None


def _parse_date(date_str: str) -> str | None:
    """Try to parse a date string into YYYY-MM-DD format."""
    for fmt in (
        "%d-%B-%Y",      # 31-March-2026
        "%d %B %Y",      # 31 March 2026
        "%B %d, %Y",     # March 31, 2026
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
    ):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _is_already_tracked(source_url: str) -> bool:
    """Check if we already have an alert for this URL."""
    try:
        result = (
            supabase_admin.table("alerts")
            .select("id")
            .eq("source_url", source_url)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception:
        return False


def scrape_cma_news() -> list[dict]:
    """Scrape the CMA English news page for new publications.

    The CMA news page uses card-based layout with:
    - <div data-id="..."> as card containers
    - <h3> for titles
    - <span class="date"> for publication dates
    - <a href="/en/MediaCenter/NEWS/Pages/CMA_N_XXXX.aspx"> for detail links
    """
    html = _fetch_page(CMA_NEWS_URL_EN)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    new_items = []

    for card in soup.select("[data-id]"):
        h3 = card.select_one("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)
        if not title or len(title) < 10:
            continue

        # Find the detail link
        link = card.select_one("a[href*='/NEWS/Pages/CMA_N_']")
        if not link:
            continue
        href = link.get("href", "")
        if href.startswith("/"):
            source_url = f"{CMA_BASE_URL}{href}"
        elif href.startswith("http"):
            source_url = href
        else:
            continue

        if _is_already_tracked(source_url):
            continue

        # Extract date
        date_el = card.select_one("span.date, .date")
        publication_date = None
        if date_el:
            publication_date = _parse_date(date_el.get_text(strip=True))

        doc_type = _classify_doc_type(title)

        new_items.append({
            "title_en": title,
            "source_url": source_url,
            "publication_date": publication_date,
            "doc_type": doc_type,
        })

    return new_items


def scrape_cma_circulars() -> list[dict]:
    """Scrape the CMA circulars page for new circulars."""
    html = _fetch_page(CMA_CIRCULARS_URL_EN)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    new_items = []

    # Try card-based layout first (same as news)
    for card in soup.select("[data-id]"):
        h3 = card.select_one("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)
        if not title or len(title) < 10:
            continue

        link = card.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        if href.startswith("/"):
            source_url = f"{CMA_BASE_URL}{href}"
        elif href.startswith("http"):
            source_url = href
        else:
            continue

        if _is_already_tracked(source_url):
            continue

        date_el = card.select_one("span.date, .date")
        publication_date = _parse_date(date_el.get_text(strip=True)) if date_el else None

        new_items.append({
            "title_en": title,
            "source_url": source_url,
            "publication_date": publication_date,
            "doc_type": "circular",
        })

    # Fallback: look for direct PDF links
    if not new_items:
        for link in soup.select("a[href*='Circular'], a[href*='.pdf']"):
            href = link.get("href", "")
            title = link.get_text(strip=True)
            if not title or len(title) < 10:
                continue
            if href.startswith("/"):
                source_url = f"{CMA_BASE_URL}{href}"
            elif href.startswith("http"):
                source_url = href
            else:
                continue
            if _is_already_tracked(source_url):
                continue
            new_items.append({
                "title_en": title,
                "source_url": source_url,
                "publication_date": None,
                "doc_type": "circular",
            })

    return new_items


def scrape_cma_regulations() -> list[dict]:
    """Scrape the CMA regulations page for regulation documents and PDFs.

    The regulations page has cards with:
    - <h3> for regulation titles
    - <a href="...pdf"> for direct PDF downloads
    - <span class="date"> for dates
    """
    html = _fetch_page(CMA_REGULATIONS_URL_EN)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    new_items = []

    for card in soup.select("[data-id]"):
        h3 = card.select_one("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)
        if not title or len(title) < 10:
            continue

        # Find the best link — prefer PDF, fallback to any link
        pdf_link = card.select_one("a[href*='.pdf']")
        any_link = card.select_one("a[href]")
        link = pdf_link or any_link
        if not link:
            continue

        href = link.get("href", "")
        if href.startswith("/"):
            source_url = f"{CMA_BASE_URL}{href}"
        elif href.startswith("http"):
            source_url = href
        else:
            continue

        if _is_already_tracked(source_url):
            continue

        date_el = card.select_one("span.date, .date")
        publication_date = _parse_date(date_el.get_text(strip=True)) if date_el else None

        doc_type = _classify_doc_type(title)

        new_items.append({
            "title_en": title,
            "source_url": source_url,
            "publication_date": publication_date,
            "doc_type": doc_type,
        })

    return new_items


def _classify_doc_type(title: str) -> str:
    """Classify a publication by its title."""
    title_lower = title.lower()
    if "circular" in title_lower or "تعميم" in title:
        return "circular"
    if "amend" in title_lower or "تعديل" in title:
        return "amendment"
    if any(w in title_lower for w in ("regulation", "rules", "instructions", "law")):
        return "regulation"
    if "regulation" in title_lower or "لائحة" in title:
        return "regulation"
    if "guidance" in title_lower or "دليل" in title:
        return "guidance"
    if "faq" in title_lower or "أسئلة" in title:
        return "faq"
    return "other"


def save_alerts(items: list[dict]) -> int:
    """Save new alert items to the database. Returns count saved."""
    if not items:
        return 0

    rows = [
        {
            "title": item.get("title_en", item.get("title", "")),
            "title_en": item.get("title_en"),
            "source_url": item["source_url"],
            "publication_date": item.get("publication_date"),
            "doc_type": item["doc_type"],
            "is_processed": False,
        }
        for item in items
    ]

    supabase_admin.table("alerts").insert(rows).execute()
    return len(rows)


def run_scraper(parse_circulars: bool = True) -> dict:
    """Run the full CMA scraper pipeline.

    1. Scrape CMA news, circulars, and regulations pages
    2. Save new alerts to the database
    3. Optionally generate impact summaries and parse obligations

    Returns a summary with counts.
    """
    logger.info("Starting CMA scraper...")

    news_items = scrape_cma_news()
    logger.info("Found %d new news items", len(news_items))

    circular_items = scrape_cma_circulars()
    logger.info("Found %d new circulars", len(circular_items))

    regulation_items = scrape_cma_regulations()
    logger.info("Found %d new regulations", len(regulation_items))

    all_items = news_items + circular_items + regulation_items

    # Deduplicate by URL
    seen_urls = set()
    unique_items = []
    for item in all_items:
        if item["source_url"] not in seen_urls:
            seen_urls.add(item["source_url"])
            unique_items.append(item)

    saved = save_alerts(unique_items)
    logger.info("Saved %d new alerts", saved)

    result = {
        "news_found": len(news_items),
        "circulars_found": len(circular_items),
        "regulations_found": len(regulation_items),
        "total_saved": saved,
        "impact_summaries_generated": 0,
        "obligations_extracted": 0,
    }

    if parse_circulars and saved > 0:
        # Parse circulars for obligations
        try:
            from circular_parser import process_unparsed_alerts
            parse_result = process_unparsed_alerts()
            result["obligations_extracted"] = parse_result["total_obligations"]
            logger.info("Extracted %d obligations", parse_result["total_obligations"])
        except Exception:
            logger.exception("Failed to parse obligations")

    return result
