// Windows-only persistent window hider. Arms once per process.
//
// Two-path detection:
//   1. SetWinEventHook(EVENT_OBJECT_SHOW) — fires synchronously when any
//      top-level window is shown, across all processes. This catches the
//      browser window before it paints, eliminating the cross-desktop flash.
//   2. 20ms poll fallback — in case a window slips past the hook (e.g.
//      during hook setup or pump stall).
//
// Ownership check: we track the scheduler's PID and walk each browser's
// parent-PID chain. Only hide browsers whose ancestor chain includes the
// scheduler — your personal Chrome/Firefox windows are untouched.
//
// Virtual desktops: MoveWindowToDesktop only works on windows your own
// process owns (returns E_ACCESSDENIED for external processes). We don't
// use it. Instead: SetParent(hwnd, HWND_MESSAGE) detaches the window from
// the desktop tree entirely, making it invisible on all virtual desktops
// regardless of which is active. Belt-and-suspenders: also SW_MINIMIZE
// and SW_HIDE.

import { spawn } from 'child_process';

let armed = false;

export function armStealthWindowHider(): void {
  if (armed) return;
  armed = true;
  if (process.platform !== 'win32') return;

  const ownerPid = process.pid;

  const script = `
$ownerPid = ${ownerPid}
$code = @"
using System;
using System.Runtime.InteropServices;
public class W {
  public const int SW_HIDE = 0;
  public const int SW_MINIMIZE = 6;
  public static readonly IntPtr HWND_MESSAGE = new IntPtr(-3);
  public const uint SWP_NOACTIVATE = 0x0010;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint EVENT_OBJECT_SHOW = 0x8002;
  public const uint EVENT_OBJECT_CREATE = 0x8000;
  public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
  public const uint WINEVENT_SKIPOWNPROCESS = 0x0002;

  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc e, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
  [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);
  [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hWinEventHook);
  [DllImport("user32.dll")] public static extern int GetMessage(out MSG msg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
  [DllImport("user32.dll")] public static extern bool TranslateMessage([In] ref MSG lpMsg);
  [DllImport("user32.dll")] public static extern IntPtr DispatchMessage([In] ref MSG lpmsg);

  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

  [StructLayout(LayoutKind.Sequential)]
  public struct MSG {
    public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int pt_x; public int pt_y;
  }
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

# ownedPids: pids of browsers whose ancestor chain includes our scheduler.
# Rebuilt every 500ms in a background runspace to avoid blocking the message loop.
$ownedPids = [System.Collections.Concurrent.ConcurrentDictionary[int,bool]]::new()

function Refresh-OwnedPids {
  try {
    $allProcs = Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue
    $parentMap = @{}
    foreach ($p in $allProcs) { $parentMap[$p.ProcessId] = $p.ParentProcessId }
    $browsers = $allProcs | Where-Object { $_.Name -match '^(chrome|firefox|msedge|chromium|plugin-container)\.exe$' }
    $newSet = @{}
    foreach ($b in $browsers) {
      $cur = $b.ProcessId
      $depth = 0
      while ($cur -and $depth -lt 20) {
        if ($cur -eq $ownerPid) { $newSet[$b.ProcessId] = $true; break }
        if (-not $parentMap.ContainsKey($cur)) { break }
        $cur = $parentMap[$cur]
        $depth++
      }
    }
    # Replace atomically
    $ownedPids.Clear()
    foreach ($k in $newSet.Keys) { $ownedPids.TryAdd($k, $true) | Out-Null }
  } catch {}
}

function Hide-IfOwned {
  param([IntPtr]$h)
  if ($h -eq [IntPtr]::Zero) { return }
  $procId = 0
  [W]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  if ($ownedPids.ContainsKey([int]$procId)) {
    # Stage 1: shove offscreen immediately (cheapest, catches any paint)
    [W]::SetWindowPos($h, [IntPtr]::Zero, -32000, -32000, 1, 1, [W]::SWP_NOACTIVATE -bor [W]::SWP_NOZORDER) | Out-Null
    # Stage 2: reparent to HWND_MESSAGE — detaches window from desktop tree
    # entirely. Window becomes a message-only window, invisible on every
    # virtual desktop regardless of which is active.
    try { [W]::SetParent($h, [W]::HWND_MESSAGE) | Out-Null } catch {}
    # Stage 3: minimize then hide. SW_MINIMIZE first is more reliable than
    # direct SW_HIDE because some windows resist single-step hide.
    [W]::ShowWindow($h, [W]::SW_MINIMIZE) | Out-Null
    [W]::ShowWindow($h, [W]::SW_HIDE) | Out-Null
  }
}

# Register the WinEventHook callback — fires synchronously on window show/create.
# Use a script-level variable to keep the delegate alive (GC would otherwise
# collect it mid-callback and crash).
$script:winEventDelegate = [W+WinEventDelegate] {
  param($hook, $eventType, $hwnd, $idObject, $idChild, $thread, $time)
  if ($idObject -ne 0) { return }  # Only care about WINDOW objects (idObject=0)
  Hide-IfOwned $hwnd
}

$hook = [W]::SetWinEventHook(
  [W]::EVENT_OBJECT_CREATE, [W]::EVENT_OBJECT_SHOW,
  [IntPtr]::Zero, $script:winEventDelegate,
  0, 0,
  [W]::WINEVENT_OUTOFCONTEXT -bor [W]::WINEVENT_SKIPOWNPROCESS
)

# Kick off an immediate ownership refresh, then re-refresh every ~500ms via
# timer messages posted to our queue.
Refresh-OwnedPids
$lastRefresh = [Environment]::TickCount
$lastSweep = 0

# Pump messages so the hook can fire. Also periodically refresh ownership
# and do a belt-and-suspenders EnumWindows sweep.
$msg = New-Object W+MSG
while ($true) {
  # Non-blocking-ish: process any pending messages, then do periodic work.
  # Use PeekMessage-style loop via GetMessage with short yield.
  $now = [Environment]::TickCount
  if (($now - $lastRefresh) -ge 500) { Refresh-OwnedPids; $lastRefresh = $now }
  if (($now - $lastSweep) -ge 20) {
    $lastSweep = $now
    if ($ownedPids.Count -gt 0) {
      [W]::EnumWindows({
        param($h, $p)
        if ([W]::IsWindowVisible($h)) { Hide-IfOwned $h }
        return $true
      }, [IntPtr]::Zero) | Out-Null
    }
  }
  # Pump any queued window events (hook callbacks arrive here).
  $haveMsg = [W]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0)
  if ($haveMsg -gt 0) {
    [W]::TranslateMessage([ref]$msg) | Out-Null
    [W]::DispatchMessage([ref]$msg) | Out-Null
  } else {
    Start-Sleep -Milliseconds 5
  }
}
  `;

  try {
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    ps.unref();
  } catch {
    // Offscreen launch args remain the primary defense.
  }
}
