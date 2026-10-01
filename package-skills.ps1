param(
  [string]$SkillsDir = "skills",
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($RepoRoot)) { $RepoRoot = (Get-Location).Path }

$SkillsRoot = Join-Path $RepoRoot $SkillsDir
$OutRoot = Join-Path $RepoRoot $OutputDir

if (-not (Test-Path -LiteralPath $SkillsRoot)) {
  Write-Error "Skills dir not found: $SkillsRoot"
  exit 1
}

New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null

$SkillDirs = Get-ChildItem -LiteralPath $SkillsRoot -Directory | Where-Object {
  Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md")
}

if ($SkillDirs.Count -eq 0) {
  Write-Error "No skills found (no SKILL.md under $SkillsRoot)"
  exit 1
}

$Built = @()
foreach ($Dir in $SkillDirs) {
  $SkillMd = Join-Path $Dir.FullName "SKILL.md"
  $FrontName = $null
  foreach ($Line in (Get-Content -LiteralPath $SkillMd -TotalCount 10)) {
    if ($Line -match '^\s*name\s*:\s*(.+?)\s*$') { $FrontName = $Matches[1].Trim(); break }
  }
  if ($FrontName -and ($FrontName -ne $Dir.Name)) {
    Write-Warning ("{0}: dir name '{1}' != frontmatter name '{2}'" -f $Dir.Name, $Dir.Name, $FrontName)
  }
  $SkillName = $Dir.Name
  $OutFile = Join-Path $OutRoot ($SkillName + ".skill")
  if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }

  $StageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("skill-pkg-" + [System.Guid]::NewGuid().ToString("N"))
  $StageSkill = Join-Path $StageRoot $SkillName
  try {
    New-Item -ItemType Directory -Path $StageSkill -Force | Out-Null
    Get-ChildItem -LiteralPath $Dir.FullName -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $StageSkill -Recurse -Force
    }
    foreach ($Drop in @("node_modules", ".git", "__pycache__", ".venv", "dist")) {
      $P = Join-Path $StageSkill $Drop
      if (Test-Path -LiteralPath $P) { Remove-Item -LiteralPath $P -Recurse -Force }
    }
    Get-ChildItem -LiteralPath $StageSkill -Recurse -Force | Where-Object {
      ($_.Name -eq ".DS_Store") -or ($_.Name -eq "Thumbs.db") -or ($_.Extension -eq ".skill")
    } | Remove-Item -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path -LiteralPath (Join-Path $StageSkill "SKILL.md"))) {
      throw "Staging lost SKILL.md for $SkillName"
    }

    $TmpZip = [System.IO.Path]::ChangeExtension($OutFile, ".zip")
    if (Test-Path -LiteralPath $TmpZip) { Remove-Item -LiteralPath $TmpZip -Force }
    Compress-Archive -Path $StageSkill -DestinationPath $TmpZip -Force
    if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }
    Move-Item -LiteralPath $TmpZip -Destination $OutFile -Force
    $Bytes = (Get-Item -LiteralPath $OutFile).Length
    $Built += ("{0}.skill ({1:N0} bytes)" -f $SkillName, $Bytes)
    Write-Output ("packed {0} -> {1}" -f $SkillName, $OutFile)
  }
  finally {
    if (Test-Path -LiteralPath $StageRoot) { Remove-Item -LiteralPath $StageRoot -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

Write-Output ("Done: {0} skills -> {1}" -f $Built.Count, $OutRoot)
$Built | ForEach-Object { Write-Output ("  " + $_) }
