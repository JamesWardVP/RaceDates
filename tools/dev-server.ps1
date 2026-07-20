# RaceDates development server
# Serves the main/ folder over HTTP so fetch() calls to data/*.json work.
# No dependencies — uses the .NET HttpListener built into Windows PowerShell.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-server.ps1

param(
    [int]$Port = 8765,
    [string]$Root = (Join-Path $PSScriptRoot "..\main")
)

$Root = (Resolve-Path $Root).Path

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".ico"  = "image/x-icon"
    ".md"   = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "RaceDates dev server running at http://localhost:$Port/ (serving $Root)"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart("/")
        if ($relPath -eq "") { $relPath = "index.html" }
        $fullPath = Join-Path $Root $relPath

        # Prevent escaping the web root
        $resolved = [System.IO.Path]::GetFullPath($fullPath)
        if (-not $resolved.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path $resolved -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
            $type = $mime[$ext]
            if (-not $type) { $type = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($resolved)
            $response.ContentType = $type
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - not found: /$relPath")
            $response.ContentType = "text/plain"
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.Close()
    }
}
finally {
    $listener.Stop()
}
