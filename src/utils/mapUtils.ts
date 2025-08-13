export const METERS_TO_FEET = 3.28084;

export const formatDistance = (meters: number): string => {
  const feet = meters * METERS_TO_FEET;
  return `${feet.toFixed(1)} ft`;
};

export const formatArea = (sqMeters: number): string => {
    const sqFeet = sqMeters * METERS_TO_FEET * METERS_TO_FEET;
    return `${sqFeet.toFixed(1)} ft²`;
}