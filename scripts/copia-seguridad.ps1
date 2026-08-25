<#
.SYNOPSIS
    Copia de seguridad de la base de datos de Camberas (Supabase alojado).

.DESCRIPTION
    Vuelca el esquema y los datos del proyecto rsahtxjpisnldxnsmupk con pg_dump,
    los comprime con marca de tiempo y rota las copias antiguas. No toca el
    repositorio: los volcados salen fuera, porque contienen datos personales de
    inscritos y pagos.

    Usa pg_dump nativo, NO el CLI de Supabase: "supabase db dump" ejecuta pg_dump
    dentro de Docker y aqui no hay Docker. Ademas pg_dump viene con psql, que es
    lo que hace falta para restaurar.

    Requisito, una sola vez:  winget install -e --id PostgreSQL.PostgreSQL.17
    Procedimiento de restauracion en docs/copias-de-seguridad.md.

.PARAMETER Destino
    Carpeta donde se guardan los .zip. Por defecto %USERPROFILE%\Backups\camberas.

.PARAMETER Conservar
    Numero de copias a mantener. Las mas antiguas se borran. Por defecto 10.

.PARAMETER SoloEsquema
    Vuelca solo la estructura, sin datos. Sirve para comprobar que el circuito
    funciona sin descargar toda la base.

.PARAMETER IncluirAuth
    Anade un volcado de los esquemas auth y storage (usuarios y metadatos de
    ficheros). Sin esto, una base restaurada no tiene con quien entrar.
    Lee el aviso del doc antes de activarlo.

.EXAMPLE
    .\scripts\copia-seguridad.ps1
    Pide la cadena de conexion y hace la copia completa.

.EXAMPLE
    .\scripts\copia-seguridad.ps1 -SoloEsquema
    Prueba rapida, sin datos.
#>
[CmdletBinding()]
param(
    [string]$Destino = (Join-Path $env:USERPROFILE 'Backups\camberas'),
    [int]$Conservar = 10,
    [switch]$SoloEsquema,
    [switch]$IncluirAuth
)

$ErrorActionPreference = 'Stop'

# Tablas que tienen que aparecer en el volcado de datos. Si falta alguna, la
# copia esta incompleta aunque pg_dump haya salido con codigo 0.
$TablasCriticas = @('registrations', 'payment_intents', 'races', 'timing_readings', 'user_roles')

function Escribe($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

Escribe ''
Escribe '  COPIA DE SEGURIDAD - Base de datos de Camberas' 'Cyan'
Escribe '  ---------------------------------------------' 'Cyan'
Escribe ''

# --- 1. Localizar pg_dump --------------------------------------------------
# Primero en el PATH; si no, en las instalaciones tipicas de PostgreSQL en
# Windows, cogiendo siempre la version mas alta disponible.
function Buscar-PgDump {
    $enPath = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($enPath) { return $enPath.Source }

    $candidatos = @()
    foreach ($raiz in @("$env:ProgramFiles\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")) {
        if (Test-Path $raiz) {
            $candidatos += Get-ChildItem $raiz -Directory |
                Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending |
                ForEach-Object { Join-Path $_.FullName 'bin\pg_dump.exe' } |
                Where-Object { Test-Path $_ }
        }
    }
    return ($candidatos | Select-Object -First 1)
}

$pgDump = Buscar-PgDump
if (-not $pgDump) {
    Escribe '  No se encuentra pg_dump.' 'Red'
    Escribe ''
    Escribe '  Instala las herramientas de PostgreSQL (una sola vez):' 'Yellow'
    Escribe '      winget install -e --id PostgreSQL.PostgreSQL.17' 'White'
    Escribe ''
    Escribe '  Luego abre una consola nueva y vuelve a lanzar este script.' 'Yellow'
    Escribe '  Si el instalador no lo puso en el PATH, esta en:' 'DarkGray'
    Escribe '      C:\Program Files\PostgreSQL\17\bin' 'DarkGray'
    Escribe ''
    exit 1
}
$versionDump = (& $pgDump --version | Select-Object -First 1)
Escribe "  $versionDump"
Escribe "  ($pgDump)" 'DarkGray'

# --- 2. Cadena de conexion -------------------------------------------------
# Se lee de la variable de entorno CAMBERAS_DB_URL si existe; si no, se pide por
# teclado. Nunca se escribe en disco ni se muestra por pantalla.
if ($env:CAMBERAS_DB_URL) {
    $dbUrl = $env:CAMBERAS_DB_URL
    Escribe '  Cadena de conexion: leida de CAMBERAS_DB_URL'
} else {
    Escribe ''
    Escribe '  Pega la cadena de conexion de Postgres.' 'Yellow'
    Escribe '  Panel de Supabase > Project Settings > Database > Connection string > URI' 'DarkGray'
    Escribe '  (con la contrasena ya sustituida en [YOUR-PASSWORD])' 'DarkGray'
    $segura = Read-Host '  URI' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { $dbUrl = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if ([string]::IsNullOrWhiteSpace($dbUrl) -or -not $dbUrl.StartsWith('postgres')) {
    Escribe '  Esa no es una cadena de conexion valida: tiene que empezar por postgres:// o postgresql://' 'Red'
    exit 1
}

# --- 3. Carpeta de trabajo -------------------------------------------------
$marca = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$carpeta = Join-Path $Destino $marca
New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
Escribe ''
Escribe "  Destino: $carpeta"
Escribe ''

function Volcar($descripcion, $fichero, $argumentos) {
    Escribe "  -> $descripcion..." 'White'
    $ruta = Join-Path $carpeta $fichero
    # La URI va la primera y sin comillas extra: PowerShell ya la pasa entera.
    $todos = @($dbUrl, '--no-owner', '--file', $ruta) + $argumentos
    & $pgDump @todos | ForEach-Object { Escribe "     $_" 'DarkGray' }
    if ($LASTEXITCODE -ne 0) { throw "Fallo el volcado de $descripcion (codigo $LASTEXITCODE)." }
    if (-not (Test-Path $ruta)) { throw "pg_dump no genero $fichero." }
    $bytes = (Get-Item $ruta).Length
    if ($bytes -eq 0) { throw "$fichero salio vacio." }
    $kb = [math]::Round($bytes / 1KB, 1)
    Escribe "     $fichero  ($kb KB)" 'Green'
    return $ruta
}

try {
    # --- 4. Los volcados ---------------------------------------------------
    # Solo el esquema public: auth, storage y realtime los gestiona Supabase y un
    # proyecto nuevo ya los trae puestos.
    Volcar 'Esquema (tablas, funciones, RLS, permisos)' 'schema.sql' `
        @('--schema=public', '--schema-only', '--no-publications', '--no-subscriptions') | Out-Null

    if ($SoloEsquema) {
        Escribe '  (modo -SoloEsquema: no se vuelcan datos)' 'Yellow'
    } else {
        $rutaDatos = Volcar 'Datos' 'data.sql' @('--schema=public', '--data-only')

        # Verificacion: que las tablas que importan esten de verdad en el fichero.
        # pg_dump puede terminar bien y dejar un volcado a medias.
        Escribe ''
        Escribe '  Verificando el volcado de datos...' 'White'
        $faltan = @()
        foreach ($tabla in $TablasCriticas) {
            if (-not (Select-String -Path $rutaDatos -Pattern "COPY public\.$tabla " -Quiet)) {
                $faltan += $tabla
            }
        }
        if ($faltan.Count -gt 0) {
            throw "La copia esta incompleta, no aparecen estas tablas: $($faltan -join ', ')"
        }
        Escribe "     $($TablasCriticas.Count) tablas criticas presentes" 'Green'
    }

    if ($IncluirAuth) {
        Volcar 'Usuarios y storage' 'auth_storage.sql' `
            @('--schema=auth', '--schema=storage', '--data-only') | Out-Null
    }

    # --- 5. Comprimir ------------------------------------------------------
    Escribe ''
    Escribe '  Comprimiendo...' 'White'
    $zip = Join-Path $Destino "camberas_$marca.zip"
    Compress-Archive -Path (Join-Path $carpeta '*') -DestinationPath $zip -CompressionLevel Optimal
    Remove-Item -Path $carpeta -Recurse -Force
    $mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
    Escribe "     $(Split-Path $zip -Leaf)  ($mb MB)" 'Green'

    # --- 6. Rotacion -------------------------------------------------------
    $copias = Get-ChildItem -Path $Destino -Filter 'camberas_*.zip' | Sort-Object LastWriteTime -Descending
    if ($copias.Count -gt $Conservar) {
        foreach ($vieja in ($copias | Select-Object -Skip $Conservar)) {
            Remove-Item $vieja.FullName -Force
            Escribe "     borrada copia antigua: $($vieja.Name)" 'DarkGray'
        }
    }

    $quedan = (Get-ChildItem -Path $Destino -Filter 'camberas_*.zip').Count
    Escribe ''
    Escribe "  LISTO. $quedan copias en $Destino" 'Green'
    Escribe '  Restauracion: docs/copias-de-seguridad.md' 'DarkGray'
    Escribe ''
} catch {
    Escribe ''
    Escribe "  FALLO: $_" 'Red'
    Escribe '  La copia NO es valida. No la des por buena.' 'Red'
    if (Test-Path $carpeta) {
        Remove-Item -Path $carpeta -Recurse -Force
        Escribe '  (se ha borrado el volcado incompleto)' 'DarkGray'
    }
    Escribe ''
    exit 1
} finally {
    $dbUrl = $null
    [GC]::Collect()
}
