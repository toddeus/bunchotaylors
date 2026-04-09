$path = 'C:\dev\eclipse_workspaces\sts5\bunch-o-taylors\temp\bunchotaylors.db'
$bytes = [System.IO.File]::ReadAllBytes($path)
$text = [System.Text.Encoding]::ASCII.GetString($bytes) -replace '[^\x20-\x7E\n\r\t]',' '

# Look for date patterns (YYYY-MM-DD)
$matches = [regex]::Matches($text, '\d{4}-\d{2}-\d{2}')
"=== Sample postdate values ==="
$matches | Select-Object -First 20 | ForEach-Object { $_.Value }

# Look for what appears to be directory paths (slash-separated)
"=== Sample dir-like values ==="
$dirmatches = [regex]::Matches($text, '[A-Za-z0-9_]+/[A-Za-z0-9_/.-]+')
$dirmatches | Select-Object -First 20 | ForEach-Object { $_.Value }
