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

// Find closest point on track and calculate distance to finish
function findClosestPointOnTrack(
  lat: number, 
  lon: number, 
  trackPoints: { lat: number; lon: number; distanceFromStart: number }[]
): { distanceFromStart: number; distanceToFinish: number } | null {
  if (!trackPoints.length) return null
  
  let closestIndex = 0
  let closestDistance = Infinity
  
  for (let i = 0; i < trackPoints.length; i++) {
    const d = calculateDistance(lat, lon, trackPoints[i].lat, trackPoints[i].lon)
    if (d < closestDistance) {
      closestDistance = d
      closestIndex = i
    }
  }
  
  const totalDistance = trackPoints[trackPoints.length - 1].distanceFromStart
  const distanceFromStart = trackPoints[closestIndex].distanceFromStart
  const distanceToFinish = totalDistance - distanceFromStart
  
  return { distanceFromStart, distanceToFinish: distanceToFinish / 1000 } // Convert to km
}

// Find next checkpoint
function findNextCheckpoint(
  distanceFromStart: number,
  checkpoints: { id: string; name: string; distance_km: number }[]
): { id: string; name: string; distance_km: number } | null {
  const sorted = [...checkpoints].sort((a, b) => a.distance_km - b.distance_km)
  const currentKm = distanceFromStart / 1000
  
  for (const cp of sorted) {
    if (cp.distance_km > currentKm) {
      return cp
    }
  }
  return null
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

    console.log(`Processing moto GPS: moto=${moto_id}, race=${race_id}, lat=${latitude}, lon=${longitude}`)

    // Get moto's assigned race_distance
    const { data: moto } = await supabase
      .from('race_motos')
      .select('race_distance_id')
      .eq('id', moto_id)
      .single()

    if (!moto?.race_distance_id) {
      console.log('Moto has no race_distance assigned, skipping distance calculation')
      return new Response(JSON.stringify({ success: true, message: 'No distance assigned' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get checkpoints for this distance
    const { data: checkpoints } = await supabase
      .from('race_checkpoints')
      .select('id, name, distance_km')
      .eq('race_distance_id', moto.race_distance_id)
      .order('distance_km')

    // Get total distance from race_distance
    const { data: raceDistance } = await supabase
      .from('race_distances')
      .select('distance_km')
      .eq('id', moto.race_distance_id)
      .single()

    const totalDistanceKm = raceDistance?.distance_km || 0

    // Simple distance calculation (without GPX for now - can be enhanced later)
    // For now, use distance_from_start if available, otherwise estimate
    let distanceToFinish: number | null = null
    let distanceToNextCheckpoint: number | null = null
    let nextCheckpointName: string | null = null
    let nextCheckpointId: string | null = null

    // Get latest GPS reading with distance_from_start
    const { data: latestGps } = await supabase
      .from('moto_gps_tracking')
      .select('distance_from_start')
      .eq('moto_id', moto_id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (latestGps?.distance_from_start != null) {
      const distFromStartKm = latestGps.distance_from_start / 1000
      distanceToFinish = Math.max(0, totalDistanceKm - distFromStartKm)

      // Find next checkpoint
      if (checkpoints?.length) {
        const nextCp = findNextCheckpoint(latestGps.distance_from_start, checkpoints)
        if (nextCp) {
          nextCheckpointId = nextCp.id
          nextCheckpointName = nextCp.name
          distanceToNextCheckpoint = Math.max(0, nextCp.distance_km - distFromStartKm)
        }
      }
    }

    // Update the GPS record with calculated distances
    if (gps_id) {
      const { error: updateError } = await supabase
        .from('moto_gps_tracking')
        .update({
          distance_to_finish: distanceToFinish,
          distance_to_next_checkpoint: distanceToNextCheckpoint,
          next_checkpoint_name: nextCheckpointName,
          next_checkpoint_id: nextCheckpointId
        })
        .eq('id', gps_id)

      if (updateError) {
        console.error('Error updating GPS record:', updateError)
      }
    }

    console.log(`Calculated: toFinish=${distanceToFinish?.toFixed(1)}km, toNext=${distanceToNextCheckpoint?.toFixed(1)}km (${nextCheckpointName})`)

    return new Response(JSON.stringify({ 
      success: true,
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
