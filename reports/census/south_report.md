# 台南市、高雄市校網普查與來源實測

- 產生時間：2026-11-01 18:00（台灣時間）
- 學校清單：https://stats.moe.gov.tw/files/school/115/high.csv
- 規則：每校最多 6 個請求、間隔 3 秒；系統辨識與判定全用固定規則。
- 總請求數：194

## 摘要

- 判定：可上架 24 校、同系統，需調整 26 校、連不上 13 校、需新 adapter 34 校
- 系統：aspnet 18、ischool 18、（連不上） 13、wordpress 12、new-classic-cms 9、unknown 8、nuweb 7、xoops 7、ccms 2、asp-parser 2、frameset 1

## 臺南市（44 校）

| 代碼 | 學校 | 系統 | 判定 | 最佳來源 | 實測 | 備註 |
|---|---|---|---|---|---|---|
| asvs | 私立亞洲餐旅 | — | 連不上 |  |  | connection_error |
| bmsh | 國立北門高中 | nuweb | 需新 adapter |  |  |  |
| ccsh | 國立家齊高中 | aspnet | 需新 adapter |  |  |  |
| cjshs | 私立長榮高中 | new-classic-cms | 同系統，需調整 | http://www.cjshs.tn.edu.tw/ | 11 則／0 有日期／最新  |  |
| ckgsh | 私立長榮女中 | — | 連不上 |  |  | timeout |
| ctbchs | 臺南市中信國際高中 | wordpress | 同系統，需調整 | https://ctbchs.tn.edu.tw/feed/ | 0 則／0 有日期／最新  |  |
| dwhs | 市立大灣高中 | xoops | 同系統，需調整 | http://www.dwhs.tn.edu.tw/modules/tadnews/rss.php | 0 則／0 有日期／最新  |  |
| hhvs | 國立新化高工 | ischool | 同系統，需調整 | http://www.hhvs.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_9d81afa | 0 則／0 有日期／最新  |  |
| hpsh | 國立後壁高中 | ischool | 同系統，需調整 | http://www.hpsh.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_79336d3 | 0 則／0 有日期／最新  |  |
| hyivs | 國立新營高工 | ischool | 可上架 | https://www.hyivs.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_da817 | 30 則／30 有日期／最新 2026-11-01 |  |
| hysh | 國立新營高中 | ischool | 可上架 | https://www.hysh.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_bcdf75 | 30 則／30 有日期／最新 2026-10-31 |  |
| khgs | 臺南市光華高中 | frameset | 需新 adapter |  |  |  |
| kmsh | 私立港明高中 | — | 連不上 |  |  | timeout |
| ksis | 臺南市崑山高中 | new-classic-cms | 可上架 | https://www.ksis.tn.edu.tw/ | 21 則／13 有日期／最新 2026-10-29 |  |
| lhvs | 私立六信高中 | unknown | 需新 adapter |  |  |  |
| lmsh | 私立黎明高中 | ischool | 同系統，需調整 | http://www.lmsh.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_c7825b9 | 0 則／0 有日期／最新  |  |
| mdsh | 私立明達高中 | — | 連不上 |  |  | dns_error |
| nkhs | 私立南光高中 | nuweb | 需新 adapter |  |  |  |
| nnjh | 市立南寧高中 | xoops | 同系統，需調整 | http://www.nnjh.tn.edu.tw/modules/tadnews/rss.php | 0 則／0 有日期／最新  |  |
| nnkieh | 國立南科國際實驗高中 | ischool | 可上架 | http://www.nnkieh.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_c4063 | 30 則／30 有日期／最新 2026-10-29 |  |
| nyvs | 私立南英商工 | aspnet | 需新 adapter |  |  |  |
| phvs | 國立白河商工 | ischool | 同系統，需調整 |  |  |  |
| pmai | 國立北門農工 | wordpress | 可上架 | http://www.pmai.tn.edu.tw/feed/ | 12 則／12 有日期／最新 2026-10-30 |  |
| ptivs | 國立成大附屬南工 | ischool | 可上架 | https://www.ptivs.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_22749 | 30 則／30 有日期／最新 2026-10-30 |  |
| sfsh | 國立新豐高中 | ischool | 同系統，需調整 | http://www.sfsh.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_0a34fb9 | 0 則／0 有日期／最新  |  |
| skgsh | 財團法人聖功女中 | aspnet | 需新 adapter |  |  |  |
| slsh | 市立沙崙國際高中 | ccms | 同系統，需調整 | https://www.slsh.tn.edu.tw/ | 0 則／0 有日期／最新  |  |
| ssvs | 私立慈幼工商 | — | 連不上 |  |  | timeout |
| tcjh | 市立土城高中 | xoops | 同系統，需調整 | http://www.tcjh.tn.edu.tw/modules/tadnews/rss.php | 0 則／0 有日期／最新  |  |
| tcsh | 財團法人慈濟高中 | aspnet | 需新 adapter |  |  |  |
| tkgsh | 私立德光高中 | — | 連不上 |  |  | timeout |
| tncvs | 國立臺南高商 | asp-parser | 可上架 | https://www.tncvs.tn.edu.tw/latestevent/index.asp?Parser=9,3,15 | 15 則／15 有日期／最新 2026-10-31 |  |
| tnfsh | 國立臺南一中 | asp-parser | 同系統，需調整 |  |  |  |
| tngs | 國立臺南女中 | wordpress | 可上架 | http://www.tngs.tn.edu.tw/feed/ | 10 則／10 有日期／最新 2026-10-31 |  |
| tnssh | 國立臺南二中 | wordpress | 可上架 | https://www.tnssh.tn.edu.tw/feed/ | 10 則／10 有日期／最新 2026-10-31 |  |
| tntcsh | 國立臺南大學附中 | ischool | 同系統，需調整 |  |  |  |
| tnvs | 國立臺南海事 | wordpress | 可上架 | https://www.tnvs.tn.edu.tw/feed/ | 10 則／10 有日期／最新 2026-10-28 |  |
| twivs | 國立曾文農工 | ischool | 可上架 | https://www.twivs.tn.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_77d06 | 30 則／30 有日期／最新 2026-10-30 |  |
| twvs | 國立曾文家商 | wordpress | 可上架 | http://www.twvs.tn.edu.tw/feed/ | 10 則／10 有日期／最新 2026-10-30 |  |
| ycvs | 國立玉井工商 | aspnet | 需新 adapter |  |  |  |
| yhsh | 私立瀛海國際高中 | ischool | 同系統，需調整 |  |  |  |
| ymvs | 私立陽明工商 | — | 連不上 |  |  | timeout |
| yrhs | 市立永仁高中 | ischool | 同系統，需調整 |  |  |  |
| ytvs | 私立育德工家 | unknown | 需新 adapter |  |  |  |

## 高雄市（53 校）

| 代碼 | 學校 | 系統 | 判定 | 最佳來源 | 實測 | 備註 |
|---|---|---|---|---|---|---|
| cchs | 市立中正高中 | ischool | 同系統，需調整 | http://www.cchs.kh.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_d858f68 | 0 則／0 有日期／最新  |  |
| ccvs | 市立中正高工 | new-classic-cms | 同系統，需調整 | http://www.ccvs.kh.edu.tw/ | 5 則／0 有日期／最新  |  |
| charts | 私立中華藝校 | unknown | 需新 adapter |  |  |  |
| cjhs | 市立前鎮高中 | nuweb | 需新 adapter |  |  |  |
| cm.cmvsedu.tw | 私立旗美商工 | xoops | 可上架 | https://cm.cmvsedu.tw/modules/tadnews/rss.php | 19 則／19 有日期／最新 2026-10-16 |  |
| cshs | 市立中山高中 | aspnet | 需新 adapter |  |  |  |
| dmhs | 天主教道明中學 | unknown | 需新 adapter |  |  |  |
| dystcs | 私立大榮高中 | xoops | 可上架 | https://www.dystcs.kh.edu.tw/modules/tadnews/rss.php | 20 則／20 有日期／最新 2026-10-29 |  |
| fhhs | 私立復華高中 | unknown | 需新 adapter |  |  |  |
| ftm | 市立福誠高中 | aspnet | 需新 adapter |  |  |  |
| hchs | 市立新莊高中 | wordpress | 同系統，需調整 | https://www.hchs.kh.edu.tw/feed/ | 0 則／0 有日期／最新  |  |
| hcvs | 市立海青工商 | nuweb | 需新 adapter |  |  |  |
| hdvs | 私立華德工家 | aspnet | 需新 adapter |  |  |  |
| hhhs | 市立新興高中 | aspnet | 需新 adapter |  |  |  |
| hkhs | 市立小港高中 | ischool | 可上架 | https://www.hkhs.kh.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_104d94 | 30 則／30 有日期／最新 2026-10-30 |  |
| iis | 私立義大國際高中 | — | 連不上 |  |  | connection_error |
| kghs | 市立高雄女中 | ischool | 可上架 | http://www.kghs.kh.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_b1fbad0 | 30 則／30 有日期／最新 2026-10-28 |  |
| kksh.nsysu.edu.tw | 國立中山大學附屬國光高中 | new-classic-cms | 同系統，需調整 | https://kksh.nsysu.edu.tw/ | 8 則／0 有日期／最新  |  |
| kmhjh | 國立高餐大附屬餐旅中學 | wordpress | 可上架 | https://nkhhs.kmhjh.kh.edu.tw/feed/ | 12 則／12 有日期／最新 2026-10-30 |  |
| kshs | 市立高雄中學 | aspnet | 需新 adapter |  |  |  |
| ksvcs | 市立高雄高商 | aspnet | 需新 adapter |  |  |  |
| ksvs | 市立高雄高工 | nuweb | 需新 adapter |  |  |  |
| kusjh | 市立鼓山高中 | aspnet | 需新 adapter |  |  |  |
| kyvs | 私立高苑工商 | — | 連不上 |  |  | HTTPError |
| lchs | 市立路竹高中 | aspnet | 需新 adapter |  |  |  |
| lcvs | 私立立志高中 | wordpress | 同系統，需調整 | https://w5.lcvs.kh.edu.tw/feed/ | 0 則／0 有日期／最新  | HTTPError |
| lgm | 市立六龜高中 | aspnet | 需新 adapter |  |  |  |
| ly | 市立林園高中 | xoops | 同系統，需調整 | http://www.ly.kh.edu.tw/modules/tadnews/rss.php | 0 則／0 有日期／最新  | HTTPError |
| mcsh | 天主教明誠高中 | unknown | 需新 adapter |  |  |  |
| mzu | 市立巴楠花部落實驗高中 | aspnet | 需新 adapter |  |  |  |
| nknush | 國立高師大附中 | wordpress | 可上架 | http://www.nknush.kh.edu.tw/feed/ | 24 則／24 有日期／最新 2026-10-30 |  |
| nths | 市立楠梓高中 | aspnet | 需新 adapter |  |  |  |
| rssh | 市立瑞祥高中 | unknown | 需新 adapter |  |  |  |
| rwm | 市立仁武高中 | wordpress | 同系統，需調整 | http://www.rwm.kh.edu.tw/feed/ | 0 則／0 有日期／最新  |  |
| sg.sgshedu.tw | 財團法人新光高中 | xoops | 可上架 | https://sg.sgshedu.tw/modules/tadnews/rss.php | 20 則／20 有日期／最新 2026-10-22 |  |
| shute | 私立樹德家商 | — | 連不上 |  |  | HTTPError |
| smhs | 市立三民高中 | — | 連不上 |  |  | connection_error |
| smvhs | 市立三民家商 | new-classic-cms | 同系統，需調整 | http://www.smvhs.kh.edu.tw/ | 7 則／0 有日期／最新  |  |
| tyhs | 市立左營高中 | nuweb | 需新 adapter |  |  |  |
| waldorf-tw-kh.weebly.com | 光禾華德福實驗學校 | unknown | 需新 adapter |  |  |  |
| web.cysh.khc.edu.tw | 私立正義高中 | aspnet | 需新 adapter |  |  |  |
| wsm | 市立文山高中 | new-classic-cms | 同系統，需調整 | http://www.wsm.kh.edu.tw/ | 0 則／0 有日期／最新  |  |
| www.cmsh.khc.edu.tw | 國立旗美高中 | ischool | 同系統，需調整 | http://www.cmsh.khc.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_8a7d68 | 0 則／0 有日期／最新  |  |
| www.csic.khc.edu.tw | 私立中山工商 | — | 連不上 |  |  | connection_error |
| www.csvs.khc.edu.tw | 國立旗山農工 | — | 連不上 |  |  | tls_error |
| www.fhsh.khc.edu.tw | 國立鳳新高中 | wordpress | 可上架 | http://www.fhsh.khc.edu.tw/feed/ | 20 則／20 有日期／最新 2026-11-01 |  |
| www.fssh.khc.edu.tw | 國立鳳山高中 | ischool | 可上架 | http://www.fssh.khc.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_0f0755 | 30 則／30 有日期／最新 2026-10-30 |  |
| www.fsvs.khc.edu.tw | 國立鳳山商工 | new-classic-cms | 可上架 | https://www.fsvs.khc.edu.tw/ | 5 則／5 有日期／最新 2026-10-30 |  |
| www.kssh.khc.edu.tw | 國立岡山高中 | new-classic-cms | 可上架 | http://www.kssh.khc.edu.tw/ | 15 則／15 有日期／最新 2026-10-30 |  |
| www.ksvs.khc.edu.tw | 國立岡山農工 | new-classic-cms | 可上架 | http://www.ksvs.khc.edu.tw/ | 4 則／4 有日期／最新 2026-10-30 |  |
| www.kyicvs.khc.edu.tw | 私立高英工商 | nuweb | 需新 adapter |  |  |  |
| www.pmsh.khc.edu.tw | 財團法人普門中學 | ccms | 同系統，需調整 | https://www.pmsh.khc.edu.tw/ | 0 則／0 有日期／最新  |  |
| www.sanhsin.edu.tw | 私立三信家商 | aspnet | 需新 adapter |  |  |  |

## 名錄取得紀錄

- data.gov.tw 6089: HTTP 200, CSV 13 個
- 名錄 https://stats.moe.gov.tw/files/school/115/high.csv: 目標縣市 100 校
