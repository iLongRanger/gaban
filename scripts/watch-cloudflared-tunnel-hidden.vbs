Option Explicit

Dim shell, fso, scriptDir, watchdogScript, powershellPath, command, exitCode

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
watchdogScript = fso.BuildPath(scriptDir, "watch-cloudflared-tunnel.ps1")
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

command = """" & powershellPath & """ -NoProfile -ExecutionPolicy Bypass -File """ & watchdogScript & """"
exitCode = shell.Run(command, 0, True)

WScript.Quit exitCode
