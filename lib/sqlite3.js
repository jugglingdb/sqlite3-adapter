'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const jdb = require('jugglingdb');
const queryWrapper = require('./query-wrapper');

exports.initialize = function initializeSchema(schema, callback) {
    const s = schema.settings;

    let Database = null;
    switch (s.type) {
        case 'cached':
            Database = sqlite3.cached.Database;
            break;
        case 'normal':
        default:
            Database = sqlite3.Database;
            break;
        case 'verbose':
            Database = sqlite3.verbose().Database;
    }

    const db = new Database(s.database);

    schema.client = db;

    schema.adapter = new SQLite3(schema.client);
    schema.adapter.schema = schema;
    
    if (s.database === ':memory:') {
        schema.adapter.automigrate(callback);
    } else {
        process.nextTick(callback);
    }

};

function SQLite3(client) {
    this.name = 'sqlite3';
    this._models = {};
    this.client = client;

    Object.assign(this, queryWrapper(client));

}

require('util').inherits(SQLite3, jdb.BaseSQL);

SQLite3.prototype.buildUpdateSpec = function(model, data) {
    const props = this._models[model].properties;
    const table = this.tableEscaped(model);
    const keys = Object.keys(data);

    const queryParams = keys.map(key => this.toDatabase(props[key], data[key]))
        .concat(data.id);

    const assignments = keys.map(key => `\`${ key }\` = ?`);

    return {
        table,
        assignments,
        queryParams
    };
};

SQLite3.prototype.save = function(model, data) {
    const {
        table,
        assignments,
        queryParams
    } = this.buildUpdateSpec(model, data);

    const sql = `UPDATE ${ table } SET ${ assignments } WHERE id = ?`;

    return this.command(sql, queryParams).then(r => r.result);
};

SQLite3.prototype.buildInsertSpec = function(model, data) {
    data = data || {};
    const props = this._models[model].properties;
    const table = this.tableEscaped(model);
    const keys = Object.keys(data);
    const values = keys.map(key => this.toDatabase(props[key], data[key]));
    const marks = new Array(keys.lenght).fill('?').join(', ');
    const queryParams = keys.concat(values);

    return {
        table,
        marks,
        queryParams
    };
};

/**
 * Must invoke callback(err, id)
 */
SQLite3.prototype.create = function(model, data) {
    const {
        table,
        marks,
        queryParams
    } = this.buildInsertSpec(model, data);

    const sql = `INSERT INTO ${table} ( ${marks} ) VALUES ( ${marks} )`;

    return this.command(sql, queryParams)
        .then(r => r.meta.lastID);
};

SQLite3.prototype.updateOrCreate = function(model, data) {
    const {
        table,
        marks,
        queryParams
    } = this.buildInsertSpec(model, data);

    const sql = `INSERT OR REPLACE INTO ${table} ( ${marks} ) VALUES ( ${marks} )`;

    return this.command(sql, queryParams)
        .then(r => {
            data.id = r.meta.lastID;
            return data;
        });
};

SQLite3.prototype.toDatabase = function(prop, val) {
    if (prop && prop.type.name === 'JSON') {
        return JSON.stringify(val);
    }

    if (val && val.constructor.name === 'Object') {
        const operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'between') {
            return  this.toDatabase(prop, val[0]) +
                ' AND ' +
                this.toDatabase(prop, val[1]);
        } else if (operator === 'inq' || operator === 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                for (let i = 0; i < val.length; i++) {
                    val[i] = `"${ val[i] }"`;
                }
                return val.join(',');
            }
            return val;
        }
    }

    if (!prop || 'undefined' === typeof val) return val;
    if (prop.type.name === 'Number') return val;
    if (val === null) return 'NULL';
    if (prop.type.name === 'Date') {
        if (!val) return 'NULL';
        if (!val.toUTCString) {
            val = new Date(val);
        }
        return val;
    }

    if (prop.type.name === 'Boolean') return val ? 1 : 0;
    return val.toString();
};

SQLite3.prototype.fromDatabase = function(model, data) {
    if (!data) return null;
    const props = this._models[model].properties;
    Object.keys(data).forEach(function(key) {
        let val = data[key];
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
        data[key] = val;
    });
    return data;
};

SQLite3.prototype.escapeName = function(name) {
    return `\`${name}\``;
};

SQLite3.prototype.exists = function(model, id) {
    assert(id, 'Required "id" argument is missing');

    const table = this.tableEscaped(model);
    const sql = `SELECT 1 as exists FROM ${table} WHERE id = ? LIMIT 1`;

    return this.queryOne(sql, [ id ])
        .then(r => Boolean(r && r.exists === 1));
};

SQLite3.prototype.find = function find(model, id) {
    const table = this.tableEscaped(model);
    const sql = `SELECT * FROM ${table} WHERE id = ? LIMIT 1`;

    return this.queryOne(sql, [ id ])
        .then(data => {
            if (data) {
                data.id = id;
            } else {
                data = null;
            }
            return this.fromDatabase(model, data);
        });
};

SQLite3.prototype.all = function all(model, filter) {
    const table = this.tableEscaped(model);
    const self = this;
    const props = this._models[model].properties;
    const queryParams = [];

    let sql = `SELECT * FROM ${table}`;

    if (filter) {

        if (filter.where) {
            sql += ' WHERE ' + buildWhere(filter.where);
        }

        if (filter.order) {
            sql += ' ' + buildOrderBy(filter.order);
        }

        if (filter.limit) {
            sql += ' ' + buildLimit(filter.limit, filter.offset || 0);
        }

    }

    return this.queryAll(sql, queryParams)
        .then(records => {
            const objs = records.map(record => self.fromDatabase(model, record));
            if (filter && filter.include) {
                return this._models[model].model.include(objs, filter.include);
            }
            return objs;
        });

    function buildWhere(conds) {
        const cs = [];
        Object.keys(conds).forEach(key => {
            const keyEscaped = '`' + key.replace(/\./g, '`.`') + '`';
            const val = self.toDatabase(props[key], conds[key]);
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else if (key.toLowerCase() === 'or' && conds[key] && conds[key].constructor.name === 'Array') {
                const queries = [];
                conds[key].forEach(function(cond) {
                    queries.push(buildWhere(cond));
                });
                cs.push('(' + queries.join(' OR ') + ')');
            } else if (conds[key].constructor.name === 'Object') {
                const condType = Object.keys(conds[key])[0];
                let sqlCond = keyEscaped;
                if ((condType === 'inq' || condType === 'nin') && val.length === 0) {
                    cs.push(condType === 'inq' ? 0 : 1);
                    return true;
                }
                switch (condType) {
                    case 'gt':
                        sqlCond += ' > ';
                        break;
                    case 'gte':
                        sqlCond += ' >= ';
                        break;
                    case 'ne':
                        sqlCond += ' != ';
                        break;
                    case 'lt':
                        sqlCond += ' < ';
                        break;
                    case 'lte':
                        sqlCond += ' <= ';
                        break;
                    case 'inq':
                        sqlCond += ' IN ';
                        break;
                    case 'nin':
                        sqlCond += ' NOT IN ';
                        break;
                    case 'like':
                        sqlCond += ' LIKE ';
                        break;
                    case 'nlike':
                        sqlCond += ' NOT LIKE ';
                        break;
                    case 'between':
                        sqlCond += ' BETWEEN ? AND ?';
                        queryParams.push(self.toDatabase(props[key],conds[key][condType][0]));
                        queryParams.push(self.toDatabase(props[key],conds[key][condType][1]));
                        break;
                }
                if (condType === 'inq' || condType === 'nin') {
                    sqlCond += '(' + val + ')';
                } else if (condType === 'like' || condType === 'nlike') {
                    sqlCond += `'${ val }'`;
                } 

                if (condType !== 'between' && condType !== 'inq' && condType !== 'nin' && condType !== 'like') {
                    sqlCond += '?';
                    queryParams.push(self.toDatabase(props[key],conds[key][condType]));
                }
                cs.push(sqlCond);
            } else {
                cs.push(keyEscaped + ' = ?');
                queryParams.push(self.toDatabase(props[key], conds[key]));
            }
        });
        if (cs.length > 0){
            return cs.join(' AND ');
        }
        return '';
    }

    function buildOrderBy(order) {
        if (typeof order === 'string') order = [order];
        return 'ORDER BY ' + order.map(function(o) {
            const t = o.split(/\s+/);
            if (t.length === 1) {
                return '`' + o + '`';
            }
            return '`' + t[0] + '` ' + t[1];
        }).join(', ');
    }

    function buildLimit(limit, offset) {
        return 'LIMIT ' + (offset ? (offset + ', ' + limit) : limit);
    }

};

SQLite3.prototype.count = function count(model, where) {
    const self = this;
    const table = this.tableEscaped(model);
    const props = this._models[model].properties;
    const queryParams = [];
    const where = buildWhere(where);

    const sql = `SELECT count(*) as cnt FROM ${table} ${where}`;

    return this.queryOne(sql, queryParams)
        .then(result => result.cnt);

    // TODO use same "where" builder as for "all"
    function buildWhere(conds) {
        const cs = [];
        Object.keys(conds || {}).forEach(function(key) {
            const keyEscaped = '`' + key.replace(/\./g, '`.`') + '`';
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else {
                if (conds[key] === undefined) return;
                cs.push(keyEscaped + ' = ?');
                queryParams.push(self.toDatabase(props[key], conds[key]));
            }
        });
        return cs.length ? ' WHERE ' + cs.join(' AND ') : '';
    }
};

SQLite3.prototype.disconnect = function disconnect(cb) {
    this.client.close(cb);
};

SQLite3.prototype.isActual = function(cb) {
    cb(null, false);
};

SQLite3.prototype.autoupdate = function(cb) {
    const self = this;
    let wait = 0;
    Object.keys(this._models).forEach(function(model) {
        wait += 1;
        self.queryAll('PRAGMA table_info(' + self.tableEscaped(model) + ')')
            .then(fields => {
                if (fields.length === 0) {
                    self.createTable(model, done);
                } else {
                    self.alterTable(model, fields, done);
                }
            });
    });

    let hadError;
    function done(err) {
        if (err) {
            hadError = err;
            console.log(err);
        }
        if (--wait === 0 && cb) {
            cb(hadError);
        }
    }
};

SQLite3.prototype.alterTable = function(model, actualFields, done) {
    const self = this;
    const m = this._models[model];
    const propNames = Object.keys(m.properties);

    // sqlites ALTER TABLES support is rather limited, so we just
    // check if some has changed and recreate the table
    let needsRebuild = false;

    propNames.forEach(function(propName) {
        if (propName === 'id') return;
        let found;
        actualFields.forEach(function(f) {
            if (f.name === propName) {
                found = f;
            }
        });

        if (found) {
            if (!needsRebuild)
                needsRebuild = changed(m.properties[propName], found);
        } else {
            needsRebuild = true;
        }
    });

    // check if a column was removed, if so, set column_drop, so we
    // can later get the right columns for the datamigrations
    let columnDropped = false;
    actualFields.forEach(function(f) {
        const notFound = !~propNames.indexOf(f.name);
        if (f.Field === 'id') return;
        if (notFound || !m.properties[f.name]) {
            needsRebuild = true;
            columnDropped  = true;
        }
    });

    if (!needsRebuild) {
        return done();
    }

    // first step, we need to run query in one transaction
    self.command('BEGIN TRANSACTION')
        .then(() => {
            // second step, rename the current table
            return self.command('ALTER TABLE ' + self.tableEscaped(model) + 'RENAME TO ' + self.escapeName('temp__'+self.table(model)));
        })
        .then(() => {
            // third step create the new table
            return self.createTable(model);
        })
        .then(() => {
            // fourth step: move the data from the old table to the
            // new one
            let fields = '';
            // if a column was removed take the columns from the
            // model, else from the old table, but dont expect
            // some miracle to some complex datamigration, this
            // you have to do yourself.
            if (columnDropped) {
                fields = propNames.join(', ');
            } else {
                fields = actualFields.map(field => field.name).join(', ');
            }
            return self.command('INSERT INTO ' +
                self.tableEscaped(model) + '(' + fields +
                ') SELECT ' + fields + ' FROM ' +
                self.escapeName('temp__'+self.table(model)));
        })
        .then(() => {
            // fifth step: drop the renamed table
            return self.command('DROP TABLE ' + self.escapeName('temp__' + self.table(model)));
        })
        .then(() => self.command('COMMIT'))
        .then(() => done(), done);

    function changed(newSettings, oldSettings) {
        if (oldSettings.notnull === 0 && (newSettings.allowNull === false || newSettings.null === false)) return true;
        if (oldSettings.notnull === 1 && !(newSettings.allowNull === false || newSettings.null === false)) return true;
        if (oldSettings.type.toUpperCase() !== datatype(newSettings)) return true;
        return false;
    }
};

SQLite3.prototype.propertiesSQL = function(model) {
    const self = this;
    const sql = ['`id` INTEGER PRIMARY KEY'];
    Object.keys(this._models[model].properties).forEach(function(prop) {
        if (prop === 'id') return;
        sql.push('`' + prop + '` ' + self.propertySettingsSQL(model, prop));
    });
    return sql.join(',\n  ');
};

SQLite3.prototype.propertySettingsSQL = function(model, prop) {
    const p = this._models[model].properties[prop];
    return datatype(p) + 
    //// In case in the future support user defined PK, un-comment the following:
    // (p.primaryKey === true ? ' PRIMARY KEY' : '') +
    // (p.primaryKey === true && p.autoIncrement === true ? ' AUTOINCREMENT' : '') +
    (p.allowNull === false || p['null'] === false ? ' NOT NULL' : ' NULL') +
    (p.unique === true ? ' UNIQUE' : '') +
    (typeof p.default === 'number' ? ' DEFAULT ' + p.default :'') +
    (typeof p.default === 'string' ? ' DEFAULT \'' + p.default + '\'' :'');
};

function datatype(p) {
    switch (p.type.name) {
        case 'String':
            return 'VARCHAR(' + (p.limit || 255) + ')';
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

