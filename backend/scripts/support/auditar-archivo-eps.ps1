# Transporte interno consumido en memoria por auditar-origen-eps.cjs.
# No ejecutar directamente: incluye variables privadas del archivo histórico.
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not $env:EPS_HISTORICAL_ARCHIVE) { throw 'Configura EPS_HISTORICAL_ARCHIVE con la ruta privada del archivo historico.' }
$rutaHistorica = (Resolve-Path -LiteralPath $env:EPS_HISTORICAL_ARCHIVE -ErrorAction Stop).Path
$archivoZip = [System.IO.Compression.ZipFile]::OpenRead($rutaHistorica)
try {
    $entornos = @()
    $archivosSql = @()
    foreach ($entrada in $archivoZip.Entries) {
        if ($entrada.FullName -match 'node_modules/|\.git/') { continue }
        if ($entrada.FullName -notmatch '(^|/)\.env$|\.(sql|prisma)$') { continue }
        $lector = [IO.StreamReader]::new($entrada.Open())
        try { $texto = $lector.ReadToEnd() } finally { $lector.Dispose() }
        if ($entrada.FullName -match '(^|/)\.env$') {
            $entornos += @{ fuente = $entrada.FullName; texto = $texto }
        } else {
            $tablas = @([regex]::Matches($texto, '(?im)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)') | ForEach-Object { $_.Groups[1].Value })
            $coincide = [regex]::IsMatch($texto, '(?is)(CREATE\s+TABLE|INSERT\s+INTO|model)\s+["`]?eps\b|eps_id|entidad.{0,25}promotora')
            $archivosSql += @{ archivo = $entrada.FullName; tablas = $tablas; candidatoEPS = $coincide }
        }
    }
    @{ entornos = $entornos; archivos = $archivosSql } | ConvertTo-Json -Depth 7 -Compress
} finally { $archivoZip.Dispose() }
