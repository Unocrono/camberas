// Custom GPX parser that handles various GPX formats without external library issues

export interface GpxWaypoint {
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  desc?: string;
  cmt?: string;
}

export interface GpxTrackPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface GpxTrack {
  name: string;
  points: GpxTrackPoint[];
}

export interface ParsedGpx {
  name: string;
  waypoints: GpxWaypoint[];
  tracks: GpxTrack[];
}

export function parseGpxFile(xmlString: string): ParsedGpx {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  // Check for parsing errors
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Error parsing GPX XML: " + parserError.textContent);
  }

  const gpxElement = doc.querySelector("gpx");
  if (!gpxElement) {
    throw new Error("No GPX element found in file");
  }

  // Get name from metadata
  const metadataName = doc.querySelector("metadata > name");
  const name = metadataName?.textContent || "Sin nombre";

  // Parse waypoints
  const waypoints: GpxWaypoint[] = [];
  const wptElements = doc.querySelectorAll("wpt");
  
  wptElements.forEach((wpt) => {
    const lat = parseFloat(wpt.getAttribute("lat") || "0");
    const lon = parseFloat(wpt.getAttribute("lon") || "0");
    
    // Skip invalid waypoints
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
      console.warn("Skipping waypoint with invalid coordinates");
      return;
    }

    const nameEl = wpt.querySelector("name");
    const eleEl = wpt.querySelector("ele");
    const descEl = wpt.querySelector("desc");
    const cmtEl = wpt.querySelector("cmt");

    waypoints.push({
      name: nameEl?.textContent || "Sin nombre",
      lat,
      lon,
      ele: eleEl ? parseFloat(eleEl.textContent || "0") : undefined,
      desc: descEl?.textContent || undefined,
      cmt: cmtEl?.textContent || undefined,
    });
  });

  // Parse tracks
  const tracks: GpxTrack[] = [];
  const trkElements = doc.querySelectorAll("trk");

  trkElements.forEach((trk) => {
    const trkNameEl = trk.querySelector("name");
    const trackName = trkNameEl?.textContent || "Track sin nombre";
    
    const points: GpxTrackPoint[] = [];
    const trkptElements = trk.querySelectorAll("trkpt");

    trkptElements.forEach((trkpt) => {
      const lat = parseFloat(trkpt.getAttribute("lat") || "0");
      const lon = parseFloat(trkpt.getAttribute("lon") || "0");

      // Skip invalid track points
      if (isNaN(lat) || isNaN(lon)) {
        return;
      }

      const eleEl = trkpt.querySelector("ele");
      const timeEl = trkpt.querySelector("time");

      points.push({
        lat,
        lon,
        ele: eleEl ? parseFloat(eleEl.textContent || "0") : undefined,
        time: timeEl?.textContent || undefined,
      });
    });

    if (points.length > 0) {
      tracks.push({
        name: trackName,
        points,
      });
    }
  });

  return {
    name,
    waypoints,
    tracks,
  };
}

// Calculate distance between two points using Haversine formula
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate total distance of a track
export function calculateTrackDistance(track: GpxTrack): number {
  let totalDistance = 0;
  for (let i = 1; i < track.points.length; i++) {
    totalDistance += calculateHaversineDistance(
      track.points[i - 1].lat,
      track.points[i - 1].lon,
      track.points[i].lat,
      track.points[i].lon
    );
  }
  return totalDistance;
}

// Find the closest point on track to current position
// Returns index of closest point and distance to it
export function findClosestTrackPoint(
  trackPoints: GpxTrackPoint[],
  currentLat: number,
  currentLon: number
): { index: number; distance: number } {
  let closestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < trackPoints.length; i++) {
    const dist = calculateHaversineDistance(
      currentLat,
      currentLon,
      trackPoints[i].lat,
      trackPoints[i].lon
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  return { index: closestIndex, distance: minDistance };
}

// Calculate distance remaining to end of track from a given index
export function calculateDistanceFromPointToEnd(
  trackPoints: GpxTrackPoint[],
  startIndex: number
): number {
  let distance = 0;
  for (let i = startIndex; i < trackPoints.length - 1; i++) {
    distance += calculateHaversineDistance(
      trackPoints[i].lat,
      trackPoints[i].lon,
      trackPoints[i + 1].lat,
      trackPoints[i + 1].lon
    );
  }
  return distance;
}

// Calculate distance to finish from current position on track
// Returns distance in km
export function calculateDistanceToFinish(
  trackPoints: GpxTrackPoint[],
  currentLat: number,
  currentLon: number
): number {
  if (!trackPoints || trackPoints.length === 0) return 0;

  // Find closest point on track
  const { index: closestIndex } = findClosestTrackPoint(
    trackPoints,
    currentLat,
    currentLon
  );

  // Calculate distance from closest point to end
  const distanceFromClosestToEnd = calculateDistanceFromPointToEnd(
    trackPoints,
    closestIndex
  );

  return distanceFromClosestToEnd;
}

// Get all track points from parsed GPX (combines all tracks)
export function getAllTrackPoints(parsedGpx: ParsedGpx): GpxTrackPoint[] {
  const allPoints: GpxTrackPoint[] = [];
  parsedGpx.tracks.forEach((track) => {
    allPoints.push(...track.points);
  });
  return allPoints;
}
