// Surface types shared by tracks (which label them), physics (which reacts to them), vfx and audio.
export const Surface = Object.freeze({ ROAD: 0, GRASS: 1, SAND: 2, SNOW: 3, ICE: 4, MUD: 5, WATER: 6, BOOST: 7, VOID: 8 });

/**
 * grip:      multiplies the tyre-grip rate (low = slides)
 * speedMul:  multiplies the kart's top speed while on it (1 = unaffected)
 * offroad:   true if karts should kick up dust, slow down and make the off-road sound
 * particle:  colour of the dust/spray vfx kicked up (null = none)
 */
export const SURFACE_PROPS = [
  /* ROAD  */ { name: 'road',  grip: 1.0,  speedMul: 1.0,  offroad: false, particle: null },
  /* GRASS */ { name: 'grass', grip: 0.75, speedMul: 0.55, offroad: true,  particle: '#6fae3c' },
  /* SAND  */ { name: 'sand',  grip: 0.6,  speedMul: 0.58, offroad: true,  particle: '#e8c98a' },
  /* SNOW  */ { name: 'snow',  grip: 0.55, speedMul: 0.6,  offroad: true,  particle: '#f4f8ff' },
  /* ICE   */ { name: 'ice',   grip: 0.22, speedMul: 1.0,  offroad: false, particle: '#bfe9ff' },
  /* MUD   */ { name: 'mud',   grip: 0.5,  speedMul: 0.45, offroad: true,  particle: '#6b4a2b' },
  /* WATER */ { name: 'water', grip: 0.6,  speedMul: 0.6,  offroad: true,  particle: '#bfe3ff' },
  /* BOOST */ { name: 'boost', grip: 1.0,  speedMul: 1.0,  offroad: false, particle: null },
  /* VOID  */ { name: 'void',  grip: 0.0,  speedMul: 0.0,  offroad: true,  particle: null },
];
