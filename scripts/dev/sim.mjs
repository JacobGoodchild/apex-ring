import { TrackPath } from "../../src/track.js";
import { TRACKS } from "../../src/tracks.js";
import { CARS, carSpec } from "../../src/cars.js";
import { Vehicle } from "../../src/vehicle.js";
const tid = process.argv[2] || "oval";
const path = new TrackPath(TRACKS.find(t=>t.id===tid));
const v = new Vehicle(carSpec(CARS[0]), path); v.reset(-8,0);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
console.log("len", path.length.toFixed(0), "N", path.N, "minprof", Math.min(...path.speedProfile(24)).toFixed(1));
let t=0, lapT=[], walls=0;
for (let k=0;k<60*200;k++){
  const dt=1/60; t+=dt;
  const look=Math.max(10,v.vF*0.55); const i=Math.floor(path.wrapD(v.p.d+look)/path.ds)%path.N;
  const tp=path.pointAt(v.p.d+look, path.line[i]*0.8,{}); const want=Math.atan2(tp.x-v.x,tp.z-v.z);
  v.ctl.steer=Math.max(-1,Math.min(1,wrapA(v.h-want)*2.2));
  const prof=path.speedProfile(v.spec.grip); let vt=1e9; for(let q=0;q<40;q+=3) vt=Math.min(vt,prof[(v.p.i+q)%path.N]);
  v.ctl.targetSpeed=vt*0.98;
  if (process.argv[3]==="drift" && k%600>300 && k%600<420) { v.ctl.drift=true; v.ctl.steer=1; } else v.ctl.drift=false;
  v.step(dt,true);
  if (v.wallHit>0) walls++;
  if (v.totalD >= (lapT.length+1)*path.length) lapT.push(t.toFixed(2));
  if (k%120===0) console.log(t.toFixed(1), "vF",v.vF.toFixed(1),"lat",v.lat.toFixed(1),"drift",v.drifting?1:0,"ang",v.driftAngle.toFixed(2),"boost",v.boost.toFixed(2), "d", v.totalD.toFixed(0));
  if (lapT.length>=2) break;
}
console.log("laps", lapT, "wallframes", walls);
