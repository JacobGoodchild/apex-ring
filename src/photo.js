// Photo textures (CC0, Poly Haven, see CREDITS.md) shipped as small jpgs in assets/tex.
// Each image is loaded once; callers get their own Texture (shared image source) with their own tiling.
import * as THREE from "three";

const loader = new THREE.TextureLoader();
const base = {}, users = {};

export function photo(name, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  if (!base[name]) {
    users[name] = [];
    const t = loader.load(new URL(`../assets/tex/${name}.jpg`, import.meta.url).href, () => { for (const u of users[name]) u.needsUpdate = true; users[name] = null; });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    base[name] = t;
  }
  const t = base[name].clone();
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  // a copy made before the image arrives is re-uploaded once it does
  if (users[name]) users[name].push(t);
  return t;
}

// Breaks up visible tiling on big surfaces: the map is sampled at two scales and blended,
// plus a slow brightness wobble, so a 512px photo can cover a few km of ground without a grid pattern.
export function antiTile(mat, macro = 0.13) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.macro = { value: macro };
    sh.fragmentShader = "uniform float macro;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
      #ifdef USE_MAP
        vec4 tA = texture2D(map, vMapUv);
        vec4 tB = texture2D(map, vMapUv * macro + vec2(0.37, 0.71));
        float w = 0.5 + 0.5 * sin(vMapUv.x * 0.21 + sin(vMapUv.y * 0.17) * 2.0);
        vec4 sampledDiffuseColor = mix(tA, tB, 0.35 + 0.3 * w);
        sampledDiffuseColor.rgb *= 0.85 + 0.3 * texture2D(map, vMapUv * macro * 0.21).g;
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  mat.customProgramCacheKey = () => "antiTile" + macro;
  return mat;
}

// Road surface: a tiled asphalt photo with painted markings from a second (canvas) texture laid over it.
// The markings texture keeps the road strip's own UVs; the photo is tiled by `rep`.
export function overlayMarkings(mat, marks, rep, key = "roadMarks") {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.marks = { value: marks }; sh.uniforms.rep = { value: new THREE.Vector2(rep[0], rep[1]) };
    sh.fragmentShader = "uniform sampler2D marks; uniform vec2 rep;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv * rep);
        sampledDiffuseColor.rgb *= 0.9 + 0.2 * texture2D(map, vMapUv * rep * 0.11).r;
        vec4 mk = texture2D(marks, vMapUv);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, mk.rgb, mk.a);
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
