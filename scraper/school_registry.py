# -*- coding: utf-8 -*-
"""Declarative school capabilities and official source registry.

Announcement scraping remains owned by ``scrape.py``.  This module only
describes source families and calendar capabilities so new schools can be
added without copying the scraper.
"""
from dataclasses import dataclass, field
from typing import Dict, List


@dataclass(frozen=True)
class CalendarSource:
    url: str
    title_patterns: tuple[str, ...] = ()
    source_type: str = "html_index"


@dataclass(frozen=True)
class SchoolDefinition:
    school_id: str
    name: str
    short_name: str
    base_url: str
    announcement_adapter: str
    calendar_adapter: str
    announcement_sources: tuple[str, ...] = ()
    calendar_sources: tuple[CalendarSource, ...] = ()
    capabilities: Dict[str, bool] = field(default_factory=dict)


SCHOOLS: Dict[str, SchoolDefinition] = {
    "cysh": SchoolDefinition(
        school_id="cysh",
        name="國立嘉義高級中學",
        short_name="嘉中",
        base_url="https://www.cysh.cy.edu.tw",
        announcement_adapter="new-classic-cms",
        calendar_adapter="new-classic-cms-pdf",
        calendar_sources=(CalendarSource(
            "https://www.cysh.cy.edu.tw/p/412-1008-151.php",
            ("115", "114", "行事曆"),
        ),),
        capabilities={"announcements": True, "official_calendar": True},
    ),
    "cygsh": SchoolDefinition(
        school_id="cygsh",
        name="國立嘉義女子高級中學",
        short_name="嘉女",
        base_url="https://www.cygsh.cy.edu.tw",
        announcement_adapter="new-classic-cms",
        calendar_adapter="new-classic-cms-pdf",
        calendar_sources=(CalendarSource(
            "https://www.cygsh.cy.edu.tw/p/412-1013-1827.php",
            ("學年度", "行事曆"),
        ),),
        capabilities={"announcements": True, "official_calendar": True},
    ),
    "fjsh": SchoolDefinition(
        school_id="fjsh",
        name="嘉義市私立輔仁高級中學",
        short_name="輔仁",
        base_url="https://rpage.fjsh.cy.edu.tw",
        announcement_adapter="new-classic-cms",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
}


def get_school(school_id: str) -> SchoolDefinition:
    try:
        return SCHOOLS[str(school_id)]
    except KeyError as exc:
        raise KeyError(f"unsupported school: {school_id}") from exc


def registry_snapshot() -> List[dict]:
    return [{
        "school_id": school.school_id,
        "name": school.name,
        "short_name": school.short_name,
        "announcement_adapter": school.announcement_adapter,
        "calendar_adapter": school.calendar_adapter,
        "capabilities": dict(school.capabilities),
        "calendar_sources": [source.url for source in school.calendar_sources],
    } for school in SCHOOLS.values()]
