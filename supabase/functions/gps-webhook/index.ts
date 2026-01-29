import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

/**
 * Parser del protocolo Queclink GL320M
 */
interface ParsedGPSData {
  imei: string
  latitude: number
  longitude: number
  altitude: number | null
  speed: number | null
  heading: number | null
  accuracy: number | null
  timestamp: string
  battery_level: number
}

function parseGL300Data(data: string): ParsedGPSData | null {
  try {
    console.log('📦 Datos raw recibidos:', data)
    
    // Intentar parsear como JSON primero
    if (data.trim().startsWith('{')) {
      const json = JSON.parse(data)
      return {
        imei: json.imei || json.device_id,
        latitude: json.latitude || json.lat,
        longitude: json.longitude || json.lng || json.lon,
        altitude: json.altitude || json.alt || null,
        speed: json.speed || null,
        heading: json.heading || json.course || null,
        accuracy: json.accuracy || json.hdop || null,
        timestamp: json.timestamp || new Date().toISOString(),
        battery_level: json.battery || json.battery_level || 100,
      }
    }
    
    // Parsear formato GTFRI del protocolo Queclink
    if (data.startsWith('+RESP:GTFRI') || data.startsWith('+BUFF:GTFRI')) {
      const parts = data.split(',')
      
      const imei = parts[2]
      const longitude = parseFloat(parts[11])
      const latitude = parseFloat(parts[12])
      const timestamp = parts[13] // YYYYMMDDHHMMSS
      const speed = parseFloat(parts[8]) || 0
      const heading = parseFloat(parts[9]) || 0
      const altitude = parseFloat(parts[10]) || 0
      const battery = parseInt(parts[23]) || 100
      
      // Convertir timestamp de GL300 a ISO 8601
      const year = timestamp.substring(0, 4)
      const month = timestamp.substring(4, 6)
      const day = timestamp.substring(6, 8)
      const hour = timestamp.substring(8, 10)
      const minute = timestamp.substring(10, 12)
      const second = timestamp.substring(12, 14)
      const isoTimestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
      
      return {
        imei,
        latitude,
        longitude,
        altitude,
        speed,
        heading,
        accuracy: null,
        timestamp: isoTimestamp,
        battery_level: battery,
      }
    }
    
    console.error('❌ Formato no reconocido')
    return null
    
  } catch (error) {
    console.error('❌ Error parseando datos:', error)
    return null
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    // 1. Verificar método
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // 2. Obtener datos
    const contentType = req.headers.get('Content-Type') || ''
    let rawData: string
    
    if (contentType.includes('application/json')) {
      const json = await req.json()
      rawData = JSON.stringify(json)
    } else {
      rawData = await req.text()
    }
    
    console.log('📩 Datos recibidos:', rawData)
    
    // 3. Parsear datos
    const gpsData = parseGL300Data(rawData)
    
    if (!gpsData) {
      return new Response(
        JSON.stringify({ error: 'Invalid data format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('✅ Datos parseados:', gpsData)
    
    // 4. Validar coordenadas
    if (
      gpsData.latitude < -90 || gpsData.latitude > 90 ||
      gpsData.longitude < -180 || gpsData.longitude > 180
    ) {
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // 5. Conectar a Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // 6. Buscar el dispositivo GPS en la tabla
    const { data: device, error: deviceError } = await supabase
      .from('gps_devices')
      .select('*')
      .eq('imei', gpsData.imei)
      .eq('active', true)
      .single()
    
    if (deviceError || !device) {
      console.error('❌ Dispositivo no encontrado:', gpsData.imei)
      return new Response(
        JSON.stringify({ error: 'Device not configured', imei: gpsData.imei }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('✅ Dispositivo encontrado:', device.device_name)
    
    // 7. Guardar en la tabla correcta
    if (device.registration_id) {
      // Es un corredor
      const { error: insertError } = await supabase
        .from('gps_tracking')
        .insert({
          race_id: device.race_id,
          registration_id: device.registration_id,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          altitude: gpsData.altitude,
          accuracy: gpsData.accuracy,
          speed: gpsData.speed,
          heading: gpsData.heading,
          battery_level: gpsData.battery_level,
          timestamp: gpsData.timestamp,
        })
      
      if (insertError) {
        console.error('❌ Error insertando en gps_tracking:', insertError)
        throw insertError
      }
      
      console.log('✅ Punto guardado (runner):', device.registration_id)
      
    } else if (device.moto_id) {
      // Es una moto
      const { error: insertError } = await supabase
        .from('moto_gps_tracking')
        .insert({
          race_id: device.race_id,
          moto_id: device.moto_id,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          altitude: gpsData.altitude,
          accuracy: gpsData.accuracy,
          speed: gpsData.speed,
          heading: gpsData.heading,
          battery_level: gpsData.battery_level,
          timestamp: gpsData.timestamp,
        })
      
      if (insertError) {
        console.error('❌ Error insertando en moto_gps_tracking:', insertError)
        throw insertError
      }
      
      console.log('✅ Punto guardado (moto):', device.moto_id)
    } else {
      // Dispositivo sin asignar - guardarlo de todas formas para debug
      console.log('⚠️ Dispositivo sin asignar, pero datos válidos')
    }
    
    // 8. Respuesta exitosa
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Position saved',
        imei: gpsData.imei,
        timestamp: gpsData.timestamp,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Error procesando request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
