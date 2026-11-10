// Copia bibliotecas de front-end para /public/vendor (servidas localmente, sem CDN).
const fs = require('fs');
const path = require('path');

const destino = path.join(__dirname, '..', 'public', 'vendor');
fs.mkdirSync(destino, { recursive: true });
const arquivos = [['chart.js/dist/chart.umd.min.js', 'chart.umd.js']];
for (const [origem, nome] of arquivos) {
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'node_modules', origem), path.join(destino, nome));
  } catch (e) {
    console.warn(`[copy-vendor] não foi possível copiar ${origem}: ${e.message}`);
  }
}
