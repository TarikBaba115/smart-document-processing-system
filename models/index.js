const sequelize = require('../db/sequelize');
const buildDocument = require('./document');
const buildLineItem = require('./line_item');

const Document = buildDocument(sequelize);
const LineItem = buildLineItem(sequelize);

Document.hasMany(LineItem, { foreignKey: 'documentId', as: 'lineItems' });
LineItem.belongsTo(Document, { foreignKey: 'documentId', as: 'document' });

module.exports = {
  sequelize,
  Document,
  LineItem
};