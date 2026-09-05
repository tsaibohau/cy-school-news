param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [Parameter(Mandatory = $true)]
  [string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ListUri = [Uri]"https://www.pksh.ylc.edu.tw/ischool/widget/site_news/main2.php?allbtn=0&maximize=1&uid=WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a"
$Headers = @{
  "User-Agent" = "cy-school-news/1.0 (+https://github.com/tsaibohau/cy-school-news; non-commercial announcement index)"
  "Accept-Language" = "zh-TW,zh;q=0.9"
}

# Invoke-WebRequest on windows-latest uses the Windows/.NET certificate-chain
# validator. Certificate bypasses, custom trust roots, and HTTP fallback are
# forbidden here: a failed chain must remain a failed research result.
$Response = Invoke-WebRequest -Uri $ListUri -Method Get -Headers $Headers -TimeoutSec 30 -MaximumRedirection 3 -UseBasicParsing
$FinalUri = $Response.BaseResponse.RequestMessage.RequestUri

if ([int]$Response.StatusCode -ne 200) {
  throw "PKSH returned HTTP $([int]$Response.StatusCode)"
}
if ($FinalUri.Scheme -ne "https" -or $FinalUri.Host -ne "www.pksh.ylc.edu.tw") {
  throw "PKSH redirected outside the verified official HTTPS origin"
}

$Html = [string]$Response.Content
if ($Html.Length -lt 500 -or $Html.Length -gt 2097152) {
  throw "PKSH response size is outside the expected research bounds"
}
if ($Html -notmatch '/ischool/public/news_view/show\.php\?[^"'']*nid=\d+') {
  throw "PKSH response does not contain recognizable announcement links"
}

$Utf8 = [System.Text.UTF8Encoding]::new($false)
foreach ($Target in @($OutputPath, $ReportPath)) {
  $Parent = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($Target))
  [System.IO.Directory]::CreateDirectory($Parent) | Out-Null
}
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $Html, $Utf8)

$Report = [ordered]@{
  schema_version = 1
  fetched_at = [DateTimeOffset]::UtcNow.ToString("o")
  requested_url = $ListUri.AbsoluteUri
  final_url = $FinalUri.AbsoluteUri
  status_code = [int]$Response.StatusCode
  tls_verification = "windows_default_required"
  response_characters = $Html.Length
}
[System.IO.File]::WriteAllText(
  [System.IO.Path]::GetFullPath($ReportPath),
  ($Report | ConvertTo-Json -Depth 3),
  $Utf8
)

Write-Host "PKSH Windows HTTPS fetch succeeded with default certificate validation."
