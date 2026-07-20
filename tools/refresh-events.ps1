# RaceDates data pipeline — race calendar refresh
# Scrapes official series calendars and rebuilds main/data/events.json with
# no manual input. One small adapter per series; each adapter returns event
# objects which replace that series' previous entries (other series are left
# untouched, so partially-adapted data degrades gracefully).
#
# Adapters implemented:  btcc
# Planned:               bsb, british-gt, british-hillclimb, 5-nations-brx, euro-drag
#
# Venue matching: scraped circuit names are matched against main/data/tracks.json;
# events at venues we don't list (e.g. BSB's Assen round) are skipped.
#
# Works on Windows PowerShell 5.1 and pwsh. Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\refresh-events.ps1

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path $PSScriptRoot -Parent
# forward slashes: works on Windows AND the pwsh/Linux GitHub Actions runners
$tracksPath = "$root/main/data/tracks.json"
$eventsPath = "$root/main/data/events.json"
$userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RaceDatesBot/0.1"

# NB: no @() around ConvertFrom-Json here — in PS 5.1 it emits the parsed
# array as ONE pipeline object, so @() would double-wrap it and corrupt the
# JSON output with a {value, Count} wrapper.
$tracks = Get-Content $tracksPath -Raw -Encoding UTF8 | ConvertFrom-Json
$events = Get-Content $eventsPath -Raw -Encoding UTF8 | ConvertFrom-Json

# em dash built from a char code: PS 5.1 misreads BOM-less UTF-8 source files,
# so the script itself must stay pure ASCII.
$emDash = [string][char]0x2014

# ----------------------------------------------------------------- helpers ---

function Normalize-Name([string]$name) {
    $n = $name.ToLowerInvariant()
    # circuit-config suffixes first, then generic venue words
    foreach ($word in @("international", "national", "indy", "300", "500", "gp", "full circuit", "full", "circuit", "raceway", "racing", "race", "track", "speed", "hill climb", "hillclimb", "motor", "park")) {
        $n = $n.Replace($word, " ")
    }
    ($n -replace "[^a-z0-9]", " " -replace "\s+", " ").Trim()
}

# Match a scraped venue name to one of our tracks; $null if it isn't a UK
# venue we list. "brands hatch" must match "Brands Hatch"; "donington" too.
function Find-Track([string]$venueName) {
    $vNorm = Normalize-Name $venueName
    if (-not $vNorm) { return $null }
    foreach ($t in $tracks) {
        $tNorm = Normalize-Name $t.name
        if ($tNorm -eq $vNorm -or $tNorm.StartsWith($vNorm) -or $vNorm.StartsWith($tNorm)) { return $t }
    }
    return $null
}

# "23 May" -> ISO date in the season year (assumed = current year: series
# publish the current season's calendar on these pages).
function Parse-DayMonth([string]$text, [int]$year) {
    $culture = [System.Globalization.CultureInfo]::GetCultureInfo("en-GB")
    foreach ($fmt in @("d MMM", "dd MMM", "d MMMM", "dd MMMM")) {
        try {
            $d = [datetime]::ParseExact($text.Trim(), $fmt, $culture)
            return (Get-Date -Year $year -Month $d.Month -Day $d.Day).ToString("yyyy-MM-dd")
        } catch { }
    }
    return $null
}

# "29 - 31 Aug" / "31 Jul - 02 Aug" / "24-26 April" -> @(startISO, endISO).
# When the start part is just a day number, it borrows the end's month.
function Parse-DateRange([string]$text, [int]$year) {
    $parts = @($text -split "-" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($parts.Count -eq 1) {
        $d = Parse-DayMonth $parts[0] $year
        return @($d, $d)
    }
    $end = Parse-DayMonth $parts[1] $year
    if (-not $end) { return @($null, $null) }
    if ($parts[0] -match "^\d+$") {
        $endDate = [datetime]::ParseExact($end, "yyyy-MM-dd", $null)
        $start = (Get-Date -Year $year -Month $endDate.Month -Day ([int]$parts[0])).ToString("yyyy-MM-dd")
    } else {
        $start = Parse-DayMonth $parts[0] $year
    }
    return @($start, $end)
}

# Replace all of one series' events with a freshly scraped set.
function Merge-SeriesEvents([string]$seriesId, [array]$newEvents) {
    if (-not $newEvents -or $newEvents.Count -eq 0) {
        Write-Host "  $seriesId : adapter returned nothing - keeping existing entries."
        return $script:events
    }
    $kept = @($script:events | Where-Object { $_.seriesId -ne $seriesId })
    Write-Host "  $seriesId : $($newEvents.Count) events scraped (replaced $($script:events.Count - $kept.Count) old entries)."
    return @($kept + $newEvents)
}

# ------------------------------------------------------------ adapter: BTCC ---

function Get-BtccEvents {
    Write-Host "BTCC: fetching btcc.net/calendar..."
    $html = (Invoke-WebRequest -Uri "https://www.btcc.net/calendar/" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
    $year = (Get-Date).Year

    $pattern = '(?s)href="https://btcc\.net/circuit/[a-z0-9-]+/".{0,600}?circuitDatesText.*?ct-span[^>]*>([^<]+)</span>.*?circuitDatesText.*?ct-span[^>]*>([^<]+)</span>.*?mainHeading[^>]*>\s*<span[^>]*>([^<]+)</span>'
    $matches = [regex]::Matches($html, $pattern)

    $result = @()
    foreach ($m in $matches) {
        $startText = $m.Groups[1].Value
        $endText = $m.Groups[2].Value
        $venue = $m.Groups[3].Value.Trim()

        $start = Parse-DayMonth $startText $year
        $end = Parse-DayMonth $endText $year
        if (-not $start -or -not $end) { Write-Host "  BTCC: skipped '$venue' (unparseable dates '$startText'-'$endText')"; continue }

        $track = Find-Track $venue
        if (-not $track) { Write-Host "  BTCC: skipped '$venue' (no matching UK track)"; continue }

        $result += [ordered]@{
            id        = "btcc-$($track.id)-$start"
            name      = "BTCC $emDash $venue"
            trackId   = $track.id
            seriesId  = "btcc"
            startDate = $start
            endDate   = $end
            gates     = $null       # not published on the calendar page
            price     = $null
            ticketUrl = $track.website
            sample    = $false
        }
    }
    return $result
}

# ------------------------------------------------------------- adapter: BSB ---

function Get-BsbEvents {
    Write-Host "BSB: fetching britishsuperbike.com/calendar..."
    $html = (Invoke-WebRequest -Uri "https://www.britishsuperbike.com/calendar" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content

    $result = @()
    $cards = $html -split 'class="card round-info'
    foreach ($card in ($cards | Select-Object -Skip 1)) {
        # Race rounds only - skip "Test 1"/"Test 2" cards
        if ($card -notmatch 'class="header">Round\s+\d+</div>') { continue }

        $year = (Get-Date).Year
        if ($card -match 'href="/calendar/(\d{4})/') { $year = [int]$Matches[1] }

        if ($card -notmatch '(?s)<h3>([^<]+)</h3>\s*<h3>([^<]+)</h3>') { continue }
        $dateText = $Matches[1].Trim()
        $venue = $Matches[2].Trim()

        $range = Parse-DateRange $dateText $year
        if (-not $range[0]) { Write-Host "  BSB: skipped '$venue' (unparseable dates '$dateText')"; continue }

        $track = Find-Track $venue
        if (-not $track) { Write-Host "  BSB: skipped '$venue' (no matching UK track)"; continue }

        # Past rounds swap the "Book Tickets" button for a relative "Results"
        # link - only accept absolute URLs, otherwise use the track's site.
        $ticketUrl = $track.website
        if ($card -match 'brand-col" href="(https?://[^"]+)"') {
            $ticketUrl = [System.Net.WebUtility]::HtmlDecode($Matches[1])
        }

        $result += [ordered]@{
            id        = "bsb-$($track.id)-$($range[0])"
            name      = "British Superbikes $emDash $venue"
            trackId   = $track.id
            seriesId  = "bsb"
            startDate = $range[0]
            endDate   = $range[1]
            gates     = $null
            price     = $null
            ticketUrl = $ticketUrl
            sample    = $false
        }
    }
    return $result
}

# ------------------------------------------------------- adapter: British GT ---

function Get-BritishGtEvents {
    Write-Host "British GT: fetching britishgt.com/calendar..."
    $html = (Invoke-WebRequest -Uri "https://www.britishgt.com/calendar" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content

    $result = @()
    $chunks = $html -split 'calendar__list-item[ "]'
    foreach ($chunk in ($chunks | Select-Object -Skip 1)) {
        # Championship rounds only - skips Media Day / test entries
        if ($chunk -notmatch 'calendar__race-text">[^<]*Round') { continue }
        if ($chunk -notmatch 'calendar__race-header">([^<]+)<') { continue }
        $venue = $Matches[1].Trim()

        # date blocks: number / MONTH / year, first = start, second = end
        $dates = [regex]::Matches($chunk, 'date-number">(\d+)</span>\s*<span class="calendar__date-month">([A-Za-z]+)</span>\s*<span class="calendar__date-year">(\d{4})')
        if ($dates.Count -lt 1) { Write-Host "  British GT: skipped '$venue' (no dates)"; continue }

        function ToIso($m) {
            $monthName = $m.Groups[2].Value.Substring(0, 1).ToUpper() + $m.Groups[2].Value.Substring(1).ToLower()
            Parse-DayMonth "$($m.Groups[1].Value) $monthName" ([int]$m.Groups[3].Value)
        }
        $start = ToIso $dates[0]
        $end = if ($dates.Count -ge 2) { ToIso $dates[1] } else { $start }
        if (-not $start) { Write-Host "  British GT: skipped '$venue' (unparseable dates)"; continue }

        $track = Find-Track $venue
        if (-not $track) { Write-Host "  British GT: skipped '$venue' (no matching UK track)"; continue }

        $result += [ordered]@{
            id        = "british-gt-$($track.id)-$start"
            name      = "British GT $emDash $venue"
            trackId   = $track.id
            seriesId  = "british-gt"
            startDate = $start
            endDate   = $end
            gates     = $null
            price     = $null
            ticketUrl = $track.website
            sample    = $false
        }
    }
    return $result
}

# -------------------------------------------- adapter: British Hillclimb ---

function Get-HillclimbEvents {
    Write-Host "British Hillclimb: fetching britishhillclimb.co.uk/calendar..."
    $html = (Invoke-WebRequest -Uri "https://www.britishhillclimb.co.uk/calendar" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 90).Content

    # Wix page: walk the text nodes - an UPPERCASE venue name node is followed
    # by its date node ("25/26 April 2026" or "2 May 2026").
    $result = @()
    $pendingTrack = $null
    foreach ($m in [regex]::Matches($html, '>([^<>]+)<')) {
        $text = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) -replace '\s+', ' '
        $text = $text.Trim()
        if (-not $text) { continue }

        $dateMatch = [regex]::Match($text, '^(\d{1,2})(?:/(\d{1,2}))?\s+([A-Za-z]+)\s+(\d{4})$')
        if ($dateMatch.Success -and $pendingTrack) {
            $year = [int]$dateMatch.Groups[4].Value
            $month = $dateMatch.Groups[3].Value
            $start = Parse-DayMonth "$($dateMatch.Groups[1].Value) $month" $year
            $end = if ($dateMatch.Groups[2].Success) { Parse-DayMonth "$($dateMatch.Groups[2].Value) $month" $year } else { $start }
            if ($start) {
                $ticket = if ($pendingTrack.website) { $pendingTrack.website } else { "https://www.britishhillclimb.co.uk" }
                $result += [ordered]@{
                    id        = "british-hillclimb-$($pendingTrack.id)-$start"
                    name      = "British Hillclimb $emDash $($pendingTrack.name)"
                    trackId   = $pendingTrack.id
                    seriesId  = "british-hillclimb"
                    startDate = $start
                    endDate   = $end
                    gates     = $null
                    price     = $null
                    ticketUrl = $ticket
                    sample    = $false
                }
            }
            $pendingTrack = $null
            continue
        }

        # Venue tokens are short standalone names ("PRESCOTT", "SHELSLEY WALSH")
        if ($text.Length -le 30) {
            $t = Find-Track $text
            if ($t) { $pendingTrack = $t }
        }
    }
    return $result
}

# -------------------------------------------------------- adapter: Santa Pod ---

function Get-SantaPodEvents {
    Write-Host "Santa Pod: fetching santapod.co.uk/events..."
    # The site 403s rapid repeat requests - one attempt, degrade gracefully.
    try {
        $html = (Invoke-WebRequest -Uri "https://www.santapod.co.uk/events" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" } -TimeoutSec 90).Content
    } catch {
        Write-Host "  Santa Pod: fetch failed ($($_.Exception.Message)) - keeping existing events."
        return @()
    }

    $track = $tracks | Where-Object { $_.id -eq "santa-pod" }
    $result = @()
    $chunks = $html -split 'jet-listing-grid__item'
    foreach ($chunk in ($chunks | Select-Object -Skip 1)) {
        if ($chunk -notmatch 'href="(https://santapod\.co\.uk/events/[^"]+/)"') { continue }
        $eventUrl = $Matches[1]
        if ($chunk -notmatch 'alt="([^"]+)"') { continue }
        $title = [System.Net.WebUtility]::HtmlDecode($Matches[1]).Trim()

        # "24 - 26 Jul 2026", "7 - 9 Aug 2026", "31 Jul - 2 Aug 2026", "22 Aug 2026"
        $dateMatch = [regex]::Match($chunk, '>\s*(\d{1,2}\s+[A-Za-z]{3,9}\s*-\s*\d{1,2}\s+[A-Za-z]{3,9}|\d{1,2}(?:\s*-\s*\d{1,2})?\s+[A-Za-z]{3,9})\s+(\d{4})\s*<')
        if (-not $dateMatch.Success) { continue }
        $range = Parse-DateRange $dateMatch.Groups[1].Value ([int]$dateMatch.Groups[2].Value)
        if (-not $range[0]) { continue }

        $result += [ordered]@{
            id        = "santa-pod-$(($title.ToLower() -replace '[^a-z0-9]+','-').Trim('-'))-$($range[0])"
            name      = $title
            trackId   = $track.id
            seriesId  = "santa-pod"
            startDate = $range[0]
            endDate   = $range[1]
            gates     = $null
            price     = $null
            ticketUrl = $eventUrl
            sample    = $false
        }
    }
    return $result
}

# -------------------------------------------------------------------- main ---

Write-Host "Refreshing race calendars..."
$events = Merge-SeriesEvents "btcc" (Get-BtccEvents)
$events = Merge-SeriesEvents "bsb" (Get-BsbEvents)
$events = Merge-SeriesEvents "british-gt" (Get-BritishGtEvents)
$events = Merge-SeriesEvents "british-hillclimb" (Get-HillclimbEvents)
# one-time cleanup: the old euro-drag sample series was folded into santa-pod
$events = @($events | Where-Object { $_.seriesId -ne "euro-drag" })
$events = Merge-SeriesEvents "santa-pod" (Get-SantaPodEvents)

# dedupe (a page can list the same event in featured + grid slots), then sort
$events = @($events | Group-Object { $_.id } | ForEach-Object { $_.Group[0] } | Sort-Object { $_.startDate })

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
# -InputObject keeps the top level an array even with 0/1 elements
[System.IO.File]::WriteAllText($eventsPath, (ConvertTo-Json -InputObject $events -Depth 10), $utf8NoBom)

Write-Host ""
Write-Host "Done: events.json now holds $($events.Count) events."
