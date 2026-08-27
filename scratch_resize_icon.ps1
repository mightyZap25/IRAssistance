Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path "build\icon_256.png").Path)
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 256, 256)
$bmp.Save((Resolve-Path "build").Path + "\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
$g.Dispose()
$bmp.Dispose()
