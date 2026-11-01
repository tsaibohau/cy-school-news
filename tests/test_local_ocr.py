"""Local OCR regression tests. Requires Tesseract chi_tra + a CJK font."""

from __future__ import annotations

import re
import sys
from difflib import SequenceMatcher
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from local_ocr import extract_ocr_text, languages_ready  # noqa: E402

EXPECTED = "報名表請送交學務處訓育組"


def compact(value: str) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def font_path() -> str:
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKtc-Regular.otf",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise AssertionError("Traditional Chinese test font is not installed")


def make_image() -> Image.Image:
    image = Image.new("RGB", (1500, 260), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(font_path(), 72)
    draw.text((55, 70), EXPECTED, font=font, fill="black")
    return image


def as_png(image: Image.Image) -> bytes:
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def as_scanned_pdf(image: Image.Image) -> bytes:
    stream = BytesIO()
    image.save(stream, format="PDF", resolution=200.0)
    return stream.getvalue()


def similarity(actual: str) -> float:
    return SequenceMatcher(None, compact(EXPECTED), compact(actual)).ratio()


assert languages_ready(), "Tesseract chi_tra+eng must be present for OCR workflow"

png_result = extract_ocr_text(as_png(make_image()), ".png")
assert png_result["parse_status"] == "parsed", png_result
assert png_result["evidence_confidence"] == "sufficient"
assert png_result["ocr_confidence"] >= 55
assert similarity(png_result["text"]) >= 0.60, png_result["text"]

pdf_result = extract_ocr_text(as_scanned_pdf(make_image()), ".pdf")
assert pdf_result["parse_status"] == "parsed", pdf_result
assert pdf_result["evidence_confidence"] == "sufficient"
assert pdf_result["page_count"] == 1
assert pdf_result["ocr_confidence"] >= 55
assert similarity(pdf_result["text"]) >= 0.60, pdf_result["text"]

# Force a normally-readable image below the acceptance threshold. The text must
# remain available, but every searchable snippet must carry an explicit warning
# so the assistant cannot present it as verified evidence.
low_result = extract_ocr_text(as_png(make_image()), ".png", min_confidence=101)
assert low_result["parse_status"] == "parsed", low_result
assert low_result["evidence_confidence"] == "insufficient"
assert low_result["reason"] == "ocr_low_confidence"
assert "證據不足" in low_result["text"]
assert "核對官方原附件" in low_result["text"]
assert EXPECTED[:3] in compact(low_result["text"])

blank = Image.new("RGB", (800, 250), "white")
blank_result = extract_ocr_text(as_png(blank), ".png")
assert blank_result["parse_status"] == "needs_ocr"
assert blank_result["evidence_confidence"] == "insufficient"
assert blank_result["text"] == ""
assert blank_result["reason"] in {"ocr_too_little_text", "ocr_low_confidence"}

print("Local Traditional-Chinese OCR tests passed")


# --- local-ocr-v2: blurry scans, vertical posters, clean-up rules -------------------------
from PIL import ImageFilter  # noqa: E402
from local_ocr import installed_languages, postprocess  # noqa: E402

SCAN_LINES = ["一、報名期間：即日起至115年11月15日止。", "二、參加對象：全國高級中等學校在學學生。"]


def make_blurry_scan() -> Image.Image:
    font = ImageFont.truetype(font_path(), 30)
    image = Image.new("L", (1400, 160), 255)
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(SCAN_LINES):
        draw.text((40, 30 + index * 54), line, font=font, fill=0)
    # half resolution, blurred, washed out: a phone photo of a printed notice
    image = image.resize((700, 80)).filter(ImageFilter.GaussianBlur(0.8))
    return image.point(lambda value: int(70 + value * 0.6))


scan = extract_ocr_text(as_png(make_blurry_scan()), "png", min_confidence=0)
scan_score = SequenceMatcher(None, compact("".join(SCAN_LINES)), compact(scan["text"])).ratio()
assert scan_score >= 0.55, (scan_score, scan["text"])
assert "115年11月15日" in compact(scan["text"]) or "11月15日" in compact(scan["text"]), scan["text"]

if "chi_tra_vert" in installed_languages():
    columns = ["校慶運動會", "十一月二十日", "全校師生參加", "請準時集合"]
    font = ImageFont.truetype(font_path(), 34)
    poster = Image.new("L", (80 * len(columns) + 60, 420), 255)
    draw = ImageDraw.Draw(poster)
    for col, text in enumerate(columns):
        x = 40 + 80 * (len(columns) - 1 - col)
        for row, char in enumerate(text):
            draw.text((x, 30 + row * 42), char, font=font, fill=0)
    vertical = extract_ocr_text(as_png(poster), "png", min_confidence=0)
    vertical_score = SequenceMatcher(None, compact("".join(columns)), compact(vertical["text"])).ratio()
    assert vertical_score >= 0.8, (vertical_score, vertical["text"])

assert postprocess("國 立 嘉 義 115 年 12 月 8 日 (二 ) 至") == "國立嘉義115年12月8日（二）至"
assert postprocess("主 旨 : 獎金 新 臺 幣 30,000 元") == "主旨：獎金新臺幣30,000元"
assert postprocess("民國 1l5 年") == "民國115年", postprocess("民國 1l5 年")
assert postprocess("Tel: 05-2763208 ext 203") == "Tel: 05-2763208 ext 203", "English stays as is"
assert postprocess("獎金 30,00g 元").startswith("獎金30,00g"), "ambiguous look-alikes are not guessed"
print("Local OCR v2 (scan, vertical, clean-up) tests passed")
