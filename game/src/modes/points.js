// Grand Prix scoring. OWNER: Agent E.
/** Points per finishing place (index 0 = 1st). */
export const GP_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const pointsForPlace = (place) => GP_POINTS[place - 1] ?? 0;
/** Trophy for a FINAL standings place (1/2/3), else null. */
export const trophyForPlace = (place) => (place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null);
export const TROPHY_NAMES = { gold: 'Gold Trophy', silver: 'Silver Trophy', bronze: 'Bronze Trophy' };
export const TROPHY_COLORS = { gold: '#ffd23f', silver: '#cfd8ee', bronze: '#e8934f' };
export const TROPHY_RANK = { bronze: 1, silver: 2, gold: 3 };
export const betterTrophy = (a, b) => ((TROPHY_RANK[a] ?? 0) >= (TROPHY_RANK[b] ?? 0) ? a : b) ?? null;
