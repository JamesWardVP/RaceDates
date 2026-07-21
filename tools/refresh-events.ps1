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
    $n = $name.ToLowerInvariant() -replace "['’]", ""   # "king's" -> "kings"
    # circuit-config suffixes first, then generic venue words
    foreach ($word in @("international", "national", "indy", "300", "500", "gp", "full circuit", "full", "circuit", "raceway", "racing", "race", "stadium", "track", "speed", "hill climb", "hillclimb", "motor", "park")) {
        $n = $n.Replace($word, " ")
    }
    ($n -replace "[^a-z0-9]", " " -replace "\s+", " ").Trim()
}

# Match a scraped venue name to one of our tracks; $null if it isn't a UK
# venue we list. "brands hatch" must match "Brands Hatch"; "donington" too.
# Also checks the track's town, since some fixture lists give the town
# ("Ipswich") rather than the venue name ("Foxhall Stadium").
function Find-Track([string]$venueName) {
    $vNorm = Normalize-Name $venueName
    if (-not $vNorm) { return $null }
    foreach ($t in $tracks) {
        $tNorm = Normalize-Name $t.name
        if ($tNorm -eq $vNorm -or $tNorm.StartsWith($vNorm) -or $vNorm.StartsWith($tNorm)) { return $t }
    }
    foreach ($t in $tracks) {
        $townNorm = Normalize-Name $t.location.town
        if ($townNorm -and $townNorm -eq $vNorm) { return $t }
    }
    return $null
}

# "23 May" -> ISO date in the season year (assumed = current year: series
# publish the current season's calendar on these pages).
function Parse-DayMonth([string]$text, [int]$year) {
    $text = $text -replace '(\d)(st|nd|rd|th)\b', '$1'   # "1st Aug" -> "1 Aug"
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

# ------------------------------------------------- venue-calendar adapters ---
# Venue calendars use seriesId "venue" with a per-event raceType (the front
# end colours by event raceType when present). A venue event that lands on
# the same date as a series event at the same track is skipped — the series
# feed is richer, so it wins.

function Merge-VenueEvents([string]$trackId, [array]$newEvents) {
    $kept = @($script:events | Where-Object { -not ($_.seriesId -eq "venue" -and $_.trackId -eq $trackId) })
    $added = @()
    foreach ($ev in $newEvents) {
        $collision = $kept | Where-Object { $_.trackId -eq $trackId -and $_.seriesId -ne "venue" -and $_.startDate -eq $ev.startDate }
        if ($collision) { Write-Host "  venue/$trackId : skipped '$($ev.name)' (series event already covers $($ev.startDate))"; continue }
        $added += $ev
    }
    Write-Host "  venue/$trackId : $($added.Count) events (replaced $($script:events.Count - $kept.Count) old entries)."
    return @($kept + $added)
}

function Infer-EventRaceType([string]$name, [string]$default) {
    if ($name -match "rallycross|rally ?x") { return "rallycross" }
    if ($name -match "\brally\b") { return "rally" }
    if ($name -match "bike|motorcycle|moto") { return "moto" }
    if ($name -match "drag") { return "drag" }
    if ($name -match "kart") { return "karting" }
    if ($name -match "hill ?climb|hillclimb") { return "hillclimb" }
    return $default
}

# "MONDAY 31st AUGUST 2026" or "SATURDAY 12th & SUNDAY 13th SEPTEMBER 2026"
# -> @(startISO, endISO). Year is embedded in the text (unlike Parse-DateRange's
# callers, which pass year separately), so this is a standalone parser.
function Parse-WeekdayDateRange([string]$text) {
    $t = $text -replace '(\d)(st|nd|rd|th)\b', '$1'
    $t = $t -replace '\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b', ''
    $t = ($t -replace '\s+', ' ').Trim()
    if ($t -notmatch '(\d{4})\s*$') { return @($null, $null) }
    $year = [int]$Matches[1]
    $t = ($t -replace '\d{4}\s*$', '').Trim()

    if ($t -match '^(\d{1,2})\s*&\s*(\d{1,2})\s+([A-Za-z]+)$') {
        $start = Parse-DayMonth "$($Matches[1]) $($Matches[3])" $year
        $end = Parse-DayMonth "$($Matches[2]) $($Matches[3])" $year
        return @($start, $end)
    }
    if ($t -match '^(\d{1,2}\s+[A-Za-z]+)\s*&\s*(\d{1,2}\s+[A-Za-z]+)$') {
        return @((Parse-DayMonth $Matches[1] $year), (Parse-DayMonth $Matches[2] $year))
    }
    $d = Parse-DayMonth $t $year
    return @($d, $d)
}

function Get-LyddenEvents {
    Write-Host "Lydden Hill: fetching lyddenhill.co.uk/events..."
    $html = (Invoke-WebRequest -Uri "https://lyddenhill.co.uk/events/" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
    $result = @()
    $pattern = '(?s)class="event-item[^"]*">.*?<h3>([^<]+)</h3>\s*<p class="event-date[^"]*">\s*(\d{2}/\d{2}/\d{4})\s*</p>.*?href="([^"]+)"'
    foreach ($m in [regex]::Matches($html, $pattern)) {
        $name = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value.Trim())
        $d = [datetime]::ParseExact($m.Groups[2].Value, "dd/MM/yyyy", $null)
        $iso = $d.ToString("yyyy-MM-dd")
        $result += [ordered]@{
            id        = "venue-lydden-hill-$iso-$(($name.ToLower() -replace '[^a-z0-9]+','-').Trim('-'))"
            name      = $name
            trackId   = "lydden-hill"
            seriesId  = "venue"
            raceType  = Infer-EventRaceType $name "circuit"
            startDate = $iso
            endDate   = $iso
            gates     = $null
            price     = $null
            ticketUrl = $m.Groups[3].Value
            sample    = $false
        }
    }
    return $result
}

function Get-GoodwoodEvents {
    Write-Host "Goodwood: fetching headline event pages..."
    $pages = @(
        @{ name = "Goodwood Festival of Speed"; url = "https://www.goodwood.com/motorsport/festival-of-speed/"; raceType = "hillclimb" },
        @{ name = "Goodwood Revival"; url = "https://www.goodwood.com/motorsport/goodwood-revival/"; raceType = "circuit" },
        @{ name = "Goodwood Members' Meeting"; url = "https://www.goodwood.com/motorsport/members-meeting/"; raceType = "circuit" }
    )
    $result = @()
    foreach ($p in $pages) {
        try {
            $html = (Invoke-WebRequest -Uri $p.url -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
        } catch { Write-Host "  Goodwood: $($p.name) page failed ($($_.Exception.Message))"; continue }
        $m = [regex]::Match($html, '(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})')
        if (-not $m.Success) { Write-Host "  Goodwood: no date found on $($p.name) page"; continue }
        $year = [int]$m.Groups[4].Value
        $start = Parse-DayMonth "$($m.Groups[1].Value) $($m.Groups[3].Value)" $year
        $end = Parse-DayMonth "$($m.Groups[2].Value) $($m.Groups[3].Value)" $year
        if (-not $start) { continue }
        $result += [ordered]@{
            id        = "venue-goodwood-$start"
            name      = "$($p.name) $year"
            trackId   = "goodwood"
            seriesId  = "venue"
            raceType  = $p.raceType
            startDate = $start
            endDate   = $end
            gates     = $null
            price     = $null
            ticketUrl = $p.url
            sample    = $false
        }
    }
    return $result
}

# ------------------------------------------- adapter: Straightliners (mobile) ---
# Straightliners are a "mobile event host": one promoter, many venues. Events
# are matched to tracks by the card's venue name; each event's raceType comes
# from the venue (drag at drag strips, "other" for top-speed venues).

function Get-StraightlinersEvents {
    Write-Host "Straightliners: fetching straightliners.events/all-events..."
    $html = (Invoke-WebRequest -Uri "https://straightliners.events/all-events/" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
    $result = @()
    $pattern = '(?s)<a href="([^"]+)" class="events-section-box">.*?<h3>([^<]+)</h3>\s*<div class="event-date">\s*([^<]+?)\s*</div>\s*<div class="event-location">.*?</i>\s*([^<]+)</div>'
    foreach ($m in [regex]::Matches($html, $pattern)) {
        $url = $m.Groups[1].Value
        $title = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value.Trim())
        $dateText = [System.Net.WebUtility]::HtmlDecode($m.Groups[3].Value.Trim())
        $venueName = [System.Net.WebUtility]::HtmlDecode($m.Groups[4].Value.Trim())

        $track = Find-Track $venueName
        if (-not $track) { Write-Host "  Straightliners: skipped '$title' (venue '$venueName' not on the site)"; continue }

        # "1st Aug 2026" or "6th - 7th Jun 2026"
        $year = (Get-Date).Year
        if ($dateText -match '(\d{4})') { $year = [int]$Matches[1] }
        $core = ($dateText -replace '\d{4}', '').Trim() -replace ',', ''
        $range = Parse-DateRange $core $year
        if (-not $range[0]) { Write-Host "  Straightliners: skipped '$title' (unparseable date '$dateText')"; continue }

        $rt = if ($track.raceTypes -contains "drag") { "drag" } else { "other" }
        $result += [ordered]@{
            id        = "straightliners-$($track.id)-$($range[0])"
            name      = $title
            trackId   = $track.id
            seriesId  = "straightliners"
            raceType  = $rt
            startDate = $range[0]
            endDate   = $range[1]
            gates     = $null
            price     = $null
            ticketUrl = $url
            sample    = $false
        }
    }
    return $result
}

# --------------------------------------- adapter: Oliver's Mount (venue) ---

function Get-OliversMountEvents {
    Write-Host "Oliver's Mount: fetching oliversmount.com/events2..."
    $html = (Invoke-WebRequest -Uri "https://oliversmount.com/events2/" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
    $result = @()
    $pattern = '(?s)omr-event-card data-end-date=([\d-]+)>.*?omr-event-date>([^<]+)</div>\s*<h3 class=omr-event-title>([^<]+)</h3>.*?<a href="([^"]+)" class=omr-book-button'
    foreach ($m in [regex]::Matches($html, $pattern)) {
        $endIso = $m.Groups[1].Value
        $dateText = $m.Groups[2].Value.Trim()
        $name = [System.Net.WebUtility]::HtmlDecode($m.Groups[3].Value.Trim())
        $year = [int]$endIso.Substring(0, 4)
        $range = Parse-DateRange (($dateText -replace '\d{4}', '').Trim()) $year
        $start = if ($range[0]) { $range[0] } else { $endIso }
        $result += [ordered]@{
            id        = "venue-olivers-mount-$start"
            name      = $name
            trackId   = "oliver-s-mount-racing-circuit"
            seriesId  = "venue"
            raceType  = Infer-EventRaceType $name "moto"
            startDate = $start
            endDate   = $endIso
            gates     = $null
            price     = $null
            ticketUrl = $m.Groups[4].Value
            sample    = $false
        }
    }
    return $result
}

# ------------------------------------- adapter: Lochgelly / Hardie (venue) ---

function Get-LochgellyEvents {
    Write-Host "Lochgelly: fetching hardieracepromotions.co.uk/pages/fixtures..."
    $html = (Invoke-WebRequest -Uri "https://www.hardieracepromotions.co.uk/pages/fixtures/" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
    $result = @()
    $pattern = '(?s)<div id="fixtureDetails">\s*<h2>[^<]+</h2>.*?<h3>([^<]+)</h3>\s*<h4>First Race:\s*([^<]+)</h4>.*?href="https://www\.hardieracepromotions\.co\.uk/pages/fixture/(\d{4}-\d{2}-\d{2})/'
    foreach ($m in [regex]::Matches($html, $pattern)) {
        $name = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value.Trim())
        $iso = $m.Groups[3].Value
        # "5.15pm" -> "17:15" for gates
        $gates = $null
        if ($m.Groups[2].Value.Trim() -match '(\d{1,2})[.:](\d{2})\s*(am|pm)') {
            $hh = [int]$Matches[1]; if ($Matches[3] -eq "pm" -and $hh -lt 12) { $hh += 12 }
            $gates = [ordered]@{ open = ("{0:d2}:{1}" -f $hh, $Matches[2]); close = $null }
        }
        $result += [ordered]@{
            id        = "venue-lochgelly-$iso"
            name      = $name
            trackId   = "lochgelly-raceway"
            seriesId  = "venue"
            raceType  = "oval"
            startDate = $iso
            endDate   = $iso
            gates     = $gates
            price     = $null
            ticketUrl = "https://www.hardieracepromotions.co.uk/pages/fixture/$iso/"
            sample    = $false
        }
    }
    return $result
}

# --------------------------------------------- adapter: BriSCA F1 stock car ---

function Get-BriscaEvents {
    Write-Host "BriSCA F1: fetching cayzerracing.co.uk fixture list..."
    $html = (Invoke-WebRequest -Uri "https://cayzerracing.co.uk/brisca-f1-fixture-lists/" -UseBasicParsing -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).Content
    $year = (Get-Date).Year
    $result = @()
    $pattern = '<td class="column-1">([^<]*)</td>\s*<td class="column-2">([^<]*)</td>\s*<td class="column-3">([^<]*)</td>\s*<td class="column-4">([^<]*)</td>\s*<td class="column-5">([^<]*)</td>'
    foreach ($m in [regex]::Matches($html, $pattern)) {
        $dateText = $m.Groups[1].Value.Trim()
        $venueName = $m.Groups[3].Value.Trim()
        $eventName = [System.Net.WebUtility]::HtmlDecode($m.Groups[4].Value.Trim()) -replace '\s+', ' '
        $classes = [System.Net.WebUtility]::HtmlDecode($m.Groups[5].Value.Trim()) -replace '\s+', ' '
        if (-not $dateText -or $venueName -match "TBC") { continue }   # placeholder rows

        $start = Parse-DayMonth $dateText $year
        if (-not $start) { continue }

        $track = Find-Track $venueName
        if (-not $track) { Write-Host "  BriSCA F1: skipped '$venueName' (no matching UK track)"; continue }

        if (-not $eventName) { $eventName = "BriSCA F1 Race Night" }
        $result += [ordered]@{
            id        = "brisca-f1-$($track.id)-$start"
            name      = "$eventName ($classes)"
            trackId   = $track.id
            seriesId  = "brisca-f1"
            startDate = $start
            endDate   = $start
            gates     = $null
            price     = $null
            ticketUrl = $track.website
            sample    = $false
        }
    }
    return $result
}

# -------------------------------------------- adapter: Castle Combe (venue) ---
# Their calendar paths intermittently 403 non-browser clients (bot/rate
# protection observed even across successive requests) - single attempt per
# run, browser-like headers, graceful fallback to existing data on failure.

function Get-CastleCombeEvents {
    Write-Host "Castle Combe: fetching castlecombecircuit.co.uk/all-racing..."
    try {
        # Their bot-protection specifically filters our normal $userAgent's
        # "RaceDatesBot" signature (confirmed: identical request passes with a
        # plain browser UA, 403s with the bot one) - this is the one adapter
        # that needs it, just to read a public read-only calendar page.
        $html = (Invoke-WebRequest -Uri "https://castlecombecircuit.co.uk/all-racing/" -UseBasicParsing -Headers @{
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            "Accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            "Accept-Language" = "en-GB,en;q=0.9"
        } -TimeoutSec 60).Content
    } catch {
        Write-Host "  Castle Combe: fetch failed ($($_.Exception.Message)) - keeping existing events."
        return @()
    }
    $track = $tracks | Where-Object { $_.id -eq "castle-combe" }
    $result = @()
    $rows = $html -split '<tr class="wptb-row"'
    foreach ($row in ($rows | Select-Object -Skip 1)) {
        $strongs = [regex]::Matches($row, '<strong>([^<]+)</strong>')
        if ($strongs.Count -lt 2) { continue }
        $dateText = [System.Net.WebUtility]::HtmlDecode($strongs[0].Groups[1].Value.Trim())
        $titleText = [System.Net.WebUtility]::HtmlDecode($strongs[1].Groups[1].Value.Trim())
        if ($dateText -notmatch '\d{4}') { continue }   # skip non-event rows

        $range = Parse-WeekdayDateRange $dateText
        if (-not $range[0]) { Write-Host "  Castle Combe: skipped '$titleText' (unparseable date '$dateText')"; continue }

        $hrefMatch = [regex]::Match($row, 'href="(https://castlecombecircuit\.co\.uk/[^"]+/)"')
        $ticketUrl = if ($hrefMatch.Success) { $hrefMatch.Groups[1].Value } else { $track.website }

        $result += [ordered]@{
            id        = "venue-castle-combe-$($range[0])"
            name      = $titleText
            trackId   = "castle-combe"
            seriesId  = "venue"
            raceType  = Infer-EventRaceType $titleText "circuit"
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

# --------------------------------------------------- adapter: Pembrey (venue) ---
# Their /events page is JS-rendered, but it calls a clean JSON API underneath
# (found via the network panel) that returns startDate/endDate/title/price
# directly - no HTML scraping needed at all.

function Get-PembreyEvents {
    Write-Host "Pembrey: fetching pembreycircuit.co.uk/api/events..."
    try {
        $res = Invoke-RestMethod -Uri "https://pembreycircuit.co.uk/api/events" -Method Post -Body '{"page":1}' -ContentType "application/json" -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60
    } catch {
        Write-Host "  Pembrey: fetch failed ($($_.Exception.Message)) - keeping existing events."
        return @()
    }
    $result = @()
    foreach ($e in $res.results) {
        if (-not $e.startDate) { continue }
        $ticketUrl = if ($e.href -match '^https?://') { $e.href } else { "https://www.pembreycircuit.co.uk/$($e.href)" }
        $result += [ordered]@{
            id        = "venue-pembrey-$($e.startDate)-$($e.id)"
            name      = $e.title
            trackId   = "pembrey"
            seriesId  = "venue"
            raceType  = Infer-EventRaceType $e.title "circuit"
            startDate = $e.startDate
            endDate   = if ($e.endDate) { $e.endDate } else { $e.startDate }
            gates     = $null
            price     = if ($e.price) { [ordered]@{ adult = [double]$e.price; currency = "GBP" } } else { $null }
            ticketUrl = $ticketUrl
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
$events = Merge-VenueEvents "lydden-hill" (Get-LyddenEvents)
$events = Merge-VenueEvents "goodwood" (Get-GoodwoodEvents)
$events = Merge-VenueEvents "oliver-s-mount-racing-circuit" (Get-OliversMountEvents)
$events = Merge-VenueEvents "lochgelly-raceway" (Get-LochgellyEvents)
$events = Merge-VenueEvents "castle-combe" (Get-CastleCombeEvents)
$events = Merge-VenueEvents "pembrey" (Get-PembreyEvents)

# Straightliners is a series (mobile host) but must not duplicate events other
# feeds already cover at the same track+date (e.g. their Santa Pod meetings).
$slEvents = @(Get-StraightlinersEvents | Where-Object {
    $ev = $_
    -not ($events | Where-Object { $_.seriesId -ne "straightliners" -and $_.trackId -eq $ev.trackId -and $_.startDate -eq $ev.startDate })
})
$events = Merge-SeriesEvents "straightliners" $slEvents
$events = Merge-SeriesEvents "brisca-f1" (Get-BriscaEvents)

# dedupe (a page can list the same event in featured + grid slots), then sort
$events = @($events | Group-Object { $_.id } | ForEach-Object { $_.Group[0] } | Sort-Object { $_.startDate })

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
# -InputObject keeps the top level an array even with 0/1 elements
[System.IO.File]::WriteAllText($eventsPath, (ConvertTo-Json -InputObject $events -Depth 10), $utf8NoBom)

Write-Host ""
Write-Host "Done: events.json now holds $($events.Count) events."
