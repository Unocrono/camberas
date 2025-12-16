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
  min_time: string | null  // interval as string e.g. "01:00:00"
  max_time: string | null  // interval as string e.g. "05:00:00"
  min_lap_time: string | null  // interval as string
  expected_laps: number | null
}

interface Registration {
  id: string
  race_id: string
  race_distance_id: string
  bib_number: number | null
}

interface WaveInfo {
  race_distance_id: string
  start_time: string | null
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

// Parse PostgreSQL interval string to milliseconds
// Supports formats: "HH:MM:SS", "HH:MM:SS.mmm", "X hours Y mins Z secs"
function parseIntervalToMs(interval: string | null): number | null {
  if (!interval) return null
  
  // Try HH:MM:SS format
  const timeMatch = interval.match(/^(\d+):(\d+):(\d+)(?:\.(\d+))?$/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    const seconds = parseInt(timeMatch[3], 10)
    const ms = timeMatch[4] ? parseInt(timeMatch[4].padEnd(3, '0').slice(0, 3), 10) : 0
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms
  }
  
  // Try PostgreSQL verbose format "X hours Y mins Z secs"
  let totalMs = 0
  const hoursMatch = interval.match(/(\d+)\s*hours?/)
  const minsMatch = interval.match(/(\d+)\s*mins?/)
  const secsMatch = interval.match(/(\d+(?:\.\d+)?)\s*secs?/)
  
  if (hoursMatch) totalMs += parseInt(hoursMatch[1], 10) * 3600000
  if (minsMatch) totalMs += parseInt(minsMatch[1], 10) * 60000
  if (secsMatch) totalMs += parseFloat(secsMatch[1]) * 1000
  
  return totalMs > 0 ? totalMs : null
}

// Format milliseconds to readable time
function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${hours}h${mins.toString().padStart(2, '0')}m${secs.toString().padStart(2, '0')}s`
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

    // Parse optional parameters from URL or body
    const url = new URL(req.url)
    let raceId = url.searchParams.get('race_id')
    let minutesBack = parseInt(url.searchParams.get('minutes_back') || '10')
    let startTime: string | null = null
    let endTime: string | null = null
    let forceReprocess = false
    let specificGpsId: string | null = null

    // If POST request, check body for additional parameters
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        raceId = body.race_id || raceId
        minutesBack = body.minutes_back || minutesBack
        startTime = body.start_time || null
        endTime = body.end_time || null
        forceReprocess = body.force_reprocess || false
        specificGpsId = body.gps_id || null // Specific GPS point to process (from trigger)
      } catch {
        // Body parsing failed, use URL params
      }
    }

    console.log(`Processing GPS geofence. Race: ${raceId || 'all'}, GPS ID: ${specificGpsId || 'none'}, Minutes back: ${minutesBack}, Start: ${startTime}, End: ${endTime}, Force: ${forceReprocess}`)

    // Determine time range for GPS readings
    let gpsQuery = supabase
      .from('gps_tracking')
      .select('*')
      .order('timestamp', { ascending: true })

    if (specificGpsId) {
      // When called from trigger, process ONLY the specific GPS point
      gpsQuery = gpsQuery.eq('id', specificGpsId)
      console.log(`Processing specific GPS point: ${specificGpsId}`)
    } else if (startTime && endTime) {
      // Use explicit time range
      gpsQuery = gpsQuery.gte('timestamp', startTime).lte('timestamp', endTime)
      console.log(`Using time range: ${startTime} to ${endTime}`)
    } else {
      // Use minutes_back - but use the LATEST gps timestamp as reference, not server time
      // This prevents timezone issues
      if (raceId) {
        gpsQuery = gpsQuery.eq('race_id', raceId)
      }
      // Get the most recent GPS reading first to use as reference
      const { data: latestGps } = await supabase
        .from('gps_tracking')
        .select('timestamp')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()
      
      if (latestGps) {
        const latestTimestamp = new Date(latestGps.timestamp)
        const cutoffTime = new Date(latestTimestamp.getTime() - minutesBack * 60 * 1000).toISOString()
        gpsQuery = supabase
          .from('gps_tracking')
          .select('*')
          .gte('timestamp', cutoffTime)
          .order('timestamp', { ascending: true })
        if (raceId) {
          gpsQuery = gpsQuery.eq('race_id', raceId)
        }
        console.log(`Using cutoff time: ${cutoffTime} (${minutesBack} min before latest GPS: ${latestGps.timestamp})`)
      } else {
        console.log('No GPS readings found at all')
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

    // Fetch checkpoints with coordinates for these races (including time constraints)
    const { data: checkpoints, error: cpError } = await supabase
      .from('race_checkpoints')
      .select('id, race_id, race_distance_id, timing_point_id, name, latitude, longitude, distance_km, checkpoint_order, geofence_radius, checkpoint_type, min_time, max_time, min_lap_time, expected_laps')
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

    // Get race_distance_ids to fetch wave start times
    const distanceIds = [...new Set(registrations?.map(r => r.race_distance_id).filter(Boolean) || [])]
    
    // Fetch wave start times for all relevant distances
    const { data: waves, error: wavesError } = await supabase
      .from('race_waves')
      .select('race_distance_id, start_time')
      .in('race_distance_id', distanceIds)

    if (wavesError) {
      console.error('Error fetching waves:', wavesError)
      throw wavesError
    }

    const waveStartMap = new Map<string, Date | null>(
      waves?.map(w => [w.race_distance_id, w.start_time ? new Date(w.start_time) : null]) || []
    )

    // Log wave start times for debugging
    for (const wave of waves || []) {
      console.log(`Wave start for distance ${wave.race_distance_id}: ${wave.start_time}`)
    }
    console.log(`Loaded wave start times for ${waves?.length || 0} distances`)

    // Get existing timing readings to avoid duplicates and for lap calculation
    const { data: existingReadings, error: existingError } = await supabase
      .from('timing_readings')
      .select('registration_id, checkpoint_id, timing_timestamp, lap_number')
      .in('registration_id', registrationIds)
      .eq('reading_type', 'gps_geofence')
      .order('timing_timestamp', { ascending: true })

    if (existingError) {
      console.error('Error fetching existing readings:', existingError)
      throw existingError
    }

    // Create maps for existing readings
    // Key: registration_id:checkpoint_id -> array of readings sorted by time
    const existingReadingsMap = new Map<string, { timing_timestamp: string, lap_number: number }[]>()
    for (const reading of existingReadings || []) {
      const key = `${reading.registration_id}:${reading.checkpoint_id}`
      if (!existingReadingsMap.has(key)) {
        existingReadingsMap.set(key, [])
      }
      existingReadingsMap.get(key)!.push({
        timing_timestamp: reading.timing_timestamp,
        lap_number: reading.lap_number || 1
      })
    }

    console.log(`Found ${existingReadings?.length || 0} existing GPS-based timing readings, force_reprocess: ${forceReprocess}`)

    // Process GPS readings and create timing_readings
    const newTimingReadings: any[] = []
    const processedPairs = new Map<string, { timestamp: Date, lap: number }>() // Track what we've processed in this batch
    let skippedMinTime = 0
    let skippedMaxTime = 0
    let skippedLapTime = 0

    for (const gps of gpsReadings as GPSReading[]) {
      const registration = registrationMap.get(gps.registration_id)
      if (!registration) {
        console.log(`No registration found for ${gps.registration_id}`)
        continue
      }

      const waveStart = waveStartMap.get(registration.race_distance_id)
      const gpsTime = new Date(gps.timestamp)

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
        // Calculate distance from GPS point to checkpoint
        const distance = calculateDistance(
          gps.latitude,
          gps.longitude,
          checkpoint.latitude!,
          checkpoint.longitude!
        )

        const radius = checkpoint.geofence_radius || 50 // Default 50m

        // Not within geofence, skip
        if (distance > radius) continue

        const pairKey = `${gps.registration_id}:${checkpoint.id}`

        // Calculate race time (elapsed time since wave start)
        let raceTimeMs: number | null = null
        if (waveStart) {
          raceTimeMs = gpsTime.getTime() - waveStart.getTime()
          // Debug: log the actual values for first few readings
          if (checkpoint.name === 'Meta' || checkpoint.checkpoint_type === 'FINISH') {
            console.log(
              `DEBUG META: bib ${registration.bib_number}, gpsTime=${gps.timestamp}, ` +
              `waveStart=${waveStart.toISOString()}, raceTimeMs=${raceTimeMs}, ` +
              `raceTime=${formatMs(raceTimeMs)}`
            )
          }
        }

        // Validate min_time constraint (minimum race time to reach this checkpoint)
        const minTimeMs = parseIntervalToMs(checkpoint.min_time)
        if (minTimeMs !== null && raceTimeMs !== null) {
          if (raceTimeMs < minTimeMs) {
            console.log(
              `Skipping checkpoint "${checkpoint.name}" for bib ${registration.bib_number}: ` +
              `race time ${formatMs(raceTimeMs)} < min_time ${formatMs(minTimeMs)}`
            )
            skippedMinTime++
            continue
          }
        }

        // Validate max_time constraint (maximum race time - cutoff)
        const maxTimeMs = parseIntervalToMs(checkpoint.max_time)
        if (maxTimeMs !== null && raceTimeMs !== null) {
          if (raceTimeMs > maxTimeMs) {
            console.log(
              `Skipping checkpoint "${checkpoint.name}" for bib ${registration.bib_number}: ` +
              `race time ${formatMs(raceTimeMs)} > max_time ${formatMs(maxTimeMs)}`
            )
            skippedMaxTime++
            continue
          }
        }

        // Get existing readings for this pair to determine lap number
        const existingForPair = existingReadingsMap.get(pairKey) || []
        const batchEntry = processedPairs.get(pairKey)
        
        // Combine existing readings with batch entry to get last reading
        let lastReadingTime: Date | null = null
        let currentLap = 1

        if (existingForPair.length > 0) {
          const lastExisting = existingForPair[existingForPair.length - 1]
          lastReadingTime = new Date(lastExisting.timing_timestamp)
          currentLap = lastExisting.lap_number
        }

        if (batchEntry && (!lastReadingTime || batchEntry.timestamp > lastReadingTime)) {
          lastReadingTime = batchEntry.timestamp
          currentLap = batchEntry.lap
        }

        // Check min_lap_time constraint (minimum time between laps at same checkpoint)
        const minLapTimeMs = parseIntervalToMs(checkpoint.min_lap_time)
        if (lastReadingTime && minLapTimeMs !== null) {
          const timeSinceLastReading = gpsTime.getTime() - lastReadingTime.getTime()
          if (timeSinceLastReading < minLapTimeMs) {
            // Not enough time has passed for a new lap, skip
            skippedLapTime++
            continue
          }
        }

        // Determine expected laps
        const expectedLaps = checkpoint.expected_laps || 1

        // If we already have readings for this checkpoint, check if we're at max laps
        // For single-lap checkpoints (expected_laps = 1), skip if we already have a reading
        if (expectedLaps === 1 && (existingForPair.length > 0 || batchEntry)) {
          if (!forceReprocess) {
            continue // Already have the single allowed reading
          }
        }

        // For multi-lap, determine the new lap number
        let newLap = currentLap
        if (lastReadingTime) {
          // This is a new lap
          newLap = currentLap + 1
          if (newLap > expectedLaps && !forceReprocess) {
            console.log(
              `Skipping checkpoint "${checkpoint.name}" for bib ${registration.bib_number}: ` +
              `already at max laps (${expectedLaps})`
            )
            continue
          }
        }

        console.log(
          `Runner ${registration.bib_number} (reg: ${gps.registration_id}) ` +
          `entered checkpoint "${checkpoint.name}" geofence. ` +
          `Distance: ${distance.toFixed(1)}m, Radius: ${radius}m, ` +
          `Race time: ${raceTimeMs ? formatMs(raceTimeMs) : 'unknown'}, Lap: ${newLap}`
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
          notes: `GPS geofence detection. Distance: ${distance.toFixed(1)}m, Race time: ${raceTimeMs ? formatMs(raceTimeMs) : 'unknown'}`,
          is_processed: false,
          lap_number: newLap
        })

        // Update batch tracking
        processedPairs.set(pairKey, { timestamp: gpsTime, lap: newLap })
      }
    }

    console.log(`Skipped readings - min_time: ${skippedMinTime}, max_time: ${skippedMaxTime}, min_lap_time: ${skippedLapTime}`)

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
        checkpoints_checked: checkpoints.length,
        skipped: {
          min_time: skippedMinTime,
          max_time: skippedMaxTime,
          min_lap_time: skippedLapTime
        }
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
