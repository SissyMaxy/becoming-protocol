# launch-hidden.ps1
#
# Spawns the scheduler on an invisible Win32 desktop object with stdout/stderr
# inherited as direct file handles. Every child process (browsers included)
# inherits the hidden desktop — no window can ever appear on your interactive
# desktop, on any virtual desktop.
#
# Unlike the previous iteration this does NOT route through cmd.exe. cmd.exe
# needs a console which requires a working conhost attached to an interactive
# window station — impossible on a hidden desktop. Instead we CreateProcess
# node.exe directly with STARTF_USESTDHANDLES + DETACHED_PROCESS.

param(
  [string]$DesktopName = "BPHiddenScheduler",
  [string]$WorkDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$code = @"
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public class Native {
  [StructLayout(LayoutKind.Sequential)]
  public struct STARTUPINFO {
    public uint cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public uint dwX;
    public uint dwY;
    public uint dwXSize;
    public uint dwYSize;
    public uint dwXCountChars;
    public uint dwYCountChars;
    public uint dwFillAttribute;
    public uint dwFlags;
    public ushort wShowWindow;
    public ushort cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public uint dwProcessId;
    public uint dwThreadId;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct SECURITY_ATTRIBUTES {
    public int nLength;
    public IntPtr lpSecurityDescriptor;
    public int bInheritHandle;
  }

  // Desktop access mask (full access)
  public const uint DESKTOP_CREATEMENU = 0x0004;
  public const uint DESKTOP_CREATEWINDOW = 0x0002;
  public const uint DESKTOP_ENUMERATE = 0x0040;
  public const uint DESKTOP_HOOKCONTROL = 0x0008;
  public const uint DESKTOP_JOURNALPLAYBACK = 0x0020;
  public const uint DESKTOP_JOURNALRECORD = 0x0010;
  public const uint DESKTOP_READOBJECTS = 0x0001;
  public const uint DESKTOP_SWITCHDESKTOP = 0x0100;
  public const uint DESKTOP_WRITEOBJECTS = 0x0080;

  public const uint CREATE_NEW_PROCESS_GROUP = 0x00000200;
  public const uint DETACHED_PROCESS = 0x00000008;
  public const uint CREATE_NO_WINDOW = 0x08000000;

  public const uint STARTF_USESTDHANDLES = 0x00000100;

  public const uint GENERIC_WRITE = 0x40000000;
  public const uint GENERIC_READ = 0x80000000;
  public const uint FILE_SHARE_READ = 0x00000001;
  public const uint FILE_SHARE_WRITE = 0x00000002;
  public const uint FILE_SHARE_DELETE = 0x00000004;
  public const uint CREATE_ALWAYS = 2;
  public const uint OPEN_EXISTING = 3;
  public const uint FILE_ATTRIBUTE_NORMAL = 0x80;

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateDesktop(string lpszDesktop, IntPtr lpszDevice, IntPtr pDevmode, uint dwFlags, uint dwDesiredAccess, IntPtr lpsa);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool CloseDesktop(IntPtr hDesktop);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcess(
      string lpApplicationName, string lpCommandLine,
      IntPtr lpProcessAttributes, IntPtr lpThreadAttributes,
      bool bInheritHandles, uint dwCreationFlags,
      IntPtr lpEnvironment, string lpCurrentDirectory,
      ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateFile(
      string lpFileName, uint dwDesiredAccess, uint dwShareMode,
      ref SECURITY_ATTRIBUTES lpSecurityAttributes, uint dwCreationDisposition,
      uint dwFlagsAndAttributes, IntPtr hTemplateFile);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CreateFile")]
  public static extern IntPtr CreateFileNullSa(
      string lpFileName, uint dwDesiredAccess, uint dwShareMode,
      IntPtr lpSecurityAttributes, uint dwCreationDisposition,
      uint dwFlagsAndAttributes, IntPtr hTemplateFile);
}
"@

Add-Type -TypeDefinition $code -ErrorAction Stop

$ALL_DESKTOP = [Native]::DESKTOP_CREATEMENU -bor [Native]::DESKTOP_CREATEWINDOW -bor `
  [Native]::DESKTOP_ENUMERATE -bor [Native]::DESKTOP_HOOKCONTROL -bor `
  [Native]::DESKTOP_JOURNALPLAYBACK -bor [Native]::DESKTOP_JOURNALRECORD -bor `
  [Native]::DESKTOP_READOBJECTS -bor [Native]::DESKTOP_SWITCHDESKTOP -bor `
  [Native]::DESKTOP_WRITEOBJECTS

$hDesktop = [Native]::OpenDesktop($DesktopName, 0, $true, $ALL_DESKTOP)
if ($hDesktop -eq [IntPtr]::Zero) {
  $hDesktop = [Native]::CreateDesktop($DesktopName, [IntPtr]::Zero, [IntPtr]::Zero, 0, $ALL_DESKTOP, [IntPtr]::Zero)
  if ($hDesktop -eq [IntPtr]::Zero) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "CreateDesktop('$DesktopName') failed. Win32 error $err"
  }
  Write-Host "Created hidden desktop: winsta0\$DesktopName"
} else {
  Write-Host "Reusing hidden desktop: winsta0\$DesktopName"
}

# Resolve node.exe and npx-cli.js
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { throw "node not found on PATH" }
$nodeDir = Split-Path $nodePath

$npxCli = $null
$candidates = @(
  (Join-Path $nodeDir "node_modules\npm\bin\npx-cli.js"),
  (Join-Path $nodeDir "node_modules\npm\node_modules\npx\bin\npx-cli.js"),
  "$env:APPDATA\npm\node_modules\npm\bin\npx-cli.js"
)
foreach ($c in $candidates) { if (Test-Path $c) { $npxCli = $c; break } }
if (-not $npxCli) { throw "npx-cli.js not found. Tried: $($candidates -join '; ')" }

# Resolve tsx — either globally installed or in local node_modules
$tsxBin = Join-Path $WorkDir "node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $tsxBin)) {
  $tsxBin = Join-Path $WorkDir "node_modules\.bin\tsx"
  if (-not (Test-Path $tsxBin)) { $tsxBin = $null }
}

# Prefer direct node invocation of the scheduler script via tsx cli.mjs.
# Skip npx entirely — simpler and more reliable for handle inheritance.
if (Test-Path (Join-Path $WorkDir "node_modules\tsx\dist\cli.mjs")) {
  $schedulerScript = Join-Path $WorkDir "scheduler.ts"
  $tsxCli = Join-Path $WorkDir "node_modules\tsx\dist\cli.mjs"
  $commandLine = "`"$nodePath`" `"$tsxCli`" `"$schedulerScript`""
} else {
  # Fallback: use npx-cli.js
  $commandLine = "`"$nodePath`" `"$npxCli`" tsx scheduler.ts"
}

# Open log file with CreateFile so we can pass inheritable handle to child.
$logDir = Join-Path $WorkDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("scheduler-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

$sa = New-Object Native+SECURITY_ATTRIBUTES
$sa.nLength = [System.Runtime.InteropServices.Marshal]::SizeOf($sa)
$sa.lpSecurityDescriptor = [IntPtr]::Zero
$sa.bInheritHandle = 1  # make the resulting handle inheritable

$hLog = [Native]::CreateFile(
  $logFile,
  [Native]::GENERIC_WRITE,
  [Native]::FILE_SHARE_READ -bor [Native]::FILE_SHARE_WRITE,
  [ref]$sa,
  [Native]::CREATE_ALWAYS,
  [Native]::FILE_ATTRIBUTE_NORMAL,
  [IntPtr]::Zero
)
if ($hLog -eq [IntPtr]::new(-1)) {
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "CreateFile('$logFile') failed. Win32 error $err"
}

# stdin: open NUL device for read so node's stdin is valid but blocked.
$hNul = [Native]::CreateFile(
  "NUL",
  [Native]::GENERIC_READ,
  [Native]::FILE_SHARE_READ -bor [Native]::FILE_SHARE_WRITE,
  [ref]$sa,
  [Native]::OPEN_EXISTING,
  [Native]::FILE_ATTRIBUTE_NORMAL,
  [IntPtr]::Zero
)

$si = New-Object Native+STARTUPINFO
$si.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($si)
$si.lpDesktop = "winsta0\$DesktopName"
$si.dwFlags = [Native]::STARTF_USESTDHANDLES
$si.hStdInput = $hNul
$si.hStdOutput = $hLog
$si.hStdError = $hLog

$pi = New-Object Native+PROCESS_INFORMATION

# DETACHED_PROCESS: no console. CREATE_NO_WINDOW belt-and-suspenders.
# bInheritHandles = TRUE so node inherits the log handle.
$flags = [Native]::DETACHED_PROCESS -bor [Native]::CREATE_NO_WINDOW -bor [Native]::CREATE_NEW_PROCESS_GROUP

Write-Host "AppName:     $nodePath"
Write-Host "CommandLine: $commandLine"
Write-Host "LogFile:     $logFile"

$ok = [Native]::CreateProcess(
  $nodePath,
  $commandLine,
  [IntPtr]::Zero, [IntPtr]::Zero,
  $true,  # bInheritHandles
  $flags,
  [IntPtr]::Zero,
  $WorkDir,
  [ref]$si,
  [ref]$pi
)

if (-not $ok) {
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [Native]::CloseHandle($hLog) | Out-Null
  [Native]::CloseHandle($hNul) | Out-Null
  [Native]::CloseDesktop($hDesktop) | Out-Null
  throw "CreateProcess failed. Win32 error $err"
}

# Close parent-side handles — child has its own copies via inheritance.
[Native]::CloseHandle($hLog) | Out-Null
[Native]::CloseHandle($hNul) | Out-Null
[Native]::CloseHandle($pi.hProcess) | Out-Null
[Native]::CloseHandle($pi.hThread) | Out-Null
[Native]::CloseDesktop($hDesktop) | Out-Null

Write-Host ""
Write-Host "Scheduler launched on hidden desktop."
Write-Host "  Desktop: winsta0\$DesktopName"
Write-Host "  PID:     $($pi.dwProcessId)"
Write-Host "  CWD:     $WorkDir"
Write-Host ""
Write-Host "Tail logs (run this in any terminal, any desktop):"
Write-Host "  Get-Content -Path `"$logFile`" -Wait -Tail 50"
Write-Host ""
Write-Host "Stop scheduler:"
Write-Host "  Stop-Process -Id $($pi.dwProcessId) -Force"
