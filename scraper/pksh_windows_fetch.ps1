param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [Parameter(Mandatory = $true)]
  [string]$ReportPath,
  [string]$MemberOutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ListUri = [Uri]"https://www.pksh.ylc.edu.tw/ischool/widget/site_news/news_query_json.php"
$WidgetUid = "WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a"
$Headers = @{
  "User-Agent" = "cy-school-news/1.0 (+https://github.com/tsaibohau/cy-school-news; non-commercial announcement index)"
  "Accept-Language" = "zh-TW,zh;q=0.9"
}

# Invoke-WebRequest on windows-latest uses the Windows/.NET certificate-chain
# validator. Certificate bypasses, custom trust roots, and HTTP fallback are
# forbidden here: a failed chain must remain a failed research result.
$Announcements = @()
$SeenNewsIds = @{}
$ListPagesRequested = 0
$PageSize = 30
$MaxListPages = 100
$ExpectedTotal = $null
$FinalUri = $ListUri
$LastStatusCode = 0
for ($PageNum = 0; $PageNum -lt $MaxListPages; $PageNum++) {
  $Body = @{
    field = "time"
    order = "DESC"
    pageNum = [string]$PageNum
    maxRows = [string]$PageSize
    keyword = ""
    uid = $WidgetUid
    tf = "2"
    auth_type = "user"
    use_cache = "1"
  }
  $Response = Invoke-WebRequest -Uri $ListUri -Method Post -Headers $Headers -Body $Body -ContentType "application/x-www-form-urlencoded; charset=UTF-8" -TimeoutSec 30 -MaximumRedirection 3 -UseBasicParsing
  $ListPagesRequested++
  $FinalUri = $Response.BaseResponse.RequestMessage.RequestUri
  $LastStatusCode = [int]$Response.StatusCode
  if ($LastStatusCode -ne 200) { throw "PKSH returned HTTP $LastStatusCode" }
  if ($FinalUri.Scheme -ne "https" -or $FinalUri.Host -ne "www.pksh.ylc.edu.tw") {
    throw "PKSH redirected outside the verified official HTTPS origin"
  }
  $PagePayload = [string]$Response.Content
  if ($PagePayload.Length -lt 20 -or $PagePayload.Length -gt 2097152) {
    throw "PKSH response size is outside the expected research bounds"
  }
  try { $PageRecords = @($PagePayload | ConvertFrom-Json) } catch {
    throw "PKSH announcement endpoint did not return valid JSON"
  }
  if ($PageNum -eq 0) {
    $TotalRow = $PageRecords | Where-Object { $null -ne $_.PSObject.Properties["total"] } | Select-Object -First 1
    if ($null -ne $TotalRow) {
      $ParsedTotal = 0
      if ([int]::TryParse([string]$TotalRow.PSObject.Properties["total"].Value, [ref]$ParsedTotal) -and $ParsedTotal -gt 0) {
        $ExpectedTotal = $ParsedTotal
        $ExpectedPages = [int][Math]::Ceiling($ExpectedTotal / [double]$PageSize)
        if ($ExpectedPages -gt $MaxListPages) {
          throw "PKSH reports $ExpectedTotal announcements, exceeding the explicit safe retrieval bound"
        }
      }
    }
  }
  $PageAnnouncements = @($PageRecords | Where-Object {
    $NewsIdProperty = $_.PSObject.Properties["newsId"]
    $TitleProperty = $_.PSObject.Properties["title"]
    $null -ne $NewsIdProperty -and $null -ne $TitleProperty -and
      $NewsIdProperty.Value -and $TitleProperty.Value
  })
  foreach ($Announcement in $PageAnnouncements) {
    $NewsId = [string]$Announcement.PSObject.Properties["newsId"].Value
    if (-not $SeenNewsIds.ContainsKey($NewsId)) {
      $SeenNewsIds[$NewsId] = $true
      $Announcements += $Announcement
    }
  }
  if ($null -ne $ExpectedTotal -and $Announcements.Count -ge $ExpectedTotal) { break }
  if ($PageAnnouncements.Count -lt $PageSize) {
    if ($null -ne $ExpectedTotal -and $Announcements.Count -lt $ExpectedTotal) {
      throw "PKSH pagination ended before the reported announcement total was collected"
    }
    break
  }
  if ($PageNum -eq ($MaxListPages - 1)) {
    throw "PKSH pagination reached the safe retrieval bound before completion"
  }
  Start-Sleep -Milliseconds 1500
}
if ($Announcements.Count -lt 1 -or $Announcements.Count -gt ($PageSize * $MaxListPages)) {
  throw "PKSH response does not contain recognizable announcement records"
}
if ($null -ne $ExpectedTotal -and $Announcements.Count -ne $ExpectedTotal) {
  throw "PKSH collected $($Announcements.Count) announcements but the site reported $ExpectedTotal"
}

$Utf8 = [System.Text.UTF8Encoding]::new($false)
foreach ($Target in @($OutputPath, $ReportPath)) {
  $Parent = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($Target))
  [System.IO.Directory]::CreateDirectory($Parent) | Out-Null
}
$Payload = $Announcements | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $Payload, $Utf8)

$MemberRecords = @()
if ($MemberOutputPath) {
  foreach ($Announcement in @($Announcements | Select-Object -First 5)) {
    $NewsId = [string]$Announcement.PSObject.Properties["newsId"].Value
    if ($NewsId -notmatch '^\d+$') { continue }
    $ViewUri = [Uri]"https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=$NewsId"
    $ViewResponse = Invoke-WebRequest -Uri $ViewUri -Method Get -Headers $Headers -TimeoutSec 30 -MaximumRedirection 3 -UseBasicParsing
    $ViewFinalUri = $ViewResponse.BaseResponse.RequestMessage.RequestUri
    if ([int]$ViewResponse.StatusCode -ne 200 -or $ViewFinalUri.Scheme -ne "https" -or $ViewFinalUri.Host -ne "www.pksh.ylc.edu.tw") {
      throw "PKSH detail page left the verified official HTTPS origin"
    }
    $UniqueMatch = [regex]::Match([string]$ViewResponse.Content, 'g_news_unique_id\s*=\s*["'']([^"'']+)["'']')
    if (-not $UniqueMatch.Success) { continue }
    $UniqueId = [Uri]::EscapeDataString($UniqueMatch.Groups[1].Value)
    $DetailUri = [Uri]"https://www.pksh.ylc.edu.tw/ischool/widget/site_news/news_query_json_content.php?nid=$NewsId&dir=0&uid=$UniqueId"
    $DetailResponse = Invoke-WebRequest -Uri $DetailUri -Method Get -Headers $Headers -TimeoutSec 30 -MaximumRedirection 3 -UseBasicParsing
    $DetailFinalUri = $DetailResponse.BaseResponse.RequestMessage.RequestUri
    if ([int]$DetailResponse.StatusCode -ne 200 -or $DetailFinalUri.Scheme -ne "https" -or $DetailFinalUri.Host -ne "www.pksh.ylc.edu.tw") {
      throw "PKSH detail endpoint left the verified official HTTPS origin"
    }
    $DetailPayload = [string]$DetailResponse.Content
    if ($DetailPayload.Length -gt 2097152) { throw "PKSH detail response is too large" }
    try { $DetailRows = @($DetailPayload | ConvertFrom-Json) } catch { continue }
    $Detail = $DetailRows | Where-Object { $null -ne $_.PSObject.Properties["content"] } | Select-Object -First 1
    if ($null -eq $Detail) { continue }
    $MemberRecords += [ordered]@{
      newsId = $NewsId
      title = [string]$Announcement.PSObject.Properties["title"].Value
      source_url = $ViewUri.AbsoluteUri
      content = [string]$Detail.PSObject.Properties["content"].Value
    }
    Start-Sleep -Milliseconds 1500
  }
  $MemberParent = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($MemberOutputPath))
  [System.IO.Directory]::CreateDirectory($MemberParent) | Out-Null
  [System.IO.File]::WriteAllText(
    [System.IO.Path]::GetFullPath($MemberOutputPath),
    ($MemberRecords | ConvertTo-Json -Depth 5),
    $Utf8
  )
}

$Report = [ordered]@{
  schema_version = 1
  fetched_at = [DateTimeOffset]::UtcNow.ToString("o")
  requested_url = $ListUri.AbsoluteUri
  final_url = $FinalUri.AbsoluteUri
  status_code = $LastStatusCode
  tls_verification = "windows_default_required"
  response_characters = $Payload.Length
  announcement_records = $Announcements.Count
  expected_announcement_records = $ExpectedTotal
  list_pages_requested = $ListPagesRequested
  request_policy = "sequential; follow the reported total, max 100 list pages and 5 detail records per run"
  member_detail_records = $MemberRecords.Count
}
[System.IO.File]::WriteAllText(
  [System.IO.Path]::GetFullPath($ReportPath),
  ($Report | ConvertTo-Json -Depth 3),
  $Utf8
)

Write-Host "PKSH Windows HTTPS fetch succeeded with default certificate validation."
