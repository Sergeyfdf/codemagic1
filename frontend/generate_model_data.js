// generate_model_data.js
// Запустить: node generate_model_data.js
// Из папки C:\Users\Marzipan\Desktop\SparkBank\frontend

const fs   = require('fs');
const path = require('path');

// Пути к 3D-моделям
const nixieGltfPath  = path.join(__dirname, 'assets', 'nixie.gltf');
const digitsGlbPath  = path.join(__dirname, 'assets', 'minecraft_digits.glb');
const texturePath    = path.join(__dirname, 'assets', 'nixie_tube.png');

// Пути к скачанным скриптам Three.js r134
const threeJsPath    = path.join(__dirname, '..', '..', '..', '.gemini', 'antigravity-ide', 'brain',
  'dd668639-68d8-410c-aeea-6f2576cc751b', '.system_generated', 'steps', '787', 'content.md');
const gltfLoaderPath = path.join(__dirname, '..', '..', '..', '.gemini', 'antigravity-ide', 'brain',
  'dd668639-68d8-410c-aeea-6f2576cc751b', '.system_generated', 'steps', '789', 'content.md');

const outputPath = path.join(__dirname, 'model_data.js');

try {
  // Models
  const nixieText  = fs.readFileSync(nixieGltfPath,  'utf8');
  const digitsData = fs.readFileSync(digitsGlbPath);
  const digitsB64  = digitsData.toString('base64');
  JSON.parse(nixieText); // Validate JSON

  // Texture
  const textureData = fs.readFileSync(texturePath);
  const textureB64  = textureData.toString('base64');

  // Three.js — strip the markdown header (first 8 lines)
  const threeRaw  = fs.readFileSync(threeJsPath, 'utf8');
  const threeJs   = threeRaw.split('\n').slice(8).join('\n');

  // GLTFLoader — strip the markdown header (first 8 lines)
  const gltfRaw   = fs.readFileSync(gltfLoaderPath, 'utf8');
  const gltfLoader = gltfRaw.split('\n').slice(8).join('\n');

  const output = `// AUTO-GENERATED — не редактировать вручную
// Запустить generate_model_data.js чтобы обновить

export const threeJs       = ${JSON.stringify(threeJs)};
export const gltfLoaderSrc = ${JSON.stringify(gltfLoader)};
export const nixieGltfText = ${JSON.stringify(nixieText)};
export const digitsGlbB64  = ${JSON.stringify(digitsB64)};
export const nixieTextureB64 = ${JSON.stringify(textureB64)};
`;

  fs.writeFileSync(outputPath, output, 'utf8');
  console.log('✅ model_data.js обновлён!');
  console.log('   three.min.js:         ', Math.round(threeJs.length / 1024), 'KB');
  console.log('   GLTFLoader.js:        ', Math.round(gltfLoader.length / 1024), 'KB');
  console.log('   nixie.gltf:           ', Math.round(nixieText.length / 1024), 'KB');
  console.log('   minecraft_digits.glb: ', Math.round(digitsB64.length / 1024), 'KB (base64)');
  console.log('   nixie_tube.png:       ', Math.round(textureB64.length / 1024), 'KB (base64)');
} catch (e) {
  console.error('❌ Ошибка:', e.message);
}
