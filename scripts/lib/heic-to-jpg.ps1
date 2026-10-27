# Décodage HEIC/HEIF -> PNG (sans perte) avec le décodeur d'images de Windows (WIC).
# Nécessite l'extension « HEIF Image Extensions » (présente sur la plupart des
# Windows 10/11). Appelé par scripts/optimize-photos.mjs, qui écrit ensuite le
# JPEG final avec la date de prise de vue. L'original est conservé.
#
# Le décodeur applique déjà la rotation propre au HEIC : l'image est écrite
# telle quelle, sans recopier l'orientation EXIF (sinon elle pivoterait deux fois).
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

$decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
  [Uri]$Source,
  [System.Windows.Media.Imaging.BitmapCreateOptions]::None,
  [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
$frame = $decoder.Frames[0]

# Orientation restante éventuelle (normalement 1 après décodage)
$image = $frame
$orientation = 1
try { $o = $frame.Metadata.GetQuery('System.Photo.Orientation'); if ($o) { $orientation = [int]$o } } catch {}
$angle = switch ($orientation) { 3 { 180 } 6 { 90 } 8 { 270 } default { 0 } }
if ($angle -ne 0) {
  $image = New-Object System.Windows.Media.Imaging.TransformedBitmap($frame, (New-Object System.Windows.Media.RotateTransform($angle)))
}

$encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
$encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($image))
$stream = [System.IO.File]::Create($Destination)
try { $encoder.Save($stream) } finally { $stream.Close() }
