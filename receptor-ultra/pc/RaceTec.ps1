<#
  RaceTec.ps1 — Camberas → RaceTec

  Recibe las lecturas del Ultra desde el receptor del VPS y hace lo que hacía
  Outreach en este PC:
    · escribe <identificador>.txt en la carpeta de lecturas (formato RFID Timing)
    · llama a dbo.spInsertTime en el SQL Server de RaceTec

  Arranque: doble clic en RaceTec.cmd, o
    powershell -ExecutionPolicy Bypass -File RaceTec.ps1 [RaceTec.json]
  Se para con Ctrl+C. Guarda por dónde va (cursor.json): al arrancar otra vez
  sigue donde se quedó, sin repetir ni perder lecturas.

  Funciona con Windows PowerShell 5.1 (el de Windows 10/11) y con PowerShell 7.
#>
param([string]$Config = "")

$ErrorActionPreference = "Stop"
$Carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Config) { $Config = Join-Path $Carpeta "RaceTec.json" }
$RutaCursor = Join-Path $Carpeta "cursor.json"
$Invariante = [System.Globalization.CultureInfo]::InvariantCulture
$Ascii = [System.Text.Encoding]::ASCII

function Log([string]$texto)   { Write-Host ("{0} {1}" -f (Get-Date).ToString("HH:mm:ss"), $texto) }
function Aviso([string]$texto) { Write-Host ("{0} {1}" -f (Get-Date).ToString("HH:mm:ss"), $texto) -ForegroundColor Yellow }
function Fallo([string]$texto) { Write-Host ("{0} {1}" -f (Get-Date).ToString("HH:mm:ss"), $texto) -ForegroundColor Red }

# Un campo del JSON, o el valor por defecto si no está o está vacío
function Valor($objeto, [string]$nombre, $pordefecto) {
    if ($null -eq $objeto) { return $pordefecto }
    $p = $objeto.PSObject.Properties[$nombre]
    if ($null -ne $p -and $null -ne $p.Value -and "$($p.Value)" -ne "") { return $p.Value }
    return $pordefecto
}

# ── Configuración ────────────────────────────────────────────────────────────
if (-not (Test-Path $Config)) {
    Fallo "No existe $Config. Copia RaceTec.ejemplo.json a RaceTec.json y rellénalo."
    exit 1
}
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$Vps             = Valor $cfg "vps" ""
$Puerto          = [int](Valor $cfg "puerto" 23024)
$Clave           = Valor $cfg "clave" ""
$CarpetaFicheros = Valor $cfg "carpeta_ficheros" $Carpeta
$FormatoHora     = Valor $cfg "formato_hora" "dd/MM/yyyy HH:mm:ss"
$LectorYAntena   = [bool](Valor $cfg "lector_y_antena" $false)
$MostrarLecturas = [bool](Valor $cfg "mostrar_lecturas" $true)
$Sql             = Valor $cfg "sql" $null
if (-not $Vps -or -not $Clave -or "$Clave" -like "PEGA_AQUI*") {
    Fallo "Faltan «vps» o «clave» en $Config (la clave está en la pantalla Receptor Ultra › Configuración del VPS)."
    exit 1
}
if (-not (Test-Path $CarpetaFicheros)) { New-Item -ItemType Directory -Path $CarpetaFicheros | Out-Null }

# ── Cursor: por dónde vamos ──────────────────────────────────────────────────
$Cursor = @{ desde = ""; dias = @{} }
if (Test-Path $RutaCursor) {
    try {
        $c = Get-Content -Raw -Encoding UTF8 $RutaCursor | ConvertFrom-Json
        $Cursor.desde = "" + (Valor $c "desde" "")
        $d = Valor $c "dias" $null
        if ($d) { foreach ($p in $d.PSObject.Properties) { $Cursor.dias[$p.Name] = [long]$p.Value } }
    } catch {
        Aviso "cursor.json no se puede leer: se empieza desde hoy."
        $Cursor = @{ desde = ""; dias = @{} }
    }
}
function GuardarCursor {
    $dias = @{}                                          # solo los dos últimos días
    foreach ($k in @($Cursor.dias.Keys | Sort-Object | Select-Object -Last 2)) { $dias[$k] = $Cursor.dias[$k] }
    $Cursor.dias = $dias
    $json = @{ desde = $Cursor.desde; dias = $Cursor.dias } | ConvertTo-Json -Compress -Depth 5
    [System.IO.File]::WriteAllText($RutaCursor, $json, $Ascii)
}
function CursorJson {
    if ($Cursor.desde) { return (@{ desde = $Cursor.desde; dias = $Cursor.dias } | ConvertTo-Json -Compress -Depth 5) }
    return "{}"
}

# ── SQL Server de RaceTec ────────────────────────────────────────────────────
$Conexion = $null
function ConectarSql {
    $servidor = Valor $Sql "servidor" "Crono1"
    $base     = Valor $Sql "base" "Racetec"
    $usuario  = Valor $Sql "usuario" ""
    $cadena   = "Server=$servidor;Database=$base;Connect Timeout=5;"
    if ($usuario) { $cadena += "User ID=$usuario;Password=$(Valor $Sql 'clave' '');" }
    else          { $cadena += "Integrated Security=True;" }
    $script:Conexion = New-Object System.Data.SqlClient.SqlConnection $cadena
    $script:Conexion.Open()
    Log "SQL Server: conectado a $servidor, base $base"
}
function InsertarSql([string]$location, [string]$chip, [datetime]$hora) {
    if ($null -eq $Conexion -or $Conexion.State -ne [System.Data.ConnectionState]::Open) { ConectarSql }
    $cmd = $Conexion.CreateCommand()
    $cmd.CommandText = "dbo.spInsertTime"
    $cmd.CommandType = [System.Data.CommandType]::StoredProcedure
    $cmd.CommandTimeout = 10
    [void]$cmd.Parameters.Add("@Location",   [System.Data.SqlDbType]::VarChar, 50)
    [void]$cmd.Parameters.Add("@ChipCode",   [System.Data.SqlDbType]::VarChar, 50)
    [void]$cmd.Parameters.Add("@ChipTime",   [System.Data.SqlDbType]::DateTime)
    [void]$cmd.Parameters.Add("@ReaderTime", [System.Data.SqlDbType]::DateTime)
    $cmd.Parameters["@Location"].Value   = $location
    $cmd.Parameters["@ChipCode"].Value   = $chip
    $cmd.Parameters["@ChipTime"].Value   = $hora
    $cmd.Parameters["@ReaderTime"].Value = $hora
    [void]$cmd.ExecuteNonQuery()
}

# ── Lecturas ─────────────────────────────────────────────────────────────────
$Lectores = @{}            # lector → @{ identificador; timer } (los manda el receptor)
$AvisadosSinTimer = @{}
function Procesar($p) {
    # LECTURA  lector  nº  chip  hora  antena  día  posición
    $lector = $p[1]; $num = $p[2]; $chip = $p[3]; $antena = $p[5]; $dia = $p[6]; $posicion = [long]$p[7]
    $hora = [datetime]::ParseExact($p[4], "yyyy-MM-dd HH:mm:ss.fff", $Invariante)
    $l = $Lectores[$lector]
    if ($l) { $ident = $l.identificador; $timer = $l.timer } else { $ident = "U$lector"; $timer = "" }
    if (-not $timer) {
        $timer = $ident
        if (-not $AvisadosSinTimer[$lector]) {
            Aviso "El Ultra $lector no tiene timer name en la pantalla Receptor Ultra: se usa «$ident»."
            $AvisadosSinTimer[$lector] = $true
        }
    }

    # 1) El fichero, como Outreach: antena,chip,chip,"hora"[,lector,antena]
    $linea = '{0},{1},{1},"{2}"' -f $antena, $chip, $hora.ToString($FormatoHora, $Invariante)
    if ($LectorYAntena) { $linea += ",1,$antena" }
    [System.IO.File]::AppendAllText((Join-Path $CarpetaFicheros "$ident.txt"), $linea + "`r`n", $Ascii)

    # 2) SQL Server, hasta que entre (la lectura no se pierde: el cursor no avanza)
    if ($Sql) {
        $espera = 2
        while ($true) {
            try { InsertarSql $timer $chip $hora; break }
            catch {
                Fallo "SQL Server: $($_.Exception.Message) Reintento en $espera s."
                try { if ($Conexion) { $Conexion.Close() } } catch { }
                $script:Conexion = $null
                Start-Sleep -Seconds $espera
                $espera = [Math]::Min($espera * 2, 30)
            }
        }
    }

    # 3) Hecha: se apunta
    $Cursor.dias[$dia] = $posicion
    GuardarCursor
    if ($MostrarLecturas) {
        $destino = "$ident.txt"
        if ($Sql) { $destino += " + SQL ($timer)" }
        Log ("Ultra {0}  nº {1}  chip {2}  {3}  antena {4}  → {5}" -f $lector, $num, $chip, $hora.ToString("HH:mm:ss.fff"), $antena, $destino)
    }
}

$UltimoEstado = ""
function Estado($e) {
    $partes = @()
    foreach ($u in @(Valor $e "ultras" @())) {
        if ($u.conectado) { $partes += "Ultra $($u.lector) conectado" }
    }
    if ($partes.Count -eq 0) { $partes += "ningún Ultra conectado al receptor" }
    $texto = $partes -join "; "
    try { $host.UI.RawUI.WindowTitle = "RaceTec ← Camberas: $texto" } catch { }
    if ($texto -ne $script:UltimoEstado) { Log $texto; $script:UltimoEstado = $texto }
}

# ── Conexión con el receptor ─────────────────────────────────────────────────
Log "Lecturas → $CarpetaFicheros (hora «$FormatoHora»)"
if ($Sql) { Log "SQL Server → $(Valor $Sql 'servidor' 'Crono1') / $(Valor $Sql 'base' 'Racetec'), dbo.spInsertTime" }
else      { Aviso "Sin «sql» en la configuración: solo se escriben los ficheros." }

$espera = 2
while ($true) {
    $cliente = $null
    try {
        Log "Conectando con el receptor ${Vps}:${Puerto}…"
        $cliente = New-Object System.Net.Sockets.TcpClient
        $cliente.ReceiveTimeout = 20000                  # el receptor manda un estado cada 5 s
        $cliente.Connect($Vps, $Puerto)
        $flujo = $cliente.GetStream()
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        $entrada = New-Object System.IO.StreamReader($flujo, $utf8)
        $salida = New-Object System.IO.StreamWriter($flujo, $utf8)
        $salida.NewLine = "`n"
        $salida.AutoFlush = $true
        $salida.WriteLine("HOLA $Clave $(CursorJson)")
        while ($true) {
            $linea = $entrada.ReadLine()
            if ($null -eq $linea) { throw "el receptor ha cerrado la conexión." }
            $p = $linea.Split("`t")
            switch ($p[0]) {
                "HOLA" {
                    Log "Conectado al receptor «$($p[1])»."
                    if (-not $Cursor.desde -and $p.Count -gt 2) {
                        $Cursor.desde = "" + (($p[2] | ConvertFrom-Json).desde)
                        GuardarCursor
                    }
                    $espera = 2
                }
                "LECTOR" {
                    if ($p.Count -ge 4) {
                        $Lectores[$p[1]] = @{ identificador = $p[2]; timer = $p[3] }
                        Log "Ultra $($p[1]): fichero $($p[2]).txt, timer name «$($p[3])»."
                    }
                }
                "LECTURA" { Procesar $p }
                "ESTADO"  { Estado ($p[1] | ConvertFrom-Json) }
                "ADIOS"   { throw "el receptor no nos admite ($($p[1])). Revisa la clave en $Config." }
            }
        }
    } catch {
        Fallo "$($_.Exception.Message) Reintento en $espera s."
    } finally {
        if ($cliente) { $cliente.Close() }
    }
    Start-Sleep -Seconds $espera
    $espera = [Math]::Min($espera * 2, 30)
}
