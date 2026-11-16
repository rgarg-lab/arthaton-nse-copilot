<#
.SYNOPSIS
  Register (or remove) a daily Windows task that keeps the price panel current.

.DESCRIPTION
  The panel is a committed parquet file. Without something running on a schedule it is only
  as fresh as the last time somebody started the app, which is why the board has spent this
  project reading "N sessions behind".

  This registers one Scheduled Task that runs `python ml/tasks.py catchup` every evening
  after the NSE close. That target tops the price history up incrementally and rewrites
  today's signals from the **existing** model. It never runs `train` or `eval`: those would
  refit a model that BUILD_SPEC.md §6.5 freezes and append a second authoritative read to
  the holdout ledger, which would turn the headline accuracy from out-of-sample into
  meaningless. `ml/tests/test_catchup_chain.py` fails the build if that ever changes.

  It is a per-user task. It does not require admin rights, it does not touch system or
  security settings, and it is removed with a single flag — see -Remove.

.PARAMETER Time
  24h local time to run. Default 18:30, which is after the 15:30 IST close with room for
  Yahoo to publish.

.PARAMETER Remove
  Unregister the task and exit.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\schedule-catchup.ps1
  powershell -ExecutionPolicy Bypass -File scripts\schedule-catchup.ps1 -Time 19:00
  powershell -ExecutionPolicy Bypass -File scripts\schedule-catchup.ps1 -Remove
#>

param(
  [string]$Time = "18:30",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$TaskName = "NSE Copilot - daily data catch-up"

# The repo root is this script's parent directory, so the task works wherever the project
# is checked out rather than hard-coding one machine's path.
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "removed: $TaskName"
  } else {
    Write-Output "not registered: $TaskName"
  }
  exit 0
}

# The venv interpreter if it exists — the same precedence `npm run demo` uses, and for the
# same reason: the system Python usually lacks this project's dependencies.
$Python = Join-Path $Root "ml\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = "python" }

$LogDir = Join-Path $Root "ml\data\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir "catchup.log"

# cmd /c so stdout and stderr can be appended to a log the user can actually read after a
# silent overnight failure.
$Action = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c `"`"$Python`" ml\tasks.py catchup >> `"$Log`" 2>&1`"" `
  -WorkingDirectory $Root

$Trigger = New-ScheduledTaskTrigger -Daily -At $Time

# StartWhenAvailable catches up after the machine was asleep at the scheduled time, which
# on a laptop is most evenings. The time limit stops a throttled Yahoo from leaving a
# process running all night.
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
  -Settings $Settings -Description "Tops up NSE price data and rewrites today's signals. Never retrains." `
  -Force | Out-Null

Write-Output "registered: $TaskName"
Write-Output "  runs      : daily at $Time"
Write-Output "  command   : $Python ml\tasks.py catchup"
Write-Output "  working in: $Root"
Write-Output "  log       : $Log"
Write-Output ""
Write-Output "Run it now to check:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "Remove it:            powershell -File scripts\schedule-catchup.ps1 -Remove"
