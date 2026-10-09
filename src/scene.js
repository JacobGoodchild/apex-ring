// Renderer, sky, lights, fog, ground, reflections and the optional bloom pass. Quality presets live here.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { photo, antiTile } from "./photo.js";
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
    const pmrem = (this.pmrem = new THREE.PMREMGenerator(this.renderer));
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // studio reflections for the showroom
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, stars: { value: 0 }, clouds: { value: 0 }, cloudCol: { value: new THREE.Color() } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; uniform float clouds; uniform vec3 cloudCol; varying vec3 vP;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float cfbm(vec2 p){ float s = 0.0, a = 0.5; for (int o = 0; o < 5; o++) { s += vn(p)*a; p = p*2.07 + 3.1; a *= 0.5; } return s; }
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){ vec3 d = normalize(vP); float h = d.y;
          vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h));
          float s = max(dot(d, sunDir), 0.0); c += sunCol*(pow(s, 300.0)*1.4 + pow(s, 40.0)*0.3 + pow(s,6.0)*0.08);
          if (clouds > 0.0 && h > 0.0) { vec2 cp = d.xz / (h + 0.12) * 1.6; float n = cfbm(cp); float cov = smoothstep(0.62 - clouds*0.3, 0.86 - clouds*0.2, n) * smoothstep(0.0, 0.1, h);
            vec3 cc = mix(cloudCol, cloudCol*0.55 + hor*0.25, smoothstep(0.55, 0.95, n)) + sunCol*pow(s, 8.0)*0.35; c = mix(c, cc, cov*0.92); }
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

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), antiTile(new THREE.MeshStandardMaterial({ roughness: 1 })));
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
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.4, 0.92);
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
    u.clouds.value = t.clouds ?? 0.4; u.cloudCol.value.set(t.cloudColor ?? 0xe4e8ee);
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear || 160, t.fogFar || 1100);
    this.hemi.color.set(t.hemi[0]); this.hemi.groundColor.set(t.hemi[1]); this.hemi.intensity = t.hemi[2] * 0.85;
    // everything is toned down from the theme values: at full strength races felt blinding on a phone
    this.sun.color.set(t.sunColor); this.sun.intensity = t.sunIntensity * 0.8;
    this.sunOff.set(...t.sunDir).normalize().multiplyScalar(90);
    const gm = this.ground.material, gt = t.groundTex || "grass";
    if (gm.userData.tex !== gt) { if (gm.map) gm.map.dispose(); gm.map = photo(gt, { repeat: [700, 700] }); gm.userData.tex = gt; gm.needsUpdate = true; }
    gm.color.set(t.groundTint || 0xd8d8d8);
    this.renderer.toneMappingExposure = (t.exposure || 1) * 0.88;
    this.scene.environmentIntensity = (t.envIntensity ?? 0.55) * 0.6;
    // outdoor reflections: render this track's sky (plus a dark ground) into the environment map, so paint
    // and wet roads reflect the real sky instead of a studio
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      this.envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat); this.envScene.add(this.envSky);
      this.envGround = new THREE.Mesh(new THREE.CircleGeometry(90, 24).rotateX(-Math.PI / 2).translate(0, -2, 0), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      this.envScene.add(this.envGround);
    }
    this.envGround.material.color.set(t.ground || 0x222222).multiplyScalar(0.35);
    if (this.skyEnv) this.skyEnv.dispose();
    this.skyEnv = this.pmrem.fromScene(this.envScene, 0, 0.1, 200).texture;
    this.scene.environment = this.skyEnv;
    this.scene.environmentIntensity = (t.envIntensity ?? 0.55) * 1.3;
    if (this.bloom) this.bloom.strength = (t.bloom ?? 0.55) * 0.5;
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

  // Split-screen: draw the scene once per camera into its own half (side by side in landscape, stacked in portrait).
  renderSplit(cams) {
    const r = this.renderer, el = r.domElement, w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight, land = w >= h;
    r.setScissorTest(true);
    cams.forEach((cam, i) => {
      const vw = land ? w / 2 : w, vh = land ? h : h / 2, x = land ? i * vw : 0, y = land ? 0 : i === 0 ? 0 : vh; // GL y is from the bottom: player 1 gets the bottom half
      r.setViewport(x, y, vw, vh); r.setScissor(x, y, vw, vh);
      if (Math.abs(cam.aspect - vw / vh) > 1e-3) { cam.aspect = vw / vh; cam.updateProjectionMatrix(); }
      this.sky.position.copy(cam.position);
      r.render(this.scene, cam);
    });
    r.setScissorTest(false); r.setViewport(0, 0, w, h);
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
