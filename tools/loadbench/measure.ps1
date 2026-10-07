# Samples whole-PC load for N seconds and prints JSON (to compare games with these sites)
#   powershell -ExecutionPolicy Bypass -File tools\loadbench\measure.ps1 -Seconds 20 -Label idle
# cpu = all-core average %, gpu = sum of 3D engine utilisation (capped at 100), memGB = committed memory
param([int]$Seconds = 20, [string]$Label = 'sample', [string]$ProcessFilter = '')
$counters = @('\Processor(_Total)\% Processor Time', '\Memory\Committed Bytes', '\GPU Engine(*engtype_3D)\Utilization Percentage')
$samples = Get-Counter -Counter $counters -SampleInterval 1 -MaxSamples $Seconds -ErrorAction SilentlyContinue
$cpu = @(); $gpu = @(); $mem = @()
foreach ($s in $samples) {
  $cs = $s.CounterSamples
  $cpu += ($cs | Where-Object { $_.Path -like '*% processor time' } | Select-Object -First 1).CookedValue
  $mem += ($cs | Where-Object { $_.Path -like '*committed bytes' } | Select-Object -First 1).CookedValue
  $gpu += [math]::Min(100, (($cs | Where-Object { $_.Path -like '*utilization percentage' } | Measure-Object CookedValue -Sum).Sum))
}
$procMB = $null
if ($ProcessFilter) {   # working set of the matching processes
  $procMB = [math]::Round(((Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$ProcessFilter*" } | Measure-Object WorkingSetSize -Sum).Sum) / 1MB)
}
[pscustomobject]@{
  label   = $Label
  seconds = $samples.Count
  cpu     = [math]::Round(($cpu | Measure-Object -Average).Average, 1)
  cpuMax  = [math]::Round(($cpu | Measure-Object -Maximum).Maximum, 1)
  gpu     = [math]::Round(($gpu | Measure-Object -Average).Average, 1)
  gpuMax  = [math]::Round(($gpu | Measure-Object -Maximum).Maximum, 1)
  memGB   = [math]::Round((($mem | Measure-Object -Average).Average) / 1GB, 2)
  procMB  = $procMB
} | ConvertTo-Json -Compress
