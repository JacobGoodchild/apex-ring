// Renderer, sky, lights, fog, ground, reflections and the optional bloom pass. Quality presets live here.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { noiseTex } from "./textures.js";
import { TEST, FORCE_QUALITY } from "./env.js";

export const QUALITY = {
  low: { pr: 1, shadows: false, shadowSize: 512, bloom: false, scenery: 0.45, aa: false },
  medium: { pr: 1.5, shadows: true, shadowSize: 1024, bloom: false, scenery: 0.75, aa: true },
  high: { pr: 2, shadows: true, shadowSize: 2048, bloom: true, scenery: 1, aa: true },
};

export function autoQuality() {
  if (FORCE_QUALITY && QUALITY[FORCE_QUALITY]) return FORCE_QUALITY;
  if (TEST) return "low";
  const touch = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch) return cores >= 8 ? "medium" : "low";
  return cores >= 4 ? "high" : "medium";
}

export class World {
  constructor(container, qualityName) {
    this.qname = qualityName;
    const q = QUALITY[qualityName];
    this.renderer = new THREE.WebGLRenderer({ antialias: q.aa, powerPreference: "high-performance", preserveDrawingBuffer: TEST });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2600);

    // reflections for glossy paint
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, stars: { value: 0 } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vP;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){ vec3 d = normalize(vP); float h = d.y;
          vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h));
          float s = max(dot(d, sunDir), 0.0); c += sunCol*(pow(s, 300.0)*2.0 + pow(s, 40.0)*0.6 + pow(s,6.0)*0.18);
          if(stars > 0.0){ vec3 q = floor(d*420.0); float st = step(0.9975, hash(q)); c += vec3(st)*stars*smoothstep(0.05,0.3,h); }
          gl_FragColor = vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0x9fb4e0, 0x1a2a1e, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc49a, 1.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.sunOff = new THREE.Vector3(-45, 60, -30);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x2a4a33, map: noiseTex("#8a9a8a", 40, 128, 360), roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.1; this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.trackGroup = null;
    this.applyQuality(qualityName);
  }

  applyQuality(name) {
    this.qname = name;
    const q = QUALITY[name];
    this.maxPR = TEST && !FORCE_QUALITY ? 0.5 : Math.min(window.devicePixelRatio || 1, q.pr);
    this.prScale = 1;
    this.renderer.setPixelRatio(this.maxPR);
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((mm) => (mm.needsUpdate = true)); } });
    if (q.bloom && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.useBloom = q.bloom;
    this.resize();
  }

  // Adaptive resolution: watch the frame time and lower or raise the render resolution to hold ~55-60 fps.
  adapt(frameMs) {
    if (TEST) return;
    this.ft = this.ft == null ? frameMs : this.ft * 0.95 + frameMs * 0.05;
    this.adaptT = (this.adaptT || 0) + frameMs;
    if (this.adaptT < 2000) return;
    this.adaptT = 0;
    let k = this.prScale;
    if (this.ft > 21 && k > 0.55) k = Math.max(0.55, k - 0.1);
    else if (this.ft < 15 && k < 1) k = Math.min(1, k + 0.05);
    if (k !== this.prScale) {
      this.prScale = k;
      this.renderer.setPixelRatio(this.maxPR * k);
      this.resize();
    }
  }

  setTheme(t) {
    const u = this.skyMat.uniforms;
    u.top.value.set(t.sky[0]); u.mid.value.set(t.sky[1]); u.hor.value.set(t.sky[2]);
    u.sunDir.value.set(...t.sunDir).normalize(); u.sunCol.value.set(t.sunColor); u.stars.value = t.stars || 0;
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear || 160, t.fogFar || 1100);
    this.hemi.color.set(t.hemi[0]); this.hemi.groundColor.set(t.hemi[1]); this.hemi.intensity = t.hemi[2];
    this.sun.color.set(t.sunColor); this.sun.intensity = t.sunIntensity;
    this.sunOff.set(...t.sunDir).normalize().multiplyScalar(90);
    this.ground.material.color.set(t.ground);
    this.renderer.toneMappingExposure = t.exposure || 1;
    this.scene.environmentIntensity = t.envIntensity ?? 0.55;
    if (this.bloom) this.bloom.strength = t.bloom ?? 0.55;
  }

  setTrack(group) {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    }
    this.trackGroup = group; this.scene.add(group);
  }

  follow(x, y, z) {
    this.sun.position.set(x + this.sunOff.x, y + this.sunOff.y, z + this.sunOff.z);
    this.sun.target.position.set(x, y, z);
    this.sky.position.copy(this.camera.position);
  }

  resize() {
    const el = this.renderer.domElement.parentElement; if (!el) return;
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }

  render(sceneOverride) {
    const sc = sceneOverride || this.scene;
    if (sceneOverride) this.camera.updateMatrixWorld();
    // bloom only on the race tracks: in the bright studio showroom it washed the car out completely
    if (this.useBloom && this.composer && !sceneOverride) { this.composer.passes[0].scene = sc; this.composer.render(); }
    else {
      const ex = this.renderer.toneMappingExposure;
      if (sceneOverride) this.renderer.toneMappingExposure = 0.95;
      this.renderer.render(sc, this.camera);
      this.renderer.toneMappingExposure = ex;
    }
  }
}
