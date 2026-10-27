# 雲嘉地區校網系統普查

- 產生時間：2026-10-27 10:30（台灣時間）
- 學校清單：https://stats.moe.gov.tw/files/school/115/high.csv
- 規則：每校最多 3 個請求、間隔 3 秒；系統辨識全用固定規則。
- 總請求數：59

## 摘要

- 判定：可直接套用 7 校、同系統，需調整 3 校、連不上 8 校、需新 adapter 23 校
- 系統：aspnet 9、（連不上） 8、wordpress 7、ischool 6、new-classic-cms 4、unknown 3、xoops 3、joomla 1

## 系統家族（同家族可共用一個 adapter）

| 家族 | 校數 | 做法 | 學校 |
|---|---|---|---|
| 連不上 | 8 | 需換來源或請校方協助 | ligvs、dcvs、ddvs、pksh、pkvs、svsh、tkvs、tlhc |
| 單校自建 | 7 | 個別評估 | chsh、dwvs、hjgs、wnvs、victoria、ynhs、ytjh |
| WordPress | 7 | 新 adapter（WordPress RSS／REST，分類各校不同） | cyivs、cmsh、bwjh、hlvs、hwaivs、shsh、tlsh |
| 數位果子 iSchool | 6 | 北港 JSON 做法泛化為 ischool-site-news | cyhvs、cyvs、nehs、sgash、hwsh、yfsh |
| 銳鼎新版 | 4 | 現有 new-classic-cms | cygsh、cysh、fjsh、ccjh |
| 雲林縣網站平台（News.aspx?n=&sms=） | 4 | 新 adapter，一次涵蓋多校 | dnsh、gwehs、mljh、nsjh |
| XOOPS + tadnews | 3 | 新 adapter（tadnews 列表頁或 RSS） | hhsh、mhvs、ycsh |
| ASP 校網（latestevent/index.asp?Parser=） | 2 | 新 adapter | hnvs、tssh |

## 嘉義市

| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |
|---|---|---|---|---|---|---|---|
| chsh | 私立嘉華高中 | joomla | 需新 adapter | http://www.chsh.cy.edu.tw/index.php/2012-12-06-10-02-52 |  | 校網連結 | 網址來源:moe+seed；generator=Joomla! - Open Source Content Management |
| cygsh | 國立嘉義女中 | new-classic-cms | 同系統，需調整 |  | 4 則／0 有日期（首頁） | 首頁找不到 | 網址來源:moe+seed；unit=1013 |
| cyhvs | 國立嘉義家職 | ischool | 可直接套用 | https://www.cyhvs.cy.edu.tw/ischool/widget/site_news/news_query_json.php | 10 則／10 有日期 | 首頁找不到 | 網址來源:moe+seed；generator=數位果子iSchool |
| cyivs | 國立嘉義高工 | wordpress | 需新 adapter | https://www.cyivs.cy.edu.tw/announcement/24149/115-1-學期課表/ |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| cysh | 國立嘉義高中 | new-classic-cms | 可直接套用 | https://www.cysh.cy.edu.tw/p/412-1008-5104.php | 15 則／14 有日期（首頁） | 校網頁面（new-classic-cms） | 網址來源:moe+seed；unit=1008 |
| cyvs | 國立嘉義高商 | ischool | 同系統，需調整 | https://www.cyvs.cy.edu.tw/ischool/public/news_view/show.php?nid=14064 | 3 則／0 有日期（首頁） | 校網連結 | 網址來源:moe+seed；跟進轉址 https://www.cyvs.cy.edu.tw/home；generator=數位果子iSchool |
| dwvs | 私立東吳工家 | unknown | 需新 adapter | https://ann.cloud.ncnu.edu.tw/ |  | Google 日曆 | 網址來源:moe+seed |
| fjsh | 私立輔仁高中 | new-classic-cms | 可直接套用 |  | 42 則／28 有日期（首頁） | Google 日曆 | 網址來源:moe+seed；unit=1000；rpage 子網域 |
| hhsh | 私立興華高中 | xoops | 需新 adapter | https://www.hhsh.cy.edu.tw/modules/tadnews/index.php?tag_sn=13 |  | PDF | 網址來源:moe+seed；generator=XOOPS |
| hjgs | 私立宏仁高中 | aspnet | 需新 adapter | https://www.hjgs.cy.edu.tw/news.aspx?nID=49219C54DB822612&getId=BD57515E064D2A5E |  | 校網連結 | 網址來源:moe+seed |
| hnvs | 國立華南高商 | aspnet | 需新 adapter | https://www.hnvs.cy.edu.tw/latestevent/index.asp?Parser=9,3,15 |  | Google 日曆 | 網址來源:moe+seed |
| ligvs | 私立立仁高中 | — | 連不上 |  |  |  | tls_error+timeout；網址來源:moe+seed；https 憑證驗證失敗，改以 http 辨識 |

## 嘉義縣

| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |
|---|---|---|---|---|---|---|---|
| ccjh | 縣立竹崎高中 | new-classic-cms | 可直接套用 | https://www.ccjh.cyc.edu.tw/p/412-1000-117.php | 16 則／13 有日期（首頁） | PDF | 網址來源:moe+seed；unit=1000 |
| cmsh | 私立協同高中 | wordpress | 需新 adapter | https://www.cmsh.cyc.edu.tw/category/news |  | 校網連結 | 網址來源:moe+seed |
| mhvs | 國立民雄農工 | xoops | 需新 adapter | https://www.mhvs.cyc.edu.tw/modules/tadnews/page.php |  | 校網連結 | 網址來源:moe+seed；generator=XOOPS |
| nehs | 國立嘉科實驗高中 | ischool | 可直接套用 | https://www.nehs.cyc.edu.tw/ischool/widget/site_news/news_query_json.php | 10 則／10 有日期 | 首頁找不到 | 網址來源:moe+seed；generator=數位果子iSchool |
| sgash | 國立新港藝術高中 | ischool | 同系統，需調整 |  |  | 首頁找不到 | 網址來源:moe+seed；generator=數位果子iSchool |
| tssh | 國立東石高中 | aspnet | 需新 adapter | https://www.tssh.cyc.edu.tw/latestevent/Index.aspx?Parser=9,9,79,46 |  | Google 日曆 | 網址來源:moe+seed |
| wnvs | 私立萬能工商 | unknown | 需新 adapter | https://www.wnvs.cyc.edu.tw/zh-hant/announcements/ |  | 首頁找不到 | 網址來源:moe+seed |
| ycsh | 縣立永慶高中 | xoops | 需新 adapter | https://www.ycsh.cyc.edu.tw/modules/tadnews/page.php?ncsn=57&nsn=6003 |  | 校網連結 | 網址來源:moe+seed；generator=XOOPS |

## 雲林縣

| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |
|---|---|---|---|---|---|---|---|
| bwjh | 福智高中 | wordpress | 需新 adapter | https://www.bwjh.ylc.edu.tw/category/ann/ |  | 首頁找不到 | 網址來源:moe+seed；generator=WordPress 4.8.25 |
| dcvs | 私立大成商工 | — | 連不上 |  |  |  | timeout；網址來源:moe+seed |
| ddvs | 私立大德工商 | — | 連不上 |  |  |  | tls_error+timeout；網址來源:moe+seed；https 憑證驗證失敗，改以 http 辨識 |
| dnsh | 縣立斗南高中 | aspnet | 需新 adapter |  |  | Google 日曆 | 網址來源:moe+seed |
| gwehs | 縣立古坑華德福實驗高級中學 | aspnet | 需新 adapter | https://school.ylc.edu.tw/open-message/094308 |  | 首頁找不到 | 網址來源:moe+seed |
| hlvs | 國立西螺農工 | wordpress | 需新 adapter | https://www.hlvs.ylc.edu.tw/?page_id=63554 |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| hwaivs | 國立虎尾農工 | wordpress | 需新 adapter | https://www.hwaivs.ylc.edu.tw/%e5%bf%ab%e9%80%9f%e9%80%a3%e7%b5%90%e5%8d%80/%e6%95%99%e5%b8%ab%e7%a0%94%e7%bf%92%e5%85%ac%e5%91%8a/ |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| hwsh | 國立虎尾高中 | ischool | 可直接套用 | https://www.hwsh.ylc.edu.tw/ischool/widget/site_news/news_query_json.php | 10 則／10 有日期 | 校網連結 | 網址來源:moe+seed；跟進轉址 https://www.hwsh.ylc.edu.tw/home；generator=數位果子iSchool |
| mljh | 縣立麥寮高中 | aspnet | 需新 adapter | https://mgr.ylc.edu.tw/ |  | 首頁找不到 | 網址來源:moe+seed |
| nsjh | 縣立蔦松藝術高中 | aspnet | 需新 adapter | https://nsjh.ylc.edu.tw/cl.aspx?n=99398 |  | 校網連結 | 網址來源:moe+seed |
| pksh | 國立北港高中 | — | 連不上 |  |  |  | tls_error；網址來源:moe+seed |
| pkvs | 國立北港農工 | — | 連不上 |  |  |  | tls_error；網址來源:moe+seed |
| shsh | 私立正心高中 | wordpress | 需新 adapter | https://www.shsh.ylc.edu.tw/category/news/ |  | 校網連結 | 網址來源:moe+seed；generator=Redux 4.5.16 |
| svsh | 私立文生高中 | — | 連不上 |  |  |  | timeout；網址來源:moe+seed |
| tkvs | 國立土庫商工 | — | 連不上 |  |  |  | tls_error+connection_error；網址來源:moe+seed；https 憑證驗證失敗，改以 http 辨識 |
| tlhc | 國立斗六家商 | — | 連不上 |  |  |  | tls_error；網址來源:moe+seed |
| tlsh | 國立斗六高中 | wordpress | 需新 adapter | https://www.tlsh.ylc.edu.tw/test-2/ |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| victoria | 雲林縣維多利亞實驗高中 | unknown | 需新 adapter |  |  | 首頁找不到 | 網址來源:moe+seed |
| yfsh | 私立義峰高中 | ischool | 可直接套用 | https://www.yfsh.ylc.edu.tw/ischool/widget/site_news/news_query_json.php | 10 則／10 有日期 | 校網連結 | 網址來源:moe+seed；generator=數位果子iSchool |
| ynhs | 私立永年高中 | aspnet | 需新 adapter |  |  | 首頁找不到 | 網址來源:moe+seed |
| ytjh | 私立揚子高中 | aspnet | 需新 adapter | https://www.ytjh.ylc.edu.tw/teaching/53/117 |  | 校網連結 | 網址來源:moe+seed |

## 名錄取得紀錄

- data.gov.tw 6089: HTTP 200, CSV 13 個
- 名錄 https://stats.moe.gov.tw/files/school/115/high.csv: 目標縣市 42 校
