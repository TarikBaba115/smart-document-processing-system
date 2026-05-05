const sequelize = require('../db/sequelize');
const buildDocument = require('./document');
const buildLineItem = require('./line_item');
const buildIssue = require('./issue');

const Document = buildDocument(sequelize);
const LineItem = buildLineItem(sequelize);
const Issue = buildIssue(sequelize);

Document.hasMany(LineItem, { foreignKey: 'documentId', as: 'lineItems' });
LineItem.belongsTo(Document, { foreignKey: 'documentId', as: 'document' });

Document.hasMany(Issue, { foreignKey: 'documentId', as: 'issues' });
Issue.belongsTo(Document, { foreignKey: 'documentId', as: 'document' });

module.exports = {
  sequelize,
  Document,
  LineItem,
  Issue
};