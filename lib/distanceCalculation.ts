/**
 * Distance Calculation Utilities
 * Haversine formula for geographic distance
 * Source: Standard geospatial algorithm used by dating apps, maps, etc.
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * Accounts for Earth's curvature
 * 
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lon1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lon2 - Longitude of point 2 (degrees)
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  
  // Convert to radians
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  // Haversine formula
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Format distance for display
 * < 5280 feet: Show in feet
 * ≥ 5280 feet (1 mile): Show in miles
 * 
 * Privacy: Rounds to prevent exact location inference
 */
export function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  
  if (feet < 50) {
    // Very close or same location: "nearby" (privacy + handles 0 distance)
    return 'nearby';
  } else if (feet < 100) {
    // Very close: Round to "within 100 ft" (privacy)
    return 'within 100 ft';
  } else if (feet < 528) {
    // Under 0.1 miles: Round to nearest 50 ft
    return `${Math.round(feet / 50) * 50} ft away`;
  } else if (feet < 5280) {
    // Under 1 mile: Round to nearest 100 ft
    return `${Math.round(feet / 100) * 100} ft away`;
  } else {
    // 1 mile or more: Show in miles
    const miles = feet / 5280;
    if (miles < 2) {
      // Under 2 miles: "1.X mi"
      return `${miles.toFixed(1)} mi away`;
    } else if (miles < 10) {
      // 2-10 miles: "X mi"
      return `${Math.round(miles)} mi away`;
    } else {
      // 10+ miles: "10+ mi" (less precision for privacy)
      return '10+ mi away';
    }
  }
}

/**
 * Round coordinates to ~100m precision (privacy protection)
 * Prevents exact location pinpointing while maintaining useful accuracy
 * 
 * At equator: 1 degree ≈ 111 km
 * 0.001 degrees ≈ 111 meters
 * Rounding to 3 decimal places ≈ 100m precision
 */
export function roundCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 1000) / 1000, // 3 decimal places
    lon: Math.round(lon * 1000) / 1000,
  };
}

/**
 * Validate coordinates are within valid ranges
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

