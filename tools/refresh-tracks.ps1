# RaceDates data pipeline — track refresh
# Enriches main/data/tracks.json from Wikidata (no manual input):
#   - photo (Wikimedia Commons, P18) -> cover image + track-page photo
#   - official website (P856), opening year (P1619/P571), capacity (P1083)
#   - marks enriched tracks verified:true and records their Wikidata id
# UK venues found on Wikidata but NOT in our list are written to
# main/data/discovered-tracks.json as candidates for admin review (they are
# NOT auto-added: Wikidata includes long-defunct circuits).
#
# Works on Windows PowerShell 5.1 and pwsh (GitHub Actions ubuntu runners).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\refresh-tracks.ps1

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path $PSScriptRoot -Parent
# forward slashes: works on Windows AND the pwsh/Linux GitHub Actions runners
$tracksPath = "$root/main/data/tracks.json"
$discoveredPath = "$root/main/data/discovered-tracks.json"
$userAgent = "RaceDatesBot/0.1 (personal project; jsward.business@gmail.com)"

# ---------------------------------------------------------------- Wikidata ---

$sparql = @'
SELECT ?item ?itemLabel ?coord ?opened ?inception ?capacity ?image ?website ?article WHERE {
  ?item wdt:P31/wdt:P279* wd:Q2338524 .
  ?item wdt:P17 wd:Q145 .
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P1619 ?opened }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P1083 ?capacity }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
'@

Write-Host "Querying Wikidata for UK motorsport venues..."
$url = "https://query.wikidata.org/sparql?format=json&query=" + [System.Net.WebUtility]::UrlEncode($sparql)
$response = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 120

# One row per item (SPARQL can return duplicates when an item has several
# values for an optional property — keep the first of each).
$wdItems = @{}
foreach ($row in $response.results.bindings) {
    $qid = ($row.item.value -split "/")[-1]
    if (-not $wdItems.ContainsKey($qid)) {
        $lat = $null; $lng = $null
        if ($row.coord) {
            if ($row.coord.value -match "Point\(([-0-9.]+) ([-0-9.]+)\)") {
                $lng = [double]$Matches[1]; $lat = [double]$Matches[2]
            }
        }
        $openedYear = $null
        if ($row.opened) { $openedYear = [int]$row.opened.value.Substring(0, 4) }
        elseif ($row.inception) { $openedYear = [int]$row.inception.value.Substring(0, 4) }

        $imageUrl = $null
        if ($row.image) {
            # P18 arrives as a full Special:FilePath URL; normalise + request a web-sized render
            $fileName = [System.Net.WebUtility]::UrlDecode(($row.image.value -split "/")[-1])
            $imageUrl = "https://commons.wikimedia.org/wiki/Special:FilePath/" + [System.Uri]::EscapeDataString($fileName) + "?width=900"
        }

        $wdItems[$qid] = [pscustomobject]@{
            qid      = $qid
            name     = $row.itemLabel.value
            lat      = $lat
            lng      = $lng
            opened   = $openedYear
            capacity = if ($row.capacity) { [int]$row.capacity.value } else { $null }
            image    = $imageUrl
            website  = if ($row.website) { $row.website.value } else { $null }
            article  = if ($row.article) { $row.article.value } else { $null }
        }
    }
}
Write-Host "Wikidata returned $($wdItems.Count) distinct venues."

# ---------------------------------------------------------------- matching ---

function Normalize-Name([string]$name) {
    $n = $name.ToLowerInvariant()
    foreach ($word in @("circuit", "raceway", "racing", "race", "track", "speed", "hill climb", "hillclimb", "motor", "park")) {
        $n = $n.Replace($word, " ")
    }
    ($n -replace "[^a-z0-9]", " " -replace "\s+", " ").Trim()
}

function Distance-Km($lat1, $lng1, $lat2, $lng2) {
    $rad = [Math]::PI / 180
    $dLat = ($lat2 - $lat1) * $rad
    $dLng = ($lng2 - $lng1) * $rad
    $a = [Math]::Sin($dLat / 2) * [Math]::Sin($dLat / 2) +
         [Math]::Cos($lat1 * $rad) * [Math]::Cos($lat2 * $rad) *
         [Math]::Sin($dLng / 2) * [Math]::Sin($dLng / 2)
    6371 * 2 * [Math]::Atan2([Math]::Sqrt($a), [Math]::Sqrt(1 - $a))
}

# Photo fallback: when a venue has no Wikidata image (P18), search Wikimedia
# Commons — first a TEXT search on the venue name + discipline (finds real
# venue photos), then a location search that still requires the venue name in
# the filename (a missing photo is better than a photo of the wrong thing).
function Format-CommonsUrl([string]$title) {
    "https://commons.wikimedia.org/wiki/Special:FilePath/" + [System.Uri]::EscapeDataString(($title -replace '^File:', '')) + "?width=900"
}

function Get-PhotoCore([string]$name) {
    $n = $name.ToLowerInvariant() -replace "['’]", ""
    ($n -replace "[^a-z0-9]", " " -replace "\s+", " ").Trim()
}

# Verifies a Commons photo title actually depicts the venue, not just its
# town. Uses the FULL name (not the track-matching Normalize-Name, which
# strips "raceway"/"stadium" etc.) — a title matching only a shared town name
# ("Northampton Power Station" for "Northampton International Raceway") is
# rejected; matching 2+ distinguishing words is required whenever available.
function Test-PhotoTitle([string]$title, [string]$fullName) {
    if ($title -notmatch '\.(jpe?g|png|webp)$') { return $false }
    if ($title -match 'map|logo|diagram|plan|crest|sign') { return $false }
    $titleNorm = " " + (Get-PhotoCore $title) + " "
    $words = @((Get-PhotoCore $fullName) -split ' ' | Where-Object { $_.Length -ge 4 -and $_ -ne "the" })
    if ($words.Count -eq 0) { return $false }
    if ($words.Count -eq 1) { return $titleNorm -match [regex]::Escape(" $($words[0]) ") }
    $hits = @($words | Where-Object { $titleNorm -match [regex]::Escape(" $_ ") }).Count
    return $hits -ge [Math]::Min(2, $words.Count)
}

function Get-CommonsPhoto($track) {
    $core = Normalize-Name $track.name
    $discipline = switch ($track.venueType) {
        "hill-climb" { "hillclimb" }
        "drag-strip" { "drag racing" }
        "rallycross-circuit" { "rallycross" }
        "kart-circuit" { "karting" }
        "speed-venue" { "airfield" }
        "other" { "beach" }
        default { "circuit" }
    }
    try {
        $q = [System.Net.WebUtility]::UrlEncode("$core $discipline")
        $url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=20&format=json&srsearch=$q"
        $res = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60
        foreach ($hit in $res.query.search) {
            if (Test-PhotoTitle $hit.title $track.name) { return Format-CommonsUrl $hit.title }
        }
    } catch { }
    try {
        $lat = $track.location.lat; $lng = $track.location.lng
        $url = "https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=$lat%7C$lng&gsradius=900&gsnamespace=6&gslimit=25&format=json"
        $res = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60
        foreach ($hit in $res.query.geosearch) {
            if (Test-PhotoTitle $hit.title $track.name) { return Format-CommonsUrl $hit.title }
        }
    } catch { }
    return $null
}

$tracks = Get-Content $tracksPath -Raw -Encoding UTF8 | ConvertFrom-Json
$matchedQids = @{}
$enriched = 0

foreach ($track in $tracks) {
    $trackNorm = Normalize-Name $track.name
    $best = $null

    foreach ($wd in $wdItems.Values) {
        $wdNorm = Normalize-Name $wd.name
        $nameHit = ($trackNorm -and $wdNorm) -and (($trackNorm -eq $wdNorm) -or $trackNorm.Contains($wdNorm) -or $wdNorm.Contains($trackNorm))
        $coordHit = $false
        if ($null -ne $wd.lat) {
            $coordHit = (Distance-Km $track.location.lat $track.location.lng $wd.lat $wd.lng) -lt 5
        }
        # Accept on name match confirmed by coords, or a very close coord match alone
        if (($nameHit -and $coordHit) -or ($coordHit -and (Distance-Km $track.location.lat $track.location.lng $wd.lat $wd.lng) -lt 1.5)) {
            $best = $wd
            break
        }
    }

    if ($best) {
        $matchedQids[$best.qid] = $true
        # Wikidata coordinates are authoritative over our seeded approximations
        if ($null -ne $best.lat) {
            $track.location.lat = [Math]::Round($best.lat, 5)
            $track.location.lng = [Math]::Round($best.lng, 5)
        }
        if ($best.image) { $track.image = $best.image }
        if ($best.website -and -not $track.website) { $track.website = $best.website }
        if ($best.opened -and -not $track.opened) { $track.opened = $best.opened }
        if ($best.capacity -and -not $track.capacity) { $track.capacity = $best.capacity }

        if (-not ($track.PSObject.Properties.Name -contains "wikidata")) {
            $track | Add-Member -NotePropertyName "wikidata" -NotePropertyValue $best.qid
        } else { $track.wikidata = $best.qid }

        $wiki = $null
        if ($best.article) { $wiki = $best.article }
        if (-not ($track.PSObject.Properties.Name -contains "wikipedia")) {
            $track | Add-Member -NotePropertyName "wikipedia" -NotePropertyValue $wiki
        } else { $track.wikipedia = $wiki }

        $track.verified = $true
        $enriched++
        Write-Host ("  matched  {0}  ->  {1} ({2})  image={3}" -f $track.name.PadRight(32), $best.name, $best.qid, [bool]$best.image)
    }
    else {
        # Fallback for venues the class query misses (drag strips, hill climbs
        # aren't 'race track' on Wikidata): search by name, then verify the
        # candidate's coordinates are within 5 km before trusting it.
        $found = $null
        try {
            # wbsearchentities matches on prefixes, so "X Hill Climb" won't find
            # "X Speed Hill Climb" — retry with the normalised core name.
            $searchTerms = @($track.name, (Normalize-Name $track.name)) | Select-Object -Unique
            $hits = @()
            foreach ($term in $searchTerms) {
                $searchUrl = "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=" + [System.Net.WebUtility]::UrlEncode($term)
                $search = Invoke-RestMethod -Uri $searchUrl -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60
                if ($search.search) { $hits += $search.search }
            }
            foreach ($hit in $hits) {
                # Two acceptance routes:
                #  a) entity has coordinates within 5 km of our record, or
                #  b) no coordinates, but the label matches strongly AND the
                #     description confirms a motorsport venue (guards against
                #     picking up the same-named village/manor/etc.)
                $nameStrong = (Normalize-Name $hit.label) -eq (Normalize-Name $track.name)
                $descMotorsport = $hit.description -match "motorsport|racing|race|circuit|hill ?climb|drag"

                $entityUrl = "https://www.wikidata.org/wiki/Special:EntityData/$($hit.id).json"
                $entity = (Invoke-RestMethod -Uri $entityUrl -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 60).entities.$($hit.id)
                $claims = $entity.claims
                $coordClaim = $claims.P625
                if ($coordClaim) {
                    $val = $coordClaim[0].mainsnak.datavalue.value
                    if ((Distance-Km $track.location.lat $track.location.lng $val.latitude $val.longitude) -ge 5) { continue }
                    if (-not ($nameStrong -or $descMotorsport)) { continue }
                }
                elseif (-not ($nameStrong -and $descMotorsport)) { continue }

                $img = $null
                if ($claims.P18) {
                    $fileName = $claims.P18[0].mainsnak.datavalue.value
                    $img = "https://commons.wikimedia.org/wiki/Special:FilePath/" + [System.Uri]::EscapeDataString($fileName) + "?width=900"
                }
                $openedY = $null
                foreach ($prop in @("P1619", "P571")) {
                    if ($claims.$prop) { $openedY = [int]$claims.$prop[0].mainsnak.datavalue.value.time.Substring(1, 4); break }
                }
                $enwiki = $null
                if ($entity.sitelinks -and $entity.sitelinks.enwiki) {
                    $enwiki = "https://en.wikipedia.org/wiki/" + ($entity.sitelinks.enwiki.title -replace " ", "_")
                }
                $foundLat = $null; $foundLng = $null
                if ($coordClaim) {
                    $cv = $coordClaim[0].mainsnak.datavalue.value
                    $foundLat = $cv.latitude; $foundLng = $cv.longitude
                }
                $found = [pscustomobject]@{
                    qid = $hit.id; name = $hit.label; image = $img; opened = $openedY
                    lat = $foundLat; lng = $foundLng
                    capacity = if ($claims.P1083) { [int]$claims.P1083[0].mainsnak.datavalue.value.amount.TrimStart("+") } else { $null }
                    website = if ($claims.P856) { $claims.P856[0].mainsnak.datavalue.value } else { $null }
                    article = $enwiki
                }
                break
            }
        } catch { Write-Host ("  fallback search failed for {0}: {1}" -f $track.name, $_.Exception.Message) }

        if ($found) {
            $matchedQids[$found.qid] = $true
            if ($null -ne $found.lat) {
                $track.location.lat = [Math]::Round($found.lat, 5)
                $track.location.lng = [Math]::Round($found.lng, 5)
            }
            if ($found.image) { $track.image = $found.image }
            if ($found.website -and -not $track.website) { $track.website = $found.website }
            if ($found.opened -and -not $track.opened) { $track.opened = $found.opened }
            if ($found.capacity -and -not $track.capacity) { $track.capacity = $found.capacity }
            if (-not ($track.PSObject.Properties.Name -contains "wikidata")) {
                $track | Add-Member -NotePropertyName "wikidata" -NotePropertyValue $found.qid
            } else { $track.wikidata = $found.qid }
            if (-not ($track.PSObject.Properties.Name -contains "wikipedia")) {
                $track | Add-Member -NotePropertyName "wikipedia" -NotePropertyValue $found.article
            } else { $track.wikipedia = $found.article }
            $track.verified = $true
            $enriched++
            Write-Host ("  matched* {0}  ->  {1} ({2})  image={3}   [name-search fallback]" -f $track.name.PadRight(32), $found.name, $found.qid, [bool]$found.image)
        }
        else {
            Write-Host ("  NO MATCH {0}" -f $track.name)
        }
    }
}

# Photo fallback pass: any track still without an image gets the nearest
# suitable Wikimedia Commons photo taken at its location.
foreach ($track in $tracks) {
    if (-not $track.image) {
        $photo = Get-CommonsPhoto $track
        if ($photo) {
            $track.image = $photo
            Write-Host ("  photo    {0}  <- Commons search" -f $track.name.PadRight(32))
        }
    }
}

# ------------------------------------------------------------- discoveries ---

# Venues flagged via the admin page's review flow stay out of the
# discovered list permanently.
$reviewPath = "$root/main/data/review-tracks.json"
$reviewQids = @{}
if (Test-Path $reviewPath) {
    foreach ($r in (Get-Content $reviewPath -Raw -Encoding UTF8 | ConvertFrom-Json)) { $reviewQids[$r.qid] = $true }
}

$discovered = @(
    $wdItems.Values |
    Where-Object { -not $matchedQids.ContainsKey($_.qid) -and $null -ne $_.lat -and -not $reviewQids.ContainsKey($_.qid) } |
    Sort-Object name |
    ForEach-Object {
        [ordered]@{
            qid = $_.qid; name = $_.name; lat = $_.lat; lng = $_.lng
            opened = $_.opened; capacity = $_.capacity; image = $_.image
            website = $_.website; wikipedia = $_.article
        }
    }
)

# ------------------------------------------------------------------- write ---

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tracksPath, ($tracks | ConvertTo-Json -Depth 10), $utf8NoBom)
[System.IO.File]::WriteAllText($discoveredPath, ($discovered | ConvertTo-Json -Depth 10), $utf8NoBom)

Write-Host ""
Write-Host "Done: $enriched of $($tracks.Count) tracks enriched from Wikidata."
Write-Host "Discovered (unmatched) venues for review: $($discovered.Count) -> data/discovered-tracks.json"
