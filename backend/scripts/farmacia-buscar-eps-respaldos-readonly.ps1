# Lee rutas, bytes SQL y entradas ZIP; no extrae ni ejecuta contenido.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$homeRoot=[IO.Directory]::GetParent($repoRoot).FullName
$targets=@{
 '2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835'='20261114090000_eps_workspace'
 '99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e'='20261115090000_eps_role_integration'
}
$roots=@($repoRoot,(Join-Path $homeRoot 'Downloads'),(Join-Path $homeRoot 'Documents'),(Join-Path $homeRoot 'OneDrive'),(Join-Path $homeRoot 'git'),(Join-Path $homeRoot '.git_backup'))
$errorsFound=[Collections.Generic.List[object]]::new()
$archives=[Collections.Generic.List[object]]::new()
$sqlFiles=[Collections.Generic.List[object]]::new()
$verifiedOriginals=[Collections.Generic.List[object]]::new()
$sha=[Security.Cryptography.SHA256]::Create()
function Compare-Original([byte[]]$bytes,[string]$origin){
 $hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
 if($targets.ContainsKey($hash)){$verifiedOriginals.Add([pscustomobject]@{migration=$targets[$hash];sha256=$hash;origin=$origin;bytes=$bytes.Length})}
 return $hash
}
foreach($scanRoot in $roots){
 if(-not(Test-Path -LiteralPath $scanRoot)){continue}
 $listing=& rg --files --hidden -g '*.sql' -g '*.zip' -g '*.bundle' -g '!node_modules' -g '!.git' -g '!.codex' -g '!AppData' $scanRoot 2>$null
 if($LASTEXITCODE -notin 0,1){$errorsFound.Add([pscustomobject]@{root=$scanRoot;error='RUTAS_PARCIALMENTE_INACCESIBLES'})}
 foreach($candidate in $listing){
  try{
   $info=Get-Item -LiteralPath $candidate
   if($info.Extension -eq '.sql'){
    if($info.Length -gt 2097152){$errorsFound.Add([pscustomobject]@{path=$candidate;error='SQL_MAYOR_2MB_NO_LEIDO'});continue}
    $hash=Compare-Original ([IO.File]::ReadAllBytes($candidate)) $candidate
    $sqlFiles.Add([pscustomobject]@{path=$candidate;sha256=$hash;bytes=$info.Length})
   }elseif($info.Extension -eq '.zip'){
    $zip=[IO.Compression.ZipFile]::OpenRead($candidate)
    try{
     $examined=0;$named=[Collections.Generic.List[object]]::new()
     foreach($entry in $zip.Entries){
      if($entry.FullName -match '20261114090000_eps_workspace|20261115090000_eps_role_integration'){$named.Add($entry.FullName)}
      if($entry.FullName -notmatch '\.sql$' -or $entry.Length -gt 2097152){continue}
      $stream=$entry.Open();$memory=[IO.MemoryStream]::new()
      try{$stream.CopyTo($memory);$null=Compare-Original $memory.ToArray() ($candidate+'!'+$entry.FullName);$examined++}finally{$stream.Dispose();$memory.Dispose()}
     }
     $archives.Add([pscustomobject]@{path=$candidate;entries=$zip.Entries.Count;sqlHashed=$examined;namedCandidates=@($named)})
    }finally{$zip.Dispose()}
   }elseif($info.Extension -eq '.bundle'){$errorsFound.Add([pscustomobject]@{path=$candidate;error='BUNDLE_REQUIERE_INSPECCION_GIT_SEPARADA'})}
  }catch{$errorsFound.Add([pscustomobject]@{path=$candidate;error='LECTURA_NO_COMPLETADA'})}
 }
}
$sha.Dispose()
$report=[pscustomobject]@{date=[DateTime]::UtcNow.ToString('o');scope='Lectura de SQL y directorios ZIP; sin extraccion, ejecucion ni escrituras en fuentes';roots=$roots;sqlFiles=@($sqlFiles);archives=@($archives);matches=@($verifiedOriginals);errors=@($errorsFound)}
$destination=Join-Path $repoRoot 'docs/calidad/reportes/farmacia-eps-busqueda-respaldos-2026-11-17.json'
$json=$report|ConvertTo-Json -Depth 8
$file=[IO.File]::Open($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($json+"`n");$file.Write($bytes,0,$bytes.Length)}finally{$file.Dispose()}
[pscustomobject]@{roots=$roots.Count;sqlFiles=$sqlFiles.Count;archives=$archives.Count;matches=$verifiedOriginals.Count;errors=$errorsFound.Count;report=$destination}|ConvertTo-Json
