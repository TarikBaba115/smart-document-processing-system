const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Document = sequelize.define('document', {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    docType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    supplier: {
      type: DataTypes.STRING,
      allowNull: true
    },
    docNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    issueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    taxTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: 'uploaded'
    }
  }, {
    tableName: 'document'
  });

  return Document;
};