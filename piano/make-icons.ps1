# Draws the home-screen icons (a few piano keys, one lit in brass). Run once: powershell -File make-icons.ps1
Add-Type -AssemblyName System.Drawing
foreach ($size in 180, 512) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::FromArgb(18, 21, 25))
    $s = $size / 180.0
    $ivory = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(247, 244, 236))
    $brass = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(226, 176, 78))
    $ebony = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 28, 32))
    $edge  = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(18, 21, 25)), (3 * $s)
    $x0 = 26 * $s; $w = 32 * $s; $top = 40 * $s; $h = 104 * $s
    for ($i = 0; $i -lt 4; $i++) {
        $b = if ($i -eq 2) { $brass } else { $ivory }
        $g.FillRectangle($b, [float]($x0 + $i * $w), [float]$top, [float]$w, [float]$h)
        $g.DrawRectangle($edge, [float]($x0 + $i * $w), [float]$top, [float]$w, [float]$h)
    }
    foreach ($k in 1, 2) {
        $g.FillRectangle($ebony, [float]($x0 + $k * $w - 10 * $s), [float]$top, [float](20 * $s), [float](62 * $s))
    }
    $bmp.Save((Join-Path $PSScriptRoot "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
