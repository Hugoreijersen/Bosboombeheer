# De Bosboom lokaal draaien om wijzigingen te bekijken vóór je pusht (Windows).
#     .\dev.ps1            start op http://localhost:8090  (stoppen: Ctrl+C)
#     .\dev.ps1 -Reset     begin opnieuw met een lege test-database
# Zelfde als dev.sh (Mac/Linux): dezelfde PocketBase, migraties en hooks als de Pi,
# met een eigen test-database. html/css/js wijzigen: browser herladen is genoeg.
# pb_hooks of pb_migrations wijzigen: Ctrl+C en opnieuw starten.
param([switch]$Reset, [int]$Port = 8090)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$PbVersion = "0.40.6"
$Dev = Join-Path $env:LOCALAPPDATA "bosboom-dev"
$AdminEmail = "admin@bosboom.local"; $AdminPass = "bosboom-dev"

if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  $Arch = "windows_arm64"; $Sum = "7ca50a72b768965f0da194b907d2a1e8865e614cdbebb27fa64ca7ff1d7f5182"
} else {
  $Arch = "windows_amd64"; $Sum = "33a2a1d255cadded77346fc7f5de37dca21ba4bad0d9cae0235a50b3b703d6d9"
}

$Pb = Join-Path $Dev "pocketbase.exe"
New-Item -ItemType Directory -Force -Path $Dev | Out-Null
$have = if (Test-Path $Pb) { & $Pb --version 2>$null } else { "" }
if (-not ($have -match [regex]::Escape($PbVersion))) {
  Write-Host "==> PocketBase $PbVersion downloaden (eenmalig)"
  $zip = Join-Path $env:TEMP "pocketbase_${PbVersion}_${Arch}.zip"
  Invoke-WebRequest -UseBasicParsing -OutFile $zip "https://github.com/pocketbase/pocketbase/releases/download/v$PbVersion/pocketbase_${PbVersion}_${Arch}.zip"
  if ((Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower() -ne $Sum) { Remove-Item $zip; throw "Checksum klopt niet, gestopt." }
  $out = Join-Path $env:TEMP "bosboom-pb"
  Expand-Archive -Force -Path $zip -DestinationPath $out
  Copy-Item -Force (Join-Path $out "pocketbase.exe") $Pb
  Remove-Item -Recurse -Force $zip, $out
}

if ($Reset) { Write-Host "==> Test-database leeggemaakt"; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $Dev "pb_data") }

$Dirs = @("--dir=$(Join-Path $Dev 'pb_data')", "--hooksDir=$(Join-Path $PWD 'pb_hooks')", "--migrationsDir=$(Join-Path $PWD 'pb_migrations')")
& $Pb superuser upsert $AdminEmail $AdminPass @Dirs | Out-Null

Write-Host @"

  De app:         http://localhost:$Port/
  Als kiosk:      http://localhost:$Port/?kiosk=1   (terug: ?kiosk=0)
                  Tip: in Chrome F12 > apparaatknop, 480 x 800, dan zie je het staande scherm.
  Beheerscherm:   http://localhost:$Port/_/   ($AdminEmail / $AdminPass, alleen lokaal)

  Maak in de app een account en claim een boom, net als op de Pi.
  Stoppen: Ctrl+C

"@
& $Pb serve "--http=127.0.0.1:$Port" "--publicDir=$PWD" @Dirs
