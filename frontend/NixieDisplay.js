import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import { nixieGltfText, digitsGlbB64, threeJs, gltfLoaderSrc, nixieTextureB64 } from './model_data';

// Escape special chars so the gltf JSON string embeds safely in an HTML template
const safeGltf = nixieGltfText
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\${/g, '\\${');

const nixieHTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; overflow: hidden; }
  canvas { display: block; }
</style>
</head>
<body>
<script>
${threeJs}
</` + `script>
<script>
${gltfLoaderSrc}
</` + `script>
<script>
if (!window.THREE || !THREE.GLTFLoader) {
  document.body.innerHTML = '<p style="color:red;font-size:16px;padding:20px">THREE or GLTFLoader not loaded</p>';
} else {

const scene = new THREE.Scene();
const W = window.innerWidth, H = window.innerHeight;
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
camera.position.set(0, 0.2, 2.1);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(5, 5, 5);
scene.add(dir);
const dir2 = new THREE.DirectionalLight(0x4488ff, 0.4);
dir2.position.set(-5, 3, -5);
scene.add(dir2);

// -- Materials --
const nixieTexture = (function() {
  const img = new Image();
  img.src = 'data:image/png;base64,${nixieTextureB64}';
  const tex = new THREE.Texture(img);
  tex.flipY = false;
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter; // Пиксель-арт без размытия
  tex.minFilter = THREE.NearestFilter;
  img.onload = function() { tex.needsUpdate = true; };
  return tex;
})();

const tubeMat = new THREE.MeshBasicMaterial({
  map: nixieTexture,
  transparent: true,
  side: THREE.DoubleSide,
});

// Convert base64 to ArrayBuffer
function b64ToBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

const loader = new THREE.GLTFLoader();
const tubes = [];
const digitGeometries = [];  // index = digit 0-9
let nixieParts = {};
let modelsLoaded = 0;

function onBothLoaded() {
  modelsLoaded++;
  if (modelsLoaded < 2) return;
  // 6 ламп
  for (let i = 0; i < 6; i++) {
    const groupOffset = -0.76;
    let basePos = (i - 2.5) * 0.47 + groupOffset;
    
    // --- ИНДИВИДУАЛЬНЫЕ СДВИГИ ДЛЯ КАЖДОЙ ЛАМПЫ ---
    // Если между 3 и 4 лампой есть странный зазор, ты можешь вручную подвинуть каждую лампу!
    // Индексы: 0, 1, 2 (первые три), 3, 4, 5 (вторые три)
    // Например, если хочешь подвинуть последние три лампы левее, сделай им отрицательный сдвиг!
    const tweaks = [
      0.0,  // Лампа 1 (цифра 0)
      0.0,  // Лампа 2 (цифра 1)
      0.0,  // Лампа 3 (цифра 5)
      -0.019,  // Лампа 4 (цифра 0) <-- если тут зазор, сделай -0.1
      -0.05,  // Лампа 5 (цифра 0) <-- и тут -0.1
      -0.05   // Лампа 6 (цифра 0) <-- и тут -0.1
    ];
    
    buildTube(i, basePos + tweaks[i]);
  }
  // Set initial zeros
  updateDigits([0, 0, 0, 0, 0, 0]);
}

// ---- Load nixie.gltf (embedded as string) ----
try {
  const nixieStr = \`${safeGltf}\`;
  loader.parse(nixieStr, '', function(gltf) {
    gltf.scene.traverse(function(child) {
      if (child.isMesh) nixieParts[child.name] = child.geometry;
    });
    onBothLoaded();
  }, function(err) {
    console.error('nixie ERR: ', err);
  });
} catch(e) {
  console.error('nixie EX: ', e);
}

// ---- Load minecraft_digits.glb (embedded base64) ----
const digitsBuffer = b64ToBuffer('${digitsGlbB64}');
loader.parse(digitsBuffer, '', function(gltf) {
  const meshes = [];
  gltf.scene.traverse(function(child) {
    if (child.isMesh) meshes.push(child);
  });
  meshes.sort(function(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
  meshes.forEach(function(m, idx) {
    if (idx < 10) digitGeometries[idx] = m.geometry;
  });
  onBothLoaded();
}, function(err) {
  console.error('digits glb error:', err);
});

function buildTube(index, xPos) {
  const group = new THREE.Group();
  group.position.x = xPos;
  group.rotation.y = Math.PI / 2; // Разворачиваем трубки к зрителю
  group.scale.set(1.05, 1.05, 1.05);

  // В твоей модели 2 лампы (tube1/connector1 и tube2/connector2).
  // Мы специально берем только ПЕРВУЮ лампу, чтобы не двоилось!
  if (nixieParts['tube1']) group.add(new THREE.Mesh(nixieParts['tube1'], tubeMat));
  if (nixieParts['connector1']) group.add(new THREE.Mesh(nixieParts['connector1'], tubeMat));

  // Container for current digit mesh
  const digitContainer = new THREE.Group();
  group.add(digitContainer);
  group.userData.digitContainer = digitContainer;

  scene.add(group);
  tubes.push(group);
}

function setDigit(group, digit, index) {
  const dc = group.userData.digitContainer;
  while (dc.children.length) dc.remove(dc.children[0]);

  const geo = digitGeometries[digit];
  if (!geo) return;

  const mat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
  });

  const mesh = new THREE.Mesh(geo, mat);
  
  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const scale = 0.40 / maxDim;
    mesh.scale.setScalar(scale);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    mesh.position.copy(center.negate().multiplyScalar(scale));
    
    mesh.rotation.y = -Math.PI / 2;
    
    mesh.position.x = 0.5;  
    
    // --- ИНДИВИДУАЛЬНЫЕ СДВИГИ ДЛЯ КАЖДОЙ ЦИФРЫ ---
    // Если какая-то цифра стоит криво внутри колбы, ты можешь вручную подвинуть только ее!
    // Отрицательное число двигает цифру ВЛЕВО, положительное - ВПРАВО
    const digitTweaks = [
      0.0,  // Цифра 1 
      0.02,  // Цифра 2 
      0.03,  // Цифра 3 
      0.06,  // Цифра 4 
      0.1,  // Цифра 5 
      0.12   // Цифра 6 
    ];
    
    // 0.7 - это твоя базовая позиция. Плюс индивидуальная поправка для этой конкретной цифры
    mesh.position.z = 0.7 + (digitTweaks[index] || 0.0); 
    mesh.position.y = 0.40;
  }
  
  dc.add(mesh);
}

function updateDigits(arr) {
  arr.forEach(function(d, i) {
    if (tubes[i]) setDigit(tubes[i], d, i);
  });
}
window.updateDigits = updateDigits;

let frame = 0;
function animate() {
  requestAnimationFrame(animate);
  frame++;
  renderer.render(scene, camera);
}
animate();

} // end if THREE
</` + `script>
</body>
</html>`;

export default function NixieDisplay({ balance }) {
  const webviewRef = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    const digits = Math.floor(Math.abs(balance))
      .toString()
      .padStart(6, '0')
      .split('')
      .map(Number);
    const js = `if(window.updateDigits) window.updateDigits([${digits.join(',')}]); true;`;

    if (!initialized.current) {
      setTimeout(() => {
        webviewRef.current?.injectJavaScript(js);
        initialized.current = true;
      }, 1800);
    } else {
      webviewRef.current?.injectJavaScript(js);
    }
  }, [balance]);

  return (
    <View style={{ width: '100%', height: 260 }}>
      <WebView
        ref={webviewRef}
        source={{ html: nixieHTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        javaScriptEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
