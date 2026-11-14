# Stand with Jensen 镜像 → 桌面 TXT（每 15 分钟）
$node = 'C:\Users\39557\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$script = 'E:\新建文件夹 (5)\mfhry-site\scripts\export-jensen-desktop.mjs'
$log = 'E:\新建文件夹 (5)\tmp\jensen-desktop.log'
try {
  $out = & $node $script 2>&1 | Out-String
  Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $out.Trim())
} catch {
  Add-Content -Path $log -Value ("{0} ERROR {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $_.Exception.Message)
}
