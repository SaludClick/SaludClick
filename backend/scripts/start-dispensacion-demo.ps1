param(
    [Parameter(Mandatory=$true)][string]$PostgresBin
)

$ErrorActionPreference = 'Stop'
if (-not $env:SALUDCLICK_DEMO_PASSWORD) {
    throw 'Define SALUDCLICK_DEMO_PASSWORD antes de iniciar la demo.'
}
$project = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$bin = (Resolve-Path -LiteralPath $PostgresBin).Path
$root = Join-Path $project ('node_modules/.saludclick-demo/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
$data = Join-Path $root 'data'
& (Join-Path $bin 'initdb.exe') -D $data -U saludclick_demo -A trust -E UTF8 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar PostgreSQL de demostración.' }

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$env:SALUDCLICK_DEMO_PG_PORT = [string]$listener.LocalEndpoint.Port
$listener.Stop()
Start-Process -FilePath (Join-Path $bin 'postgres.exe') -ArgumentList "-D `"$data`" -h 127.0.0.1 -p $env:SALUDCLICK_DEMO_PG_PORT" -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'postgres.err') -RedirectStandardOutput (Join-Path $root 'postgres.out')
Push-Location $project
try {
    @'
const { Client } = require("./backend/node_modules/pg");
(async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
        const c = new Client({ host: "127.0.0.1", port: Number(process.env.SALUDCLICK_DEMO_PG_PORT),
            user: "saludclick_demo", database: "postgres", connectionTimeoutMillis: 1000 });
        try { await c.connect(); }
        catch { await c.end(); await new Promise(resolve => setTimeout(resolve, 200)); continue; }
        try { await c.query("CREATE DATABASE saludclick_domicilio_demo"); return; }
        finally { await c.end(); }
    }
    throw new Error("No se pudo iniciar PostgreSQL de demostración.");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
'@ | node
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base de demostración.' }
    node backend/scripts/dispensacion-demo.cjs
    if ($LASTEXITCODE -ne 0) { throw 'La aplicación de demostración terminó con un error.' }
} finally {
    Pop-Location
    & (Join-Path $bin 'pg_ctl.exe') stop -D $data -m fast
}
