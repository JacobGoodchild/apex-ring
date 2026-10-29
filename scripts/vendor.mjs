// Copies the parts of Three.js the game uses from node_modules into vendor/,
// so the published site never loads code from a CDN. Run: npm run vendor
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const src = "node_modules/three";
const out = "vendor/three";
const files = [
  "build/three.module.js",
  "build/three.core.js",
  "examples/jsm/postprocessing/EffectComposer.js",
  "examples/jsm/postprocessing/RenderPass.js",
  "examples/jsm/postprocessing/UnrealBloomPass.js",
  "examples/jsm/postprocessing/OutputPass.js",
  "examples/jsm/postprocessing/ShaderPass.js",
  "examples/jsm/postprocessing/Pass.js",
  "examples/jsm/postprocessing/MaskPass.js",
  "examples/jsm/shaders/CopyShader.js",
  "examples/jsm/shaders/LuminosityHighPassShader.js",
  "examples/jsm/shaders/OutputShader.js",
  "examples/jsm/environments/RoomEnvironment.js",
  "examples/jsm/utils/BufferGeometryUtils.js",
  "LICENSE",
];
rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = join(out, f.replace("build/", "").replace("examples/jsm/", "addons/"));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(src, f), dest);
}
console.log("Vendored three into", out);
