const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

const TIPOS = {
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/zip',
  ],
  '.csv': [
    'text/csv',
    'application/vnd.ms-excel',
    'text/plain',
    'application/csv',
    'application/octet-stream',
  ],
  '.json': ['application/json', 'text/plain', 'application/octet-stream'],
};

/** Upload em memória (nunca grava em disco), 5 MB, valida extensão + MIME. */
function upload(extensoes = ['.xlsx', '.csv']) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!extensoes.includes(ext) || !(TIPOS[ext] || []).includes(file.mimetype)) {
        return cb(AppError.badRequest(`Arquivo inválido. Envie: ${extensoes.join(', ')}.`));
      }
      cb(null, true);
    },
  }).single('arquivo');
}

module.exports = upload;
