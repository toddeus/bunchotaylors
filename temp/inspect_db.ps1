$path = 'C:\dev\eclipse_workspaces\sts5\bunch-o-taylors\temp\bunchotaylors.db'
$bytes = [System.IO.File]::ReadAllBytes($path)
$text = [System.Text.Encoding]::ASCII.GetString($bytes) -replace '[^\x20-\x7E]',' '
$idx = $text.IndexOf('CREATE')
if ($idx -ge 0) {
    $text.Substring($idx, [Math]::Min(4000, $text.Length - $idx))
} else {
    "CREATE not found. First 500 chars:"
    $text.Substring(0, [Math]::Min(500, $text.Length))
}
