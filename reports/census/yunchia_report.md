# 雲嘉地區校網系統普查

- 產生時間：2026-10-27 10:24（台灣時間）
- 學校清單：https://stats.moe.gov.tw/files/school/115/high.csv
- 規則：每校最多 3 個請求、間隔 3 秒；系統辨識全用固定規則。
- 總請求數：66

## 摘要

- 判定：可直接套用 3 校、同系統，需調整 7 校、連不上 17 校、需新 adapter 24 校
- 系統：（連不上） 17、aspnet 9、wordpress 7、ischool 6、new-classic-cms 4、unknown 4、xoops 3、joomla 1

## 嘉義市

| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |
|---|---|---|---|---|---|---|---|
| chsh | 私立嘉華高中 | joomla | 需新 adapter | http://www.chsh.cy.edu.tw/index.php/2012-12-06-10-02-52 |  | 校網連結 | 網址來源:moe+seed；generator=Joomla! - Open Source Content Management |
| cygsh | 國立嘉義女中 | new-classic-cms | 同系統，需調整 | https://www.cygsh.cy.edu.tw/#cmb_16_0 | 4 則／0 有日期 | 首頁找不到 | 網址來源:moe+seed；unit=1013 |
| cyhvs | 國立嘉義家職 | ischool | 同系統，需調整 | https://www.cyhvs.cy.edu.tw/ischool/widget/site_news/main2.php?uid=WID_0_2_204c4ac60298efc8d1a8832e3179debb64642857&maximize=1&allbtn=0 | 0 則／0 有日期 | 首頁找不到 | 網址來源:moe+seed；generator=數位果子iSchool |
| cyivs | 國立嘉義高工 | wordpress | 需新 adapter | https://www.cyivs.cy.edu.tw/announcement/24149/115-1-學期課表/ |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| cysh | 國立嘉義高中 | new-classic-cms | 可直接套用 | https://www.cysh.cy.edu.tw/p/412-1008-5104.php | 15 則／14 有日期（首頁） | 校網頁面（new-classic-cms） | 網址來源:moe+seed；unit=1008 |
| cyvs | 國立嘉義高商 | ischool | 同系統，需調整 | https://www.cyvs.cy.edu.tw/ischool/public/news_view/show.php?nid=14064 | 3 則／0 有日期（首頁） | 校網連結 | 網址來源:moe+seed；跟進轉址 https://www.cyvs.cy.edu.tw/home；generator=數位果子iSchool |
| dwvs | 私立東吳工家 | unknown | 需新 adapter | https://ann.cloud.ncnu.edu.tw/ |  | Google 日曆 | 網址來源:moe |
| fjsh | 私立輔仁高中 | new-classic-cms | 可直接套用 | https://rpage.fjsh.cy.edu.tw/#cmb_1_0 | 42 則／28 有日期 | Google 日曆 | 網址來源:moe+seed；unit=1000；rpage 子網域 |
| hhsh | 私立興華高中 | xoops | 需新 adapter | https://www.hhsh.cy.edu.tw/modules/tadnews/index.php?tag_sn=13 |  | PDF | 網址來源:moe+seed；generator=XOOPS |
| hjgs | 私立宏仁高中 | aspnet | 需新 adapter | https://www.hjgs.cy.edu.tw/news.aspx?nID=49219C54DB822612&getId=BD57515E064D2A5E |  | 校網連結 | 網址來源:moe+seed |
| hnvs | 國立華南高商 | aspnet | 需新 adapter | https://www.hnvs.cy.edu.tw/latestevent/index.asp?Parser=9,3,15 |  | Google 日曆 | 網址來源:moe+seed |
| ligvs | 私立立仁高中 | — | 連不上 |  |  |  | tls_error+timeout；網址來源:moe；https 憑證驗證失敗，改以 http 辨識 |
| ljsh | 嘉義市私立立仁高級中學 | — | 連不上 |  |  |  | dns_error；網址來源:seed |

## 嘉義縣

| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |
|---|---|---|---|---|---|---|---|
| ccjh | 縣立竹崎高中 | new-classic-cms | 可直接套用 | https://www.ccjh.cyc.edu.tw/p/412-1000-117.php | 16 則／13 有日期（首頁） | PDF | 網址來源:moe；unit=1000 |
| cmsh | 私立協同高中 | wordpress | 需新 adapter | https://www.cmsh.cyc.edu.tw/category/news |  | 校網連結 | 網址來源:moe |
| hkash | 國立新港藝術高級中學 | — | 連不上 |  |  |  | dns_error；網址來源:seed |
| mhvs | 國立民雄農工 | xoops | 需新 adapter | https://www.mhvs.cyc.edu.tw/modules/tadnews/page.php |  | 校網連結 | 網址來源:moe+seed；generator=XOOPS |
| nehs | 國立嘉科實驗高中 | ischool | 同系統，需調整 | https://www.nehs.cyc.edu.tw/ischool/widget/site_news/main2.php?uid=WID_0_2_f300a5311f544d7de3ed423c827cda8075cc5822&maximize=1&allbtn=0 | 0 則／0 有日期 | 首頁找不到 | 網址來源:moe；generator=數位果子iSchool |
| sgash | 國立新港藝術高中 | ischool | 同系統，需調整 |  |  | 首頁找不到 | 網址來源:moe；generator=數位果子iSchool |
| tjsh | 嘉義縣私立同濟高級中學 | — | 連不上 |  |  |  | timeout；網址來源:seed |
| tssh | 國立東石高中 | aspnet | 需新 adapter | https://www.tssh.cyc.edu.tw/latestevent/Index.aspx?Parser=9,9,79,46 |  | Google 日曆 | 網址來源:moe+seed |
| wnvs | 私立萬能工商 | unknown | 需新 adapter | https://www.wnvs.cyc.edu.tw/zh-hant/announcements/ |  | 首頁找不到 | 網址來源:moe+seed |
| ycsh | 縣立永慶高中 | xoops | 需新 adapter | https://www.ycsh.cyc.edu.tw/modules/tadnews/page.php?ncsn=57&nsn=6003 |  | 校網連結 | 網址來源:moe；generator=XOOPS |
| yksh | 嘉義縣立永慶高級中學 | — | 連不上 |  |  |  | dns_error；網址來源:seed |

## 雲林縣

| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |
|---|---|---|---|---|---|---|---|
| 163.27.121.3 | 私立大成商工 | — | 連不上 |  |  |  | timeout；網址來源:moe |
| bwjh | 福智高中 | wordpress | 需新 adapter | https://www.bwjh.ylc.edu.tw/category/ann/ |  | 首頁找不到 | 網址來源:moe；generator=WordPress 4.8.25 |
| bwsh | 雲林縣私立福智高級中學 | unknown | 需新 adapter |  |  | 首頁找不到 | tls_error；網址來源:seed；https 憑證驗證失敗，改以 http 辨識 |
| cxhs | 雲林縣私立正心高級中學 | — | 連不上 |  |  |  | dns_error；網址來源:seed |
| dcvs | 雲林縣私立大成高級商工職業學校 | — | 連不上 |  |  |  | dns_error；網址來源:seed |
| ddvs | 私立大德工商 | — | 連不上 |  |  |  | tls_error+timeout；網址來源:moe；https 憑證驗證失敗，改以 http 辨識 |
| dnsh | 縣立斗南高中 | aspnet | 需新 adapter | https://dnsh.ylc.edu.tw/#Group_825615_EayRNesoMM |  | Google 日曆 | 網址來源:moe |
| gwehs | 縣立古坑華德福實驗高級中學 | aspnet | 需新 adapter | https://school.ylc.edu.tw/open-message/094308 |  | 首頁找不到 | 網址來源:moe |
| hlvs | 國立西螺農工 | wordpress | 需新 adapter | https://www.hlvs.ylc.edu.tw/?page_id=63554 |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| hwaivs | 國立虎尾農工 | wordpress | 需新 adapter | https://www.hwaivs.ylc.edu.tw/%e5%bf%ab%e9%80%9f%e9%80%a3%e7%b5%90%e5%8d%80/%e6%95%99%e5%b8%ab%e7%a0%94%e7%bf%92%e5%85%ac%e5%91%8a/ |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| hwsh | 國立虎尾高中 | ischool | 同系統，需調整 | https://www.hwsh.ylc.edu.tw/ischool/widget/site_news/main2.php?uid=WID_0_2_03d0018c3de9208ccd8c3fd63724751b451b410e&maximize=1&allbtn=0 | 0 則／0 有日期 | 校網連結 | 網址來源:moe+seed；跟進轉址 https://www.hwsh.ylc.edu.tw/home；generator=數位果子iSchool |
| mljh | 縣立麥寮高中 | aspnet | 需新 adapter | https://mgr.ylc.edu.tw/ |  | 首頁找不到 | 網址來源:moe+seed |
| nsjh | 縣立蔦松藝術高中 | aspnet | 需新 adapter | https://nsjh.ylc.edu.tw/cl.aspx?n=99398 |  | 校網連結 | 網址來源:moe |
| pksh | 國立北港高中 | — | 連不上 |  |  |  | tls_error；網址來源:moe+seed |
| pkvs | 國立北港農工 | — | 連不上 |  |  |  | tls_error；網址來源:moe+seed |
| shsh | 私立正心高中 | wordpress | 需新 adapter | https://www.shsh.ylc.edu.tw/category/news/ |  | 校網連結 | 網址來源:moe；generator=Redux 4.5.16 |
| svsh | 私立文生高中 | — | 連不上 |  |  |  | timeout；網址來源:moe |
| tdvs | 雲林縣私立大德高級工商職業學校 | — | 連不上 |  |  |  | dns_error；網址來源:seed |
| tkvs | 國立土庫商工 | — | 連不上 |  |  |  | tls_error+connection_error；網址來源:moe+seed；https 憑證驗證失敗，改以 http 辨識 |
| tlhc | 國立斗六家商 | — | 連不上 |  |  |  | tls_error；網址來源:moe+seed |
| tlsh | 國立斗六高中 | wordpress | 需新 adapter | https://www.tlsh.ylc.edu.tw/test-2/ |  | 校網連結 | 網址來源:moe+seed；generator=WordPress |
| tnjh | 雲林縣立斗南高級中學 | — | 連不上 |  |  |  | dns_error；網址來源:seed |
| tsjh | 雲林縣立蔦松藝術高級中學 | — | 連不上 |  |  |  | timeout；網址來源:seed |
| victoria | 雲林縣維多利亞實驗高中 | unknown | 需新 adapter |  |  | 首頁找不到 | 網址來源:moe |
| yfsh | 私立義峰高中 | ischool | 同系統，需調整 | https://www.yfsh.ylc.edu.tw/ischool/widget/site_news/main2.php?uid=WID_0_2_da2c845320272cc836725abf2af73aedb372df31&maximize=1&allbtn=0 | 0 則／0 有日期 | 校網連結 | 網址來源:moe+seed；generator=數位果子iSchool |
| ynhs | 私立永年高中 | aspnet | 需新 adapter | https://www.ynhs.ylc.edu.tw/#idx-tab-0 |  | 首頁找不到 | 網址來源:moe+seed |
| ytjh | 私立揚子高中 | aspnet | 需新 adapter | https://www.ytjh.ylc.edu.tw/teaching/53/117 |  | 校網連結 | 網址來源:moe |

## 名錄取得紀錄

- data.gov.tw 6089: HTTP 200, CSV 13 個
- 名錄 https://stats.moe.gov.tw/files/school/115/high.csv: 目標縣市 42 校
