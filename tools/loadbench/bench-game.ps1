# Load score for any game (same method as the browser trainer measurement).
#   powershell -ExecutionPolicy Bypass -File tools\loadbench\bench-game.ps1 -Name R6S
# 1) measures the idle PC for 15 s (close the game first), 2) gives you 20 s to start playing,
# 3) measures 30 s while you play, then prints the score.
# Score (0-100, lower = lighter) = 0.4 x CPU increase % + 0.4 x GPU % + 0.2 x RAM increase as % of total RAM
param([string]$Name = 'game', [int]$Seconds = 30)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$m = Join-Path $here 'measure.ps1'
Write-Host "[1/3] Measuring idle PC for 15 s. Keep the game closed..."
$idle = & powershell -NoProfile -ExecutionPolicy Bypass -File $m -Seconds 15 -Label idle | ConvertFrom-Json
Write-Host "[2/3] Start the game and get into a match / shooting range. Measuring starts in 20 s."
for ($i = 20; $i -gt 0; $i--) { Write-Host -NoNewline "$i "; Start-Sleep -Seconds 1 }
Write-Host ""
Write-Host "[3/3] Measuring for $Seconds s. Keep playing..."
$run = & powershell -NoProfile -ExecutionPolicy Bypass -File $m -Seconds $Seconds -Label $Name | ConvertFrom-Json
$totalGB = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
$dCpu = [math]::Max(0, $run.cpu - $idle.cpu)
$dMem = [math]::Max(0, $run.memGB - $idle.memGB)
$score = [math]::Round(0.4 * $dCpu + 0.4 * $run.gpu + 0.2 * ($dMem / $totalGB * 100), 1)
[pscustomobject]@{ name = $Name; cpuIncrease = [math]::Round($dCpu, 1); gpu = $run.gpu; ramIncreaseGB = [math]::Round($dMem, 2); score = $score } | Format-List
