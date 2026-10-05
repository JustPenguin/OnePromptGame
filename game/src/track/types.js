// Result containers of the Track API (re-exported from SplineTrack.js for backwards compatibility).
// Leaf module (imports nothing from the track/world code) so the visual world can use them without an import cycle.
import * as THREE from 'three';
import { Surface } from './surfaces.js';

export class TrackQuery {
  constructor() {
    this.index = 0;       // fractional sample index
    this.s = 0;           // arc length along the track [0, length)
    this.lateral = 0;     // metres from centreline, + = right
    this.halfWidth = 8;   // road half width here
    this.shoulder = 6;    // extra drivable off-road band beyond the road edge
    this.offset = 0;      // |lateral| - halfWidth (<0 = on the road)
    this.height = 0;      // road surface world Y at this x,z
    this.normal = new THREE.Vector3(0, 1, 0);
    this.tangent = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.surface = Surface.ROAD;
    this.onRoad = true;   // |lateral| <= halfWidth
    this.inBounds = true; // inside the drivable corridor (road + shoulder, or a wall exists there)
    this.zone = null;     // feature zone under the point: {type:'boost'|'ramp'|...} or null
    this.dist = 0;        // horizontal distance to the centreline
    this.wall = true;     // is there a solid wall on the side the point is on?
  }
}

export class TrackSample {
  constructor() {
    this.s = 0;
    this.position = new THREE.Vector3();
    this.tangent = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.halfWidth = 8;
    this.shoulder = 6;
    this.yaw = 0;
  }
}
