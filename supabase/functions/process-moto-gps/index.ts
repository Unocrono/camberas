import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Haversine formula to calculate distance between two GPS coordinates in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

interface TrackPoint {
  lat: number
  lon: number
  distanceFromStart: number
}

// Parse GPX file and extract track points with cumulative distances
function parseGpxToTrackPoints(gpxContent: string): TrackPoint[] {
  const trackPoints: TrackPoint[] = []
  
  // Extract all trkpt elements using regex (simple parser for edge function)
  const trkptRegex = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"/g
  let match
  let prevLat: number | null = null
  let prevLon: number | null = null
  let cumulativeDistance = 0
  
  while ((match = trkptRegex.exec(gpxContent)) !== null) {
    const lat = parseFloat(match[1])
    const lon = parseFloat(match[2])
    
    if (prevLat !== null && prevLon !== null) {
      cumulativeDistance += calculateDistance(prevLat, prevLon, lat, lon)
    }
    
    trackPoints.push({
      lat,
      lon,
      distanceFromStart: cumulativeDistance
    })
    
    prevLat = lat
    prevLon = lon
  }
  
  console.log(`Parsed ${trackPoints.length} track points from GPX, total distance: ${(cumulativeDistance/1000).toFixed(2)} km`)
  return trackPoints
}

// Find closest point on track within a search range, considering previous position
// This prevents "jumping" to far-away parts of the route that happen to be geographically close
function findClosestPointOnTrack(
  lat: number, 
  lon: number, 
  trackPoints: TrackPoint[],
  previousDistanceFromStart: number | null,
  maxSearchRangeMeters: number = 5000 // Only search within 5km forward/backward from last position
): { distanceFromStart: number; distanceToFinish: number; trackIndex: number } | null {
  if (!trackPoints.length) return null
  
  const totalDistance = trackPoints[trackPoints.length - 1].distanceFromStart
  
  // Determine search range
  let searchStartIndex = 0
  let searchEndIndex = trackPoints.length - 1
  
  if (previousDistanceFromStart !== null && previousDistanceFromStart >= 0) {
    // Find the index range to search based on previous position
    const minSearchDist = Math.max(0, previousDistanceFromStart - maxSearchRangeMeters)
    const maxSearchDist = Math.min(totalDistance, previousDistanceFromStart + maxSearchRangeMeters)
    
    // Find start index
    for (let i = 0; i < trackPoints.length; i++) {
      if (trackPoints[i].distanceFromStart >= minSearchDist) {
        searchStartIndex = i
        break
      }
    }
    
    // Find end index
    for (let i = trackPoints.length - 1; i >= 0; i--) {
      if (trackPoints[i].distanceFromStart <= maxSearchDist) {
        searchEndIndex = i
        break
      }
    }
    
    console.log(`Searching in range [${searchStartIndex}:${searchEndIndex}] based on previous distance ${(previousDistanceFromStart/1000).toFixed(2)}km`)
  }
  
  let closestIndex = searchStartIndex
  let closestDistance = Infinity
  
  // Search only within the range
  for (let i = searchStartIndex; i <= searchEndIndex; i++) {
    const d = calculateDistance(lat, lon, trackPoints[i].lat, trackPoints[i].lon)
    if (d < closestDistance) {
      closestDistance = d
      closestIndex = i
    }
  }
  
  // If we didn't find a close point in the range (moto might be off-route or jumped),
  // do a global search but with penalty for large jumps
  if (closestDistance > 200 && previousDistanceFromStart !== null) { // More than 200m from track in range
    console.log(`Warning: Moto is ${closestDistance.toFixed(0)}m from track in search range, doing global search...`)
    
    let globalClosestIndex = 0
    let globalClosestDistance = Infinity
    
    for (let i = 0; i < trackPoints.length; i++) {
      const d = calculateDistance(lat, lon, trackPoints[i].lat, trackPoints[i].lon)
      if (d < globalClosestDistance) {
        globalClosestDistance = d
        globalClosestIndex = i
      }
    }
    
    // Only use global result if it's significantly closer (less than half the range distance)
    // AND if the moto would have had to move at reasonable speed to get there
    const jumpDistanceOnTrack = Math.abs(trackPoints[globalClosestIndex].distanceFromStart - previousDistanceFromStart)
    
    // If global result is much closer to the track AND the jump is reasonable (e.g., within 10km on track)
    if (globalClosestDistance < closestDistance * 0.5 && jumpDistanceOnTrack < 10000) {
      console.log(`Using global result: index=${globalClosestIndex}, jump=${(jumpDistanceOnTrack/1000).toFixed(2)}km on track`)
      closestIndex = globalClosestIndex
      closestDistance = globalClosestDistance
    } else {
      // Stick with the range result even if a bit far from track
      console.log(`Keeping range result despite distance, avoiding ${(jumpDistanceOnTrack/1000).toFixed(2)}km jump`)
    }
  }
  
  const distanceFromStart = trackPoints[closestIndex].distanceFromStart
  const distanceToFinish = (totalDistance - distanceFromStart) / 1000 // Convert to km
  
  console.log(`Closest point: index=${closestIndex}, distance=${closestDistance.toFixed(1)}m, fromStart=${(distanceFromStart/1000).toFixed(2)}km, toFinish=${distanceToFinish.toFixed(2)}km`)
  
  return { distanceFromStart, distanceToFinish, trackIndex: closestIndex }
}

// Find next checkpoint based on current distance
function findNextCheckpoint(
  distanceFromStartKm: number,
  checkpoints: { id: string; name: string; distance_km: number }[]
): { id: string; name: string; distance_km: number } | null {
  const sorted = [...checkpoints].sort((a, b) => a.distance_km - b.distance_km)
  
  for (const cp of sorted) {
    if (cp.distance_km > distanceFromStartKm) {
      return cp
    }
  }
  return null
}

// Cache for GPX track points (in-memory for the duration of the function execution)
const gpxCache: Map<string, TrackPoint[]> = new Map()

async function getTrackPoints(gpxUrl: string): Promise<TrackPoint[]> {
  // Check cache first
  if (gpxCache.has(gpxUrl)) {
    console.log('Using cached GPX track points')
    return gpxCache.get(gpxUrl)!
  }
  
  console.log(`Fetching GPX from: ${gpxUrl}`)
  const response = await fetch(gpxUrl)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch GPX: ${response.status} ${response.statusText}`)
  }
  
  const gpxContent = await response.text()
  const trackPoints = parseGpxToTrackPoints(gpxContent)
  
  // Cache the result
  gpxCache.set(gpxUrl, trackPoints)
  
  return trackPoints
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { moto_id, race_id, latitude, longitude, speed, heading, gps_id } = await req.json()

    console.log(`Processing moto GPS: moto=${moto_id}, race=${race_id}, lat=${latitude}, lon=${longitude}, gps_id=${gps_id}`)

    // Get moto's assigned race_distance with GPX URL
    const { data: moto, error: motoError } = await supabase
      .from('race_motos')
      .select('race_distance_id')
      .eq('id', moto_id)
      .single()

    if (motoError) {
      console.error('Error fetching moto:', motoError)
    }

    if (!moto?.race_distance_id) {
      console.log('Moto has no race_distance assigned, skipping distance calculation')
      return new Response(JSON.stringify({ success: true, message: 'No distance assigned' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get race_distance with GPX URL
    const { data: raceDistance, error: rdError } = await supabase
      .from('race_distances')
      .select('distance_km, gpx_file_url')
      .eq('id', moto.race_distance_id)
      .single()

    if (rdError) {
      console.error('Error fetching race_distance:', rdError)
    }

    const totalDistanceKm = raceDistance?.distance_km || 0
    const gpxUrl = raceDistance?.gpx_file_url

    console.log(`Race distance: ${totalDistanceKm}km, GPX URL: ${gpxUrl ? 'present' : 'missing'}`)

    // Get checkpoints for this distance
    const { data: checkpoints } = await supabase
      .from('race_checkpoints')
      .select('id, name, distance_km')
      .eq('race_distance_id', moto.race_distance_id)
      .order('distance_km')

    // Get the previous GPS record to know last distance_from_start
    let previousDistanceFromStart: number | null = null
    const { data: previousGps } = await supabase
      .from('moto_gps_tracking')
      .select('distance_from_start')
      .eq('moto_id', moto_id)
      .not('id', 'eq', gps_id) // Exclude current record
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (previousGps?.distance_from_start != null) {
      previousDistanceFromStart = previousGps.distance_from_start
      console.log(`Previous distance_from_start: ${(previousDistanceFromStart!/1000).toFixed(2)}km`)
    } else {
      console.log('No previous GPS record found, will do global search')
    }

    let distanceFromStart: number | null = null
    let distanceToFinish: number | null = null
    let distanceToNextCheckpoint: number | null = null
    let nextCheckpointName: string | null = null
    let nextCheckpointId: string | null = null

    // Calculate distances using GPX track
    if (gpxUrl && latitude && longitude) {
      try {
        const trackPoints = await getTrackPoints(gpxUrl)
        
        if (trackPoints.length > 0) {
          const result = findClosestPointOnTrack(
            latitude, 
            longitude, 
            trackPoints, 
            previousDistanceFromStart
          )
          
          if (result) {
            distanceFromStart = result.distanceFromStart
            distanceToFinish = result.distanceToFinish
            
            const distFromStartKm = distanceFromStart / 1000
            
            // Find next checkpoint
            if (checkpoints?.length) {
              const nextCp = findNextCheckpoint(distFromStartKm, checkpoints)
              if (nextCp) {
                nextCheckpointId = nextCp.id
                nextCheckpointName = nextCp.name
                distanceToNextCheckpoint = Math.max(0, nextCp.distance_km - distFromStartKm)
              }
            }
          }
        }
      } catch (gpxError) {
        console.error('Error processing GPX:', gpxError)
        // Fall back to simple calculation if GPX fails
        distanceToFinish = totalDistanceKm
      }
    } else if (!gpxUrl) {
      console.log('No GPX file available, cannot calculate precise distances')
      // Without GPX, we cannot calculate distance_from_start accurately
      // Just set distance_to_finish as the total distance (assumes starting)
      distanceToFinish = totalDistanceKm
    }

    // Update the GPS record with calculated distances
    if (gps_id) {
      const updateData = {
        distance_from_start: distanceFromStart,
        distance_to_finish: distanceToFinish,
        distance_to_next_checkpoint: distanceToNextCheckpoint,
        next_checkpoint_name: nextCheckpointName,
        next_checkpoint_id: nextCheckpointId
      }
      
      console.log(`Updating GPS record ${gps_id}:`, updateData)
      
      const { error: updateError } = await supabase
        .from('moto_gps_tracking')
        .update(updateData)
        .eq('id', gps_id)

      if (updateError) {
        console.error('Error updating GPS record:', updateError)
      } else {
        console.log('GPS record updated successfully')
      }
    } else {
      console.log('No gps_id provided, cannot update record')
    }

    console.log(`Result: fromStart=${distanceFromStart ? (distanceFromStart/1000).toFixed(2) : 'null'}km, toFinish=${distanceToFinish?.toFixed(2)}km, toNext=${distanceToNextCheckpoint?.toFixed(2)}km (${nextCheckpointName})`)

    return new Response(JSON.stringify({ 
      success: true,
      distance_from_start: distanceFromStart,
      distance_to_finish: distanceToFinish,
      distance_to_next_checkpoint: distanceToNextCheckpoint,
      next_checkpoint_name: nextCheckpointName
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error processing moto GPS:', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
