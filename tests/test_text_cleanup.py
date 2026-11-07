# -*- coding: utf-8 -*-
"""text_cleanup 測試(離線、全為虛構句子)。可單獨執行,也由 tests/test_parser.py 呼叫 run()。"""
import sys
import zipfile
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
from text_cleanup import (clean_text, clean_pages, remove_repeated_lines,  # noqa: E402
                          normalize_width, is_garbage_line)

# 完全不應被改動的文字
UNCHANGED = [
    "活動時間：12:30 至 14:00",
    "請上網 https://example.com/path/a.b?x=1&y=2 報名",
    "連結 http://www.example.org:8080/index.html 備查",
    "費用為 1.5 倍，另加 0.25 元",
    "（一）報名時間：115年11月3日。",
    "（二）地點：圖書館三樓",
    "115年11月3日（星期二）上午8:10",
    "聯絡信箱 someone.name@example.edu.tw",
    "請填寫「報名表」與『同意書』。",
    "1. 準時到校",
    "Wi-Fi 帳號 guest_01",
    "2026-11-07 公告",
    "報名 Google 表單",
    "張三 95",
    "王小明 88 李小華 92",
    "國文 85 數學 90",
    "電話 (05) 123-4567 分機 12",
]

# (輸入, 期望輸出)
CASES = [
    ("報 名 時 間", "報名時間"),
    ("一 、 報 名 時 間 ： １１３ 年 ９ 月 １ 日 起", "一、報名時間：113年9月1日起"),
    ("ＡＢＣ１２３", "ABC123"),
    ("甲　乙", "甲乙"),
    ("​報‌名﻿", "報名"),
    ("⼀⾦", "一金"),
    ("請於期限內，，、完成。。", "請於期限內，完成。"),
    ("注意：，事項", "注意：事項"),
    ("目錄............................3", "目錄 3"),
    ("目錄 . . . . . . . 3", "目錄 3"),
    ("第一章……………5", "第一章 5"),
    ("────────────\n正文內容在此", "正文內容在此"),
    ("====================", ""),
    ("主旨:請於期限內回覆", "主旨：請於期限內回覆"),
    ("說明;如下", "說明；如下"),
    ("請攜帶文具,並準時到校", "請攜帶文具，並準時到校"),
    ("共 113 年 9 月", "共113年9月"),
    ("113 年 9 月 1 日", "113年9月1日"),
    ("第 3 屆", "第3屆"),
    ("共 5 名", "共5名"),
    ("民國 115 年", "民國115年"),
    ("301 班 35 人", "301班 35人"),
    ("張三\t\t95", "張三 95"),
    ("王小明   88", "王小明 88"),
    ("，，，", ""),
    ("- 3 -", ""),
    ("第 3 頁", ""),
    ("第 3 頁,共 8 頁", ""),
    ("3/8", ""),
    ("| _ |", ""),
    ("l |", ""),
    ("※※ ##", ""),
]


def check(label, got, want):
    assert got == want, f"{label}: {got!r} != {want!r}"


def run():
    for text in UNCHANGED:
        check("unchanged", clean_text(text), text)
    print("✓ text_cleanup: 不該改的文字維持原樣(時間/網址/小數/（一）/日期/email/「」)")

    for text, want in CASES:
        check(text, clean_text(text), want)
    print(f"✓ text_cleanup: {len(CASES)} 個清理案例")

    # 全形標點必須維持全形(不可整段 NFKC)
    punct = "測試，內容！真的？是：對；（括號）…①"
    check("fullwidth punct kept", normalize_width(punct), punct)
    check("fullwidth punct kept 2", clean_text(punct), punct)
    print("✓ text_cleanup: 中文全形標點不被 NFKC 破壞")

    for text, _ in [c for c in CASES if "..." not in c[0] and ". ." not in c[0] and "……" not in c[0]]:
        once = clean_text(text)
        check("idempotent", clean_text(once), once)
    print("✓ text_cleanup: 冪等")

    # 斷行合併:前行夠長且下一行非條列才接
    wrapped = ("本校將於下週辦理校園環境整理活動，請各班導師協助通知同學準備相關清潔用具並於\n"
               "當日準時到場參加，活動結束後請回報負責老師。\n"
               "一、活動時間：下週三第五節\n"
               "二、活動地點：各班級教室")
    want = ("本校將於下週辦理校園環境整理活動，請各班導師協助通知同學準備相關清潔用具並於"
            "當日準時到場參加，活動結束後請回報負責老師。\n"
            "一、活動時間：下週三第五節\n二、活動地點：各班級教室")
    check("unwrap", clean_text(wrapped), want)
    short = "報名日期至十一月五日止\n請準時繳交"
    check("short lines kept", clean_text(short), short)
    for nxt in ["（一）第一項", "1. 第一項", "第五條第一項", "※注意事項", "主旨：測試",
                "說明：測試", "承辦人：王小明"]:
        text = "本校將於下週辦理校園環境整理活動並請各班導師協助通知同學準備相關用具\n" + nxt
        check("no join before " + nxt, clean_text(text).split("\n")[-1], nxt)
    stop = "本校將於下週辦理校園環境整理活動並請各班導師協助通知同學準備相關用具。\n另請注意安全"
    check("no join after period", clean_text(stop), stop)
    check("unwrap off", clean_text(wrapped, unwrap=False).count("\n"), 3)
    print("✓ text_cleanup: 斷行合併規則")

    # 標記行與表格列保留
    check("marker kept", clean_text("[OCR 第 1 頁]\n內容文字"), "[OCR 第 1 頁]\n內容文字")
    check("sheet marker kept",
          clean_text("[工作表：名單]\n甲 | 乙 | 12:30", unwrap=False, aggressive=False),
          "[工作表：名單]\n甲 | 乙 | 12:30")
    check("1. marker line kept", clean_text("1.\n準時到校"), "1.\n準時到校")
    assert is_garbage_line("") and is_garbage_line("。。。") and not is_garbage_line("通知")
    print("✓ text_cleanup: 標記行/條列標記保留")

    # 跨頁頁首頁尾
    bodies = ["甲組比賽辦法說明", "乙組報名資格說明", "丙組場地安排事項", "丁組注意事項彙整"]
    pages = [f"嘉義市某某學校公告\n第一行{b}\n第二行{b}\n第三行{b}\n第四行{b}\n第 {n} 頁" for n, b in enumerate(bodies, 1)]
    out = remove_repeated_lines(pages)
    assert all("某某學校公告" not in p and "第 " not in p for p in out), out
    assert all(f"第一行{b}" in p and f"第四行{b}" in p for b, p in zip(bodies, out)), out
    assert remove_repeated_lines(pages[:2]) == pages[:2]
    cleaned = clean_pages(pages)
    assert cleaned[0].startswith("第一行甲組比賽辦法說明") and "公告" not in cleaned[0], cleaned
    print("✓ text_cleanup: 跨頁頁首頁尾移除")

    # 整合:Office 文件
    from attachment_parser import extract_embedded_text
    xml = ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
           '<w:p><w:r><w:t>報 名 時 間 ： １１５ 年 １１ 月</w:t></w:r></w:p>'
           '<w:p><w:r><w:t>目錄........3</w:t></w:r></w:p></w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("word/document.xml", xml)
    result = extract_embedded_text(buf.getvalue(), ".docx")
    check("docx integration", result["text"], "報名時間：115年11月\n目錄 3")
    print("✓ text_cleanup: attachment_parser 整合")
    return True


if __name__ == "__main__":
    run()
    print("\ntext_cleanup 測試通過 ✅")
