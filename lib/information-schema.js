'use strict';

module.exports = function() {

    const models = {};

    return {
        registerModel,
        getModelNames,
        getModel: name => models[name],
        isDefinedProperty,
        castForDb,
        castFromDb,
        castObjectFromDb,
        escapeKey,
        dataType,
        propertiesSQL,
        tableName,
        tableNameUnescaped
    };

    function tableName(model) {
        return escapeKey(tableNameUnescaped(model));
    }

    function tableNameUnescaped(model) {
        return models[model].model.tableName;
    }

    function getModelNames() {
        return Object.keys(models);
    }

    function isDefinedProperty(model, propertyName) {
        return propertyName in models[model].properties;
    }

    function escapeKey(key) {
        return `\`${key}\``;
    }

    function registerModel(model, spec) {
        models[model] = spec;
    }

    function castForDb(model, key, value) {
        const prop = models[model].properties[key];
        let val = value;

        if (prop && prop.type.name === 'JSON') {
            return JSON.stringify(val);
        }

        if (val && val.constructor.name === 'Object') {
            throw new Error(`Inexpected ("object") type for ${ model }.${key}`);
        }

        if (!prop || 'undefined' === typeof val) {
            return val;
        }
        if (prop.type.name === 'Number') {
            return val;
        }
        if (val === null) {
            return 'NULL';
        }
        if (prop.type.name === 'Date') {
            if (!val) {
                return 'NULL';
            }
            if (!val.toUTCString) {
                val = new Date(val);
            }
            return val;
        }

        if (prop.type.name === 'Boolean') {
            return val ? 1 : 0;
        }

        return val.toString();
    }

    function castObjectFromDb(model, obj) {
        if (!obj) {
            return null;
        }

        return Object.keys(obj)
            .reduce((result, key) => {
                result[key] = castFromDb(model, key, obj[key]);
                return result;
            }, {});
    }

    function castFromDb(model, key, value) {
        const props = models[model].properties;
        let val = value;
        if (typeof val === 'undefined' || val === null) {
            return;
        }
        if (props[key]) {
            switch (props[key].type.name) {
                case 'JSON':
                    val = JSON.parse(val);
                    break;
                case 'Date':
                    val = new Date(parseInt(val));
                    break;
                case 'Boolean':
                    val = Boolean(val);
                    break;
            }
        }
        return val;
    }

    function dataType(property) {
        switch (property.type.name) {
            case 'String':
                return 'VARCHAR(' + (property.limit || 255) + ')';
            case 'Text':
            case 'JSON':
                return 'TEXT';
            case 'Number':
                return 'INT(11)';
            case 'Date':
                return 'DATETIME';
            case 'Boolean':
                return 'TINYINT(1)';
        }
    }

    function propertiesSQL(model) {
        const sql = [ '`id` INTEGER PRIMARY KEY' ];
        Object.keys(models[model].properties).forEach(prop => {
            if (prop === 'id') {
                return;
            }
            sql.push('`' + prop + '` ' + propertySettingsSQL(model, prop));
        });
        return sql.join(',\n  ');
    }

    function propertySettingsSQL(model, prop) {
        const p = models[model].properties[prop];
        return dataType(p) +
        //// In case in the future support user defined PK, un-comment the following:
        // (p.primaryKey === true ? ' PRIMARY KEY' : '') +
        // (p.primaryKey === true && p.autoIncrement === true ? ' AUTOINCREMENT' : '') +
        (p.allowNull === false || p['null'] === false ? ' NOT NULL' : ' NULL') +
        (p.unique === true ? ' UNIQUE' : '') +
        (typeof p.default === 'number' ? ' DEFAULT ' + p.default : '') +
        (typeof p.default === 'string' ? ' DEFAULT \'' + p.default + '\'' : '');
    }

};

