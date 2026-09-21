$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$pkg = Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json
$buildDir = Resolve-Path (Join-Path $PSScriptRoot '..\.output\firefox-mv2')
$zipPath = Join-Path $PSScriptRoot "..\.output\$($pkg.name)-$($pkg.version)-firefox.zip"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in Get-ChildItem $buildDir -Recurse -File) {
    $relative = $file.FullName.Substring($buildDir.Path.Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally {
  $zip.Dispose()
}

Write-Host "Repacked $zipPath with standard zip entries"
