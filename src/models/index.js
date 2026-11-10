// Carrega todos os models e define as associações.
const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const db = {};
for (const arq of fs.readdirSync(__dirname)) {
  if (arq === 'index.js' || !arq.endsWith('.js')) continue;
  const model = require(path.join(__dirname, arq))(sequelize, DataTypes);
  db[model.name] = model;
}
for (const nome of Object.keys(db)) {
  if (db[nome].associate) db[nome].associate(db);
}
db.sequelize = sequelize;
db.Sequelize = require('sequelize');
module.exports = db;
