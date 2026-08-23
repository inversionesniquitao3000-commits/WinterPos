Add-Type -AssemblyName System.Drawing

$srcSidebar = "C:\Users\Casa\.gemini\antigravity-ide\brain\20fbd6a0-c5a9-4a68-a601-afde86bb9888\wizard_sidebar_art_1787509261180.jpg"
$srcBanner  = "C:\Users\Casa\.gemini\antigravity-ide\brain\20fbd6a0-c5a9-4a68-a601-afde86bb9888\winterpos_banner_bg_1787509246007.jpg"
$destDir    = "C:\Users\Casa\.gemini\antigravity-ide\scratch\WinterPos\installer"

# 1. wizard_sidebar.bmp (Modern Inno sidebar: 164x314 and 497x314 for full width)
$imgSidebar = [System.Drawing.Image]::FromFile($srcSidebar)
$bmpSidebar = New-Object System.Drawing.Bitmap(164, 314)
$g1 = [System.Drawing.Graphics]::FromImage($bmpSidebar)
$g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g1.DrawImage($imgSidebar, 0, 0, 164, 314)
$g1.Dispose()
$bmpSidebar.Save((Join-Path $destDir "wizard_sidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmpSidebar.Dispose()
$imgSidebar.Dispose()
Write-Host "wizard_sidebar.bmp creado (164x314)"

# 2. wizard_card.bmp (Visual illustration card for custom pages: 170x210)
$imgBanner = [System.Drawing.Image]::FromFile($srcBanner)
$bmpCard = New-Object System.Drawing.Bitmap(170, 210)
$g2 = [System.Drawing.Graphics]::FromImage($bmpCard)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($imgBanner, 0, 0, 170, 210)
$g2.Dispose()
$bmpCard.Save((Join-Path $destDir "wizard_card.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmpCard.Dispose()

# 3. wizard_small.bmp (Header icon 55x58)
$bmpSmall = New-Object System.Drawing.Bitmap(55, 58)
$g3 = [System.Drawing.Graphics]::FromImage($bmpSmall)
$g3.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g3.DrawImage($imgBanner, 0, 0, 55, 58)
$g3.Dispose()
$bmpSmall.Save((Join-Path $destDir "wizard_small.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmpSmall.Dispose()

$imgBanner.Dispose()
Write-Host "Assets de instalador generados exitosamente en installer/"
