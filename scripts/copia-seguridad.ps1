<#
.SYNOPSIS
    Archiva y verifica una copia de seguridad de la base de datos de Camberas.

.DESCRIPTION
    El proyecto vive en Lovable Cloud, que gestiona el Supabase y NO da las
    credenciales: no hay contrasena de Postgres ni service_role key, asi que no
    se puede volcar la base con pg_dump desde aqui.

    La copia se genera desde Lovable (Cloud > Overview > Advanced settings >
    Export project data > Database > Export) y se descarga cuando llega el aviso
    por correo. Este script coge ese fichero descargado, comprueba que trae las
    tablas que importan, lo archiva con marca de tiempo fuera del repositorio y
    rota las copias antiguas.

    Procedimiento completo y restauracion en docs/copias-de-seguridad.md.

.PARAMETER Fichero
    Ruta del export descargado de Lovable. Si no se indica, busca candidatos en
    la carpeta de Descargas y deja elegir.

.PARAMETER Destino
    Carpeta donde se archivan las copias. Por defecto %USERPROFILE%\Backups\camberas.

.PARAMETER Conservar
    Numero de copias a mantener. Las mas antiguas se borran. Por defecto 10.

.PARAMETER SinVerificar
    Archiva sin comprobar el contenido. Solo para formatos que el script no sabe
    leer; deja constancia de que la copia no esta verificada.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1
    Busca el export en Descargas, lo verifica y lo archiva.

    El -ExecutionPolicy Bypass hace falta siempre: Windows trae la ejecucion de
    scripts en Restricted. Se salta por invocacion, sin tocar la politica del
    sistema.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -Fichero "C:\Users\UNO\Downloads\export.sql"
#>
[CmdletBinding()]
param(
    [string]$Fichero,
    [string]$Destino = (Join-Path $env:USERPROFILE 'Backups\camberas'),
    [int]$Conservar = 10,
    [switch]$SinVerificar
)

$ErrorActionPreference = 'Stop'

# Tablas que tienen que aparecer en el volcado. Si falta alguna, el export esta
# incompleto o no es lo que creemos que es.
$TablasCriticas = @('registrations', 'payment_intents', 'races', 'timing_readings', 'user_roles')

function Escribe($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

Escribe ''
Escribe '  COPIA DE SEGURIDAD - Base de datos de Camberas' 'Cyan'
Escribe '  ---------------------------------------------' 'Cyan'
Escribe ''

# --- 1. Localizar el fichero de export -------------------------------------
if (-not $Fichero) {
    $descargas = Join-Path $env:USERPROFILE 'Downloads'
    Escribe "  Buscando el export en $descargas ..."
    $candidatos = @(Get-ChildItem $descargas -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.sql', '.dump', '.backup', '.tar', '.gz', '.zip' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5)

    if ($candidatos.Count -eq 0) {
        Escribe '  No hay ningun fichero que parezca un export en Descargas.' 'Red'
        Escribe ''
        Escribe '  Genera la copia desde Lovable:' 'Yellow'
        Escribe '    Cloud > Overview > Advanced settings > Export project data' 'White'
        Escribe '    > tarjeta Database > Export > Start export' 'White'
        Escribe '  Llega un correo cuando esta lista. Se descarga desde Cloud > Storage.' 'Yellow'
        Escribe ''
        exit 1
    }

    Escribe ''
    for ($i = 0; $i -lt $candidatos.Count; $i++) {
        $c = $candidatos[$i]
        $mb = [math]::Round($c.Length / 1MB, 1)
        Escribe ("    [{0}] {1}  ({2} MB, {3})" -f ($i + 1), $c.Name, $mb, $c.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))
    }
    Escribe ''
    $eleccion = Read-Host '  Cual es el export de Lovable? (numero, o Enter para cancelar)'
    if ([string]::IsNullOrWhiteSpace($eleccion)) { Escribe '  Cancelado.' 'Yellow'; exit 1 }
    $indice = 0
    if (-not [int]::TryParse($eleccion, [ref]$indice) -or $indice -lt 1 -or $indice -gt $candidatos.Count) {
        Escribe '  Eleccion no valida.' 'Red'; exit 1
    }
    $Fichero = $candidatos[$indice - 1].FullName
}

if (-not (Test-Path $Fichero)) {
    Escribe "  No existe el fichero: $Fichero" 'Red'
    exit 1
}

$origen = Get-Item $Fichero
$mbOrigen = [math]::Round($origen.Length / 1MB, 2)
Escribe ''
Escribe "  Fichero: $($origen.Name)  ($mbOrigen MB)" 'White'

if ($origen.Length -eq 0) {
    Escribe '  El fichero esta vacio. Eso no es una copia.' 'Red'
    exit 1
}

# --- 1b. No archivar dos veces el mismo export -----------------------------
# Lovable solo deja un export cada 24 h, asi que es facil volver a archivar el
# fichero que ya esta guardado y creerse que hay dos copias donde hay una.
if (Test-Path $Destino) {
    $hashOrigen = (Get-FileHash $origen.FullName -Algorithm SHA256).Hash
    foreach ($ya in (Get-ChildItem $Destino -Filter 'camberas_*.zip' -ErrorAction SilentlyContinue)) {
        if ((Get-FileHash $ya.FullName -Algorithm SHA256).Hash -eq $hashOrigen) {
            Escribe ''
            Escribe "  Este export ya esta archivado como $($ya.Name)." 'Yellow'
            Escribe '  No se archiva otra vez.' 'Yellow'
            Escribe ''
            exit 0
        }
    }
}

# --- 2. Verificar el contenido ---------------------------------------------
# Un export puede descargarse a medias y pesar lo suficiente para parecer bueno.
# Se comprueba que las tablas que importan estan de verdad dentro.
function Buscar-Bin($nombre) {
    $enPath = Get-Command $nombre -ErrorAction SilentlyContinue
    if ($enPath) { return $enPath.Source }
    foreach ($raiz in @("$env:ProgramFiles\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")) {
        if (Test-Path $raiz) {
            $hit = Get-ChildItem $raiz -Directory |
                Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending |
                ForEach-Object { Join-Path $_.FullName "bin\$nombre.exe" } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
            if ($hit) { return $hit }
        }
    }
    return $null
}

$verificada = $false
$temporal = $null
if ($SinVerificar) {
    Escribe '  (-SinVerificar: se archiva sin comprobar el contenido)' 'Yellow'
} else {
    Escribe ''
    Escribe '  Verificando contenido...' 'White'
    $encontradas = @()
    $aLeer = $origen

    try {
        # Lovable entrega el volcado dentro de un .zip con un unico fichero.
        # Se saca a un temporal para poder leerlo y se borra al terminar: lleva
        # datos personales de inscritos y pagos.
        if ($origen.Extension -eq '.zip') {
            $temporal = Join-Path ([IO.Path]::GetTempPath()) ('camberas_verif_' + [Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $temporal -Force | Out-Null
            Expand-Archive -Path $origen.FullName -DestinationPath $temporal -Force
            $dentro = @(Get-ChildItem $temporal -File -Recurse)
            if ($dentro.Count -eq 1) {
                $aLeer = $dentro[0]
                Escribe "     dentro del zip: $($aLeer.Name)" 'DarkGray'
            } else {
                Escribe "     el zip trae $($dentro.Count) ficheros, no se sabe cual es el volcado" 'Yellow'
                $aLeer = $null
            }
        }

        if ($aLeer) {
            if ($aLeer.Extension -eq '.sql') {
                # Volcado en texto plano: las filas van en COPY o en INSERT.
                foreach ($tabla in $TablasCriticas) {
                    if (Select-String -Path $aLeer.FullName -Pattern "(COPY|INSERT INTO) public\.$tabla\b" -Quiet) {
                        $encontradas += $tabla
                    }
                }
                $verificada = $true
            } else {
                # Formato custom/tar de pg_dump: se lee el indice con pg_restore.
                # "TABLE DATA" y no "TABLE" a secas: un volcado de solo estructura
                # no es una copia de seguridad.
                $pgRestore = Buscar-Bin 'pg_restore'
                if ($pgRestore) {
                    $indiceDump = & $pgRestore --list $aLeer.FullName 2>$null
                    if ($LASTEXITCODE -eq 0 -and $indiceDump) {
                        $texto = $indiceDump -join "`n"
                        foreach ($tabla in $TablasCriticas) {
                            if ($texto -match "TABLE DATA public $tabla ") { $encontradas += $tabla }
                        }
                        $conDatos = ([regex]::Matches($texto, 'TABLE DATA public ')).Count
                        Escribe "     $conDatos tablas con datos en el volcado" 'DarkGray'
                        $verificada = $true
                    }
                } else {
                    Escribe '     No hay pg_restore para leer este formato.' 'Yellow'
                    Escribe '     Instala PostgreSQL: winget install -e --id PostgreSQL.PostgreSQL.17' 'DarkGray'
                }
            }
        }

        if (-not $verificada) {
            Escribe '     No se ha podido leer el formato de este fichero.' 'Yellow'
            Escribe '     Se archiva igualmente, pero SIN verificar.' 'Yellow'
        }

        if ($verificada) {
            $faltan = $TablasCriticas | Where-Object { $_ -notin $encontradas }
            if ($faltan.Count -gt 0) {
                Escribe ''
                Escribe "  Este export no trae datos de: $($faltan -join ', ')" 'Red'
                Escribe '  O esta incompleto, o no es el export de la base de Camberas.' 'Red'
                Escribe '  NO se archiva.' 'Red'
                Escribe ''
                exit 1
            }
            Escribe "     $($TablasCriticas.Count) tablas criticas con datos" 'Green'
        }
    } finally {
        if ($temporal -and (Test-Path $temporal)) {
            Remove-Item $temporal -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- 3. Archivar -----------------------------------------------------------
$marca = Get-Date -Format 'yyyy-MM-dd_HHmmss'
New-Item -ItemType Directory -Path $Destino -Force | Out-Null

$sufijo = if ($verificada) { '' } else { '_SIN-VERIFICAR' }
$zip = Join-Path $Destino "camberas_$marca$sufijo.zip"

Escribe ''
Escribe '  Archivando...' 'White'
if ($origen.Extension -eq '.zip') {
    # Ya viene comprimido (es lo que entrega Lovable): se copia tal cual, que
    # meter un zip dentro de otro no comprime nada y estorba al restaurar.
    Copy-Item -Path $origen.FullName -Destination $zip -Force
} else {
    Compress-Archive -Path $origen.FullName -DestinationPath $zip -CompressionLevel Optimal
}
$mbZip = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Escribe "     $(Split-Path $zip -Leaf)  ($mbZip MB)" 'Green'

# --- 4. Rotacion -----------------------------------------------------------
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
if (-not $verificada) {
    Escribe '  OJO: esta copia no se ha podido verificar.' 'Yellow'
}
Escribe ''
Escribe '  Recuerda que el export de Lovable NO incluye:' 'DarkGray'
Escribe '    - los ficheros de Storage (carteles, fotos, GPX)' 'DarkGray'
Escribe '    - el codigo de las Edge Functions (eso esta en GitHub)' 'DarkGray'
Escribe '    - los secrets del proyecto (Redsys, Mapbox, push, WhatsApp)' 'DarkGray'
Escribe '    - las contrasenas de los usuarios de forma utilizable' 'DarkGray'
Escribe '  Detalle en docs/copias-de-seguridad.md' 'DarkGray'
Escribe ''

# El export original se queda en Descargas: borralo tu cuando confirmes que el
# archivo comprimido esta bien. Lleva datos personales de inscritos y pagos.
Escribe "  El original sigue en $($origen.DirectoryName)" 'DarkGray'
Escribe '  Borralo cuando compruebes el archivo: lleva datos personales.' 'DarkGray'
Escribe ''
