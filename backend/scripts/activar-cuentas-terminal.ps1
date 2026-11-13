$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'SaludClick - Activacion administrativa privada'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$rutaRecibo = Join-Path $PSScriptRoot 'activacion-administrativa-resultado.json'
[System.IO.File]::WriteAllText($rutaRecibo, '{"enCurso":true}', [System.Text.UTF8Encoding]::new($false))
Write-Host 'Las contrasenas se introducen solo aqui y no se muestran. Minimo 12 caracteres, maximo 72 bytes.'
Write-Host 'Primero escribe ACTIVAR cuando el comando lo solicite.'
& node (Join-Path $PSScriptRoot 'activar-cuentas-administrativamente.cjs') --apply
$codigoActivacion = $LASTEXITCODE
# Solo resultado operativo: no se captura stdout, stdin ni credenciales.
$reciboActivacion = [ordered]@{
    codigoSalida = $codigoActivacion
    loginVerificado = ($codigoActivacion -eq 0)
    finalizadoUtc = [DateTime]::UtcNow.ToString('o')
}
[System.IO.File]::WriteAllText($rutaRecibo, ($reciboActivacion | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
Write-Host 'Procedimiento terminado. Puedes volver a la conversacion.'
