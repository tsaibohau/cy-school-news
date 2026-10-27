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
    status: str = "active"
    visible: bool = True


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
        short_name="輔仁高中",
        base_url="https://rpage.fjsh.cy.edu.tw",
        announcement_adapter="new-classic-cms",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "pksh": SchoolDefinition(
        school_id="pksh",
        name="國立北港高級中學",
        short_name="北港高中",
        base_url="https://www.pksh.ylc.edu.tw",
        announcement_adapter="ischool-json",
        calendar_adapter="unavailable",
        announcement_sources=(
            "https://www.pksh.ylc.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a",
        ),
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "ccjh": SchoolDefinition(
        school_id="ccjh",
        name="嘉義縣立竹崎高級中學",
        short_name="竹崎高中",
        base_url="https://www.ccjh.cyc.edu.tw",
        announcement_adapter="new-classic-cms",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "hwsh": SchoolDefinition(
        school_id="hwsh",
        name="國立虎尾高級中學",
        short_name="虎尾高中",
        base_url="https://www.hwsh.ylc.edu.tw",
        announcement_adapter="ischool-json",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "yfsh": SchoolDefinition(
        school_id="yfsh",
        name="雲林縣私立義峰高級中學",
        short_name="義峰高中",
        base_url="https://www.yfsh.ylc.edu.tw",
        announcement_adapter="ischool-json",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "pkvs": SchoolDefinition(
        school_id="pkvs",
        name="國立北港高級農工職業學校",
        short_name="北港農工",
        base_url="https://www.pkvs.ylc.edu.tw",
        announcement_adapter="ischool-json",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "tlhc": SchoolDefinition(
        school_id="tlhc",
        name="國立斗六高級家事商業職業學校",
        short_name="斗六家商",
        base_url="https://www.tlhc.ylc.edu.tw",
        announcement_adapter="ischool-json",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "tlsh": SchoolDefinition(
        school_id="tlsh",
        name="國立斗六高級中學",
        short_name="斗六高中",
        base_url="https://www.tlsh.ylc.edu.tw",
        announcement_adapter="wordpress",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "hlvs": SchoolDefinition(
        school_id="hlvs",
        name="國立西螺高級農工職業學校",
        short_name="西螺農工",
        base_url="https://www.hlvs.ylc.edu.tw",
        announcement_adapter="wordpress",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "hwaivs": SchoolDefinition(
        school_id="hwaivs",
        name="國立虎尾高級農工職業學校",
        short_name="虎尾農工",
        base_url="https://www.hwaivs.ylc.edu.tw",
        announcement_adapter="wordpress",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "shsh": SchoolDefinition(
        school_id="shsh",
        name="雲林縣私立正心高級中學",
        short_name="正心高中",
        base_url="https://www.shsh.ylc.edu.tw",
        announcement_adapter="wordpress",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "bwjh": SchoolDefinition(
        school_id="bwjh",
        name="雲林縣私立福智高級中學",
        short_name="福智高中",
        base_url="https://www.bwjh.ylc.edu.tw",
        announcement_adapter="wordpress",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "dnsh": SchoolDefinition(
        school_id="dnsh",
        name="雲林縣立斗南高級中學",
        short_name="斗南高中",
        base_url="https://dnsh.ylc.edu.tw",
        announcement_adapter="ylc-ccms",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "gwehs": SchoolDefinition(
        school_id="gwehs",
        name="雲林縣立古坑華德福實驗高級中學",
        short_name="古坑華德福",
        base_url="https://gwehs.ylc.edu.tw",
        announcement_adapter="ylc-ccms",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "mljh": SchoolDefinition(
        school_id="mljh",
        name="雲林縣立麥寮高級中學",
        short_name="麥寮高中",
        base_url="https://mljh.ylc.edu.tw",
        announcement_adapter="ylc-ccms",
        calendar_adapter="unavailable",
        capabilities={"announcements": True, "official_calendar": False},
    ),
    "nsjh": SchoolDefinition(
        school_id="nsjh",
        name="雲林縣立蔦松藝術高級中學",
        short_name="蔦松藝術高中",
        base_url="https://nsjh.ylc.edu.tw",
        announcement_adapter="ylc-ccms",
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
        "status": school.status,
        "visible": school.visible,
        "calendar_sources": [source.url for source in school.calendar_sources],
    } for school in SCHOOLS.values()]
