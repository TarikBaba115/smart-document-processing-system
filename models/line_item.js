const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LineItem = sequelize.define('line_item', {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: true
    },
    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    taxRate: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    documentId: {
      type: DataTypes.UUID,
      allowNull: false
    }
  }, {
    tableName: 'line_item'
  });

  return LineItem;
};