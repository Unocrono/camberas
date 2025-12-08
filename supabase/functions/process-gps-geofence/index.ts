import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GPSReading {
  id: string
  registration_id: string
  race_id: string
  latitude: number
  longitude: number
  timestamp: string
  altitude?: number
  speed?: number
  accuracy?: number
}

interface Checkpoint {
  id: string
  race_id: string
  race_distance_id: string | null
  timing_point_id: string | null
  name: string
  latitude: number | null
  longitude: number | null
  distance_km: number
  checkpoint_order: number
  geofence_radius: number
  checkpoint_type: string
}

interface Registration {
  id: string
  race_id: string
  race_distance_id: string
  bib_number: number | null
}

// Haversine formula to calculate distance between two GPS coordinates in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse optional parameters
    const url = new URL(req.url)
    const raceId = url.searchParams.get('race_id')
    const minutesBack = parseInt(url.searchParams.get('minutes_back') || '10')

    console.log(`Processing GPS geofence. Race: ${raceId || 'all'}, Minutes back: ${minutesBack}`)

    // Get recent GPS readings (last N minutes)
    const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000).toISOString()
    
    let gpsQuery = supabase
      .from('gps_tracking')
      .select('*')
      .gte('timestamp', cutoffTime)
      .order('timestamp', { ascending: true })

    if (raceId) {
      gpsQuery = gpsQuery.eq('race_id', raceId)
    }

    const { data: gpsReadings, error: gpsError } = await gpsQuery

    if (gpsError) {
      console.error('Error fetching GPS readings:', gpsError)
      throw gpsError
    }

    if (!gpsReadings || gpsReadings.length === 0) {
      console.log('No GPS readings found in the specified time window')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No GPS readings to process',
          processed: 0,
          created: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${gpsReadings.length} GPS readings to process`)

    // Get unique race IDs from GPS readings
    const raceIds = [...new Set(gpsReadings.map(r => r.race_id))]

    // Fetch checkpoints with coordinates for these races
    const { data: checkpoints, error: cpError } = await supabase
      .from('race_checkpoints')
      .select('*')
      .in('race_id', raceIds)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (cpError) {
      console.error('Error fetching checkpoints:', cpError)
      throw cpError
    }

    if (!checkpoints || checkpoints.length === 0) {
      console.log('No checkpoints with coordinates found')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No checkpoints with coordinates configured',
          processed: gpsReadings.length,
          created: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${checkpoints.length} checkpoints with coordinates`)

    // Get registrations for the readings
    const registrationIds = [...new Set(gpsReadings.map(r => r.registration_id))]
    
    const { data: registrations, error: regError } = await supabase
      .from('registrations')
      .select('id, race_id, race_distance_id, bib_number')
      .in('id', registrationIds)

    if (regError) {
      console.error('Error fetching registrations:', regError)
      throw regError
    }

    const registrationMap = new Map(registrations?.map(r => [r.id, r]) || [])

    // Get existing timing readings to avoid duplicates
    // We'll check for readings in the same checkpoint within a time window
    const { data: existingReadings, error: existingError } = await supabase
      .from('timing_readings')
      .select('registration_id, checkpoint_id, timing_timestamp')
      .in('registration_id', registrationIds)
      .eq('reading_type', 'gps_geofence')

    if (existingError) {
      console.error('Error fetching existing readings:', existingError)
      throw existingError
    }

    // Create a set of existing readings for quick lookup (registration_id + checkpoint_id)
    const existingSet = new Set(
      existingReadings?.map(r => `${r.registration_id}:${r.checkpoint_id}`) || []
    )

    console.log(`Found ${existingSet.size} existing GPS-based timing readings`)

    // Process GPS readings and create timing_readings
    const newTimingReadings: any[] = []
    const processedPairs = new Set<string>() // Track what we've processed in this batch

    for (const gps of gpsReadings as GPSReading[]) {
      const registration = registrationMap.get(gps.registration_id)
      if (!registration) {
        console.log(`No registration found for ${gps.registration_id}`)
        continue
      }

      // Find applicable checkpoints for this registration's race/distance
      const applicableCheckpoints = checkpoints.filter((cp: Checkpoint) => {
        // Must be same race
        if (cp.race_id !== gps.race_id) return false
        // If checkpoint has race_distance_id, must match registration's distance
        if (cp.race_distance_id && cp.race_distance_id !== registration.race_distance_id) return false
        // Must have coordinates
        if (!cp.latitude || !cp.longitude) return false
        return true
      })

      for (const checkpoint of applicableCheckpoints as Checkpoint[]) {
        const pairKey = `${gps.registration_id}:${checkpoint.id}`
        
        // Skip if we already have a timing reading for this pair
        if (existingSet.has(pairKey)) continue
        // Skip if we already processed this pair in this batch
        if (processedPairs.has(pairKey)) continue

        // Calculate distance from GPS point to checkpoint
        const distance = calculateDistance(
          gps.latitude,
          gps.longitude,
          checkpoint.latitude!,
          checkpoint.longitude!
        )

        const radius = checkpoint.geofence_radius || 50 // Default 50m

        if (distance <= radius) {
          console.log(
            `Runner ${registration.bib_number} (reg: ${gps.registration_id}) ` +
            `entered checkpoint "${checkpoint.name}" geofence. ` +
            `Distance: ${distance.toFixed(1)}m, Radius: ${radius}m`
          )

          newTimingReadings.push({
            race_id: gps.race_id,
            race_distance_id: registration.race_distance_id,
            registration_id: gps.registration_id,
            bib_number: registration.bib_number,
            checkpoint_id: checkpoint.id,
            timing_point_id: checkpoint.timing_point_id,
            timing_timestamp: gps.timestamp,
            reading_timestamp: new Date().toISOString(),
            reading_type: 'gps_geofence',
            notes: `GPS geofence detection. Distance: ${distance.toFixed(1)}m`,
            is_processed: false,
            lap_number: 1
          })

          processedPairs.add(pairKey)
        }
      }
    }

    // Insert new timing readings
    let createdCount = 0
    if (newTimingReadings.length > 0) {
      console.log(`Creating ${newTimingReadings.length} new timing readings`)
      
      const { data: inserted, error: insertError } = await supabase
        .from('timing_readings')
        .insert(newTimingReadings)
        .select('id')

      if (insertError) {
        console.error('Error inserting timing readings:', insertError)
        throw insertError
      }

      createdCount = inserted?.length || 0
      console.log(`Successfully created ${createdCount} timing readings`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${gpsReadings.length} GPS readings, created ${createdCount} timing readings`,
        processed: gpsReadings.length,
        created: createdCount,
        checkpoints_checked: checkpoints.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error in process-gps-geofence:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
