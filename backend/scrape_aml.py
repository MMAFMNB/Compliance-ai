"""AML.gov.sa scraper: high-risk countries list and publications."""

import logging
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

from database import supabase_admin

logger = logging.getLogger(__name__)

AML_BASE_URL = "https://www.aml.gov.sa"
HIGH_RISK_URL = f"{AML_BASE_URL}/ar-sa/Pages/HighRiskCountries.aspx"
RULES_URL = f"{AML_BASE_URL}/ar-sa/Pages/RulesAndRegulations.aspx"

REQUEST_TIMEOUT = 30
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Mapping of known Arabic country names to English equivalents
_COUNTRY_AR_TO_EN = {
    "إيران": "Iran",
    "كوريا الشمالية": "North Korea",
    "ميانمار": "Myanmar",
    "الجزائر": "Algeria",
    "أنغولا": "Angola",
    "بوليفيا": "Bolivia",
    "بلغاريا": "Bulgaria",
    "الكاميرون": "Cameroon",
    "كوت ديفوار": "Côte d'Ivoire",
    "ساحل العاج": "Côte d'Ivoire",
    "جمهورية الكونغو الديمقراطية": "Democratic Republic of Congo",
    "هايتي": "Haiti",
    "كينيا": "Kenya",
    "الكويت": "Kuwait",
    "لاوس": "Laos",
    "لبنان": "Lebanon",
    "موناكو": "Monaco",
    "ناميبيا": "Namibia",
    "نيبال": "Nepal",
    "بابوا غينيا الجديدة": "Papua New Guinea",
    "جنوب السودان": "South Sudan",
    "سوريا": "Syria",
    "فنزويلا": "Venezuela",
    "فيتنام": "Vietnam",
    "جزر العذراء البريطانية": "British Virgin Islands",
    "اليمن": "Yemen",
    "نيجيريا": "Nigeria",
    "جنوب أفريقيا": "South Africa",
    "تنزانيا": "Tanzania",
    "تركيا": "Turkey",
    "موزمبيق": "Mozambique",
    "كرواتيا": "Croatia",
    "الفلبين": "Philippines",
    "بوركينا فاسو": "Burkina Faso",
    "السنغال": "Senegal",
    "مالي": "Mali",
}


def _fetch_page(url: str) -> str | None:
    """Fetch a page with error handling and browser-like headers."""
    try:
        response = httpx.get(
            url,
            timeout=REQUEST_TIMEOUT,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
            },
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.text
    except httpx.HTTPError:
        logger.exception("Failed to fetch %s", url)
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


def _guess_english_name(arabic_name: str) -> str:
    """Try to map an Arabic country name to its English equivalent."""
    cleaned = arabic_name.strip()
    if cleaned in _COUNTRY_AR_TO_EN:
        return _COUNTRY_AR_TO_EN[cleaned]
    # Return the Arabic name as fallback
    return cleaned


def _extract_countries_from_section(
    elements: list,
    risk_level: str,
    list_type: str = "FATF",
) -> list[dict]:
    """Extract country entries from a list of HTML elements."""
    countries = []
    for el in elements:
        text = el.get_text(strip=True)
        if not text or len(text) < 2:
            continue
        # Skip header-like text or navigation elements
        if any(skip in text for skip in ("FATF", "http", "www.", "اضغط", "المزيد")):
            continue
        country_ar = text.strip("•–- \t\n\r")
        if not country_ar or len(country_ar) < 2:
            continue
        country_en = _guess_english_name(country_ar)
        countries.append({
            "country": country_en,
            "country_ar": country_ar,
            "risk_level": risk_level,
            "list_type": list_type,
        })
    return countries


def scrape_high_risk_countries() -> list[dict]:
    """Scrape the AML.gov.sa High Risk Countries page.

    The page uses a collapsible accordion structure with three risk categories:
    1. Call for Action (highest risk) — e.g. North Korea, Iran
    2. Enhanced Due Diligence — e.g. Myanmar
    3. Enhanced Monitoring — larger list of monitored countries

    Returns list of dicts:
        [{"country": "...", "country_ar": "...", "risk_level": "...", "list_type": "FATF"}]
    """
    html = _fetch_page(HIGH_RISK_URL)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    countries: list[dict] = []

    # The page uses accordion/collapsible sections.
    # Strategy: find all text content and classify by section headers.
    # Look for the main content area first.
    content = soup.select_one("#contentBox") or soup.select_one(".ms-rtestate-field") or soup
    if content is None:
        content = soup

    # Get all text blocks to identify sections
    all_text = content.get_text(separator="\n")
    lines = [line.strip() for line in all_text.split("\n") if line.strip()]

    # State machine: track which risk section we are in
    current_risk = None
    risk_keywords = {
        "call_for_action": [
            "دعوة لاتخاذ إجراء",
            "call for action",
            "خاضعة لدعوة",
            "الخاضعة للمراقبة المعززة ودعوة",
        ],
        "high_risk": [
            "العناية المعززة",
            "enhanced due diligence",
            "خاضعة لتدابير",
        ],
        "monitored": [
            "المراقبة المعززة",
            "enhanced monitoring",
            "الخاضعة للمراقبة",
            "increased monitoring",
        ],
    }

    seen = set()
    for line in lines:
        line_lower = line.lower()

        # Check if this line is a section header
        is_header = False
        for level, keywords in risk_keywords.items():
            for kw in keywords:
                if kw in line_lower or kw in line:
                    current_risk = level
                    is_header = True
                    break
            if is_header:
                break

        if is_header:
            continue

        # If we are inside a risk section, treat non-empty lines as country names
        if current_risk and len(line) >= 2:
            # Skip obvious non-country content
            if any(skip in line for skip in (
                "http", "www.", "FATF", "اضغط", "المزيد", "مجموعة",
                "العمل المالي", "للاطلاع", "يرجى", "ملاحظة", "تاريخ",
                "الرئيسية", "خريطة", "اتصل", "سياسة",
            )):
                continue

            country_ar = line.strip("•–-:. \t\n\r1234567890)(")
            if not country_ar or len(country_ar) < 2:
                continue

            # Deduplicate
            key = (country_ar, current_risk)
            if key in seen:
                continue
            seen.add(key)

            country_en = _guess_english_name(country_ar)
            countries.append({
                "country": country_en,
                "country_ar": country_ar,
                "risk_level": current_risk,
                "list_type": "FATF",
            })

    # If the text-based approach found nothing, fall back to parsing
    # strong/bold elements and list items within the content
    if not countries:
        logger.info("Text-based parsing found no countries, trying element-based fallback")

        # Try list items
        for li in content.select("li"):
            text = li.get_text(strip=True)
            if text and len(text) >= 2 and len(text) <= 60:
                country_ar = text.strip("•–- \t")
                country_en = _guess_english_name(country_ar)
                countries.append({
                    "country": country_en,
                    "country_ar": country_ar,
                    "risk_level": "monitored",
                    "list_type": "FATF",
                })

        # Try bold/strong elements
        for strong in content.select("strong, b"):
            text = strong.get_text(strip=True)
            if text and 2 <= len(text) <= 40:
                country_ar = text.strip("•–- \t")
                if country_ar in _COUNTRY_AR_TO_EN:
                    country_en = _COUNTRY_AR_TO_EN[country_ar]
                    key = (country_ar, "monitored")
                    if key not in seen:
                        seen.add(key)
                        countries.append({
                            "country": country_en,
                            "country_ar": country_ar,
                            "risk_level": "monitored",
                            "list_type": "FATF",
                        })

    logger.info("Scraped %d high-risk countries from AML.gov.sa", len(countries))
    return countries


def save_high_risk_countries(countries: list[dict]) -> int:
    """Upsert high-risk countries into the database.

    Uses ON CONFLICT (country, list_type) to update existing entries.
    Returns count of rows saved.
    """
    if not countries:
        return 0

    rows = [
        {
            "country": c["country"],
            "country_ar": c.get("country_ar"),
            "risk_level": c["risk_level"],
            "list_type": c.get("list_type", "FATF"),
            "last_updated": datetime.utcnow().isoformat(),
        }
        for c in countries
    ]

    saved = 0
    try:
        result = (
            supabase_admin.table("high_risk_countries")
            .upsert(rows, on_conflict="country,list_type")
            .execute()
        )
        saved = len(result.data) if result.data else len(rows)
    except Exception:
        logger.exception("Failed to upsert %d high-risk countries", len(rows))
        return 0

    logger.info("Saved %d high-risk countries to database", saved)
    return saved


def scrape_aml_publications() -> list[dict]:
    """Scrape AML.gov.sa Rules & Regulations page for new PDFs.

    The page lists PDF documents with icpdf.png icons and links.
    Checks against existing alerts to avoid duplicates.

    Returns list of new items found.
    """
    html = _fetch_page(RULES_URL)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    new_items: list[dict] = []

    # Check for WAF block
    page_text = soup.get_text() or ""
    if "requested URL was rejected" in page_text:
        logger.warning("AML rules page returned WAF block — skipping")
        return []

    # Find all PDF links — the page uses <a href="...pdf"> with icpdf.png icons
    pdf_links = soup.select("a[href$='.pdf'], a[href*='.pdf']")

    # Also look for links near PDF icons
    for img in soup.select("img[src*='icpdf']"):
        parent = img.find_parent("a")
        if parent and parent not in pdf_links:
            pdf_links.append(parent)
        # Check siblings
        sibling = img.find_next_sibling("a") or img.find_next("a")
        if sibling and sibling not in pdf_links:
            pdf_links.append(sibling)

    seen_urls: set[str] = set()
    for link in pdf_links:
        href = link.get("href", "")
        title = link.get_text(strip=True)

        if not href:
            continue

        # Normalize URL
        if href.startswith("/"):
            source_url = f"{AML_BASE_URL}{href}"
        elif href.startswith("http"):
            source_url = href
        else:
            continue

        # Deduplicate within this scrape
        if source_url in seen_urls:
            continue
        seen_urls.add(source_url)

        # Skip if already tracked
        if _is_already_tracked(source_url):
            continue

        # Use link text or filename as title
        if not title or len(title) < 5:
            title = href.split("/")[-1].replace(".pdf", "").replace("_", " ")

        doc_type = _classify_aml_doc(title)

        new_items.append({
            "title": title,
            "title_en": title,
            "source_url": source_url,
            "publication_date": None,
            "doc_type": doc_type,
            "source": "aml.gov.sa",
        })

    # Save to alerts table
    if new_items:
        _save_aml_alerts(new_items)

    logger.info("Found %d new AML publications", len(new_items))
    return new_items


def _classify_aml_doc(title: str) -> str:
    """Classify an AML document by its title."""
    title_lower = title.lower()
    if any(w in title_lower for w in ("نظام", "law", "system")):
        return "regulation"
    if any(w in title_lower for w in ("لائحة", "executive regulation", "تنفيذية")):
        return "regulation"
    if any(w in title_lower for w in ("قواعد", "rules", "تعليمات", "instructions")):
        return "guidance"
    if any(w in title_lower for w in ("دليل", "guide", "guidance")):
        return "guidance"
    if any(w in title_lower for w in ("تعميم", "circular")):
        return "circular"
    return "other"


def _save_aml_alerts(items: list[dict]) -> int:
    """Save new AML publication alerts to the database."""
    rows = [
        {
            "title": item.get("title", ""),
            "title_en": item.get("title_en"),
            "source_url": item["source_url"],
            "publication_date": item.get("publication_date"),
            "doc_type": item.get("doc_type", "other"),
            "source": "aml.gov.sa",
            "is_processed": True,
            "is_parsed": False,
        }
        for item in items
    ]

    try:
        supabase_admin.table("alerts").insert(rows).execute()
    except Exception:
        logger.exception("Failed to insert %d AML alerts", len(rows))
        return 0
    return len(rows)


def run_aml_scraper() -> dict:
    """Run the full AML.gov.sa scraper pipeline.

    1. Scrape high-risk countries and upsert to database
    2. Scrape publications for new PDFs and save as alerts

    Returns a summary dict.
    """
    logger.info("Starting AML.gov.sa scraper...")

    # High-risk countries
    countries = scrape_high_risk_countries()
    countries_saved = save_high_risk_countries(countries)

    # Publications
    publications = scrape_aml_publications()

    result = {
        "countries_found": len(countries),
        "countries_saved": countries_saved,
        "publications_found": len(publications),
    }

    logger.info("AML scraper complete: %s", result)
    return result
