/**
 * Module dependencies
 */
var sqlite3 = require('sqlite3');
var jdb = require('jugglingdb');

exports.initialize = function initializeSchema(schema, callback) {
    if (!sqlite3) return;
    var s = schema.settings;
    var Database = sqlite3.verbose().Database;
    var db = new Database(s.database);

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
}

require('util').inherits(SQLite3, jdb.BaseSQL);

SQLite3.prototype.command = function () {
    this.query('run', [].slice.call(arguments));
};

SQLite3.prototype.queryAll = function () {
    this.query('all', [].slice.call(arguments));
};

SQLite3.prototype.queryOne = function () {
    this.query('get', [].slice.call(arguments));
};

SQLite3.prototype.query = function (method, args) {
    var time = Date.now();
    var log = this.log;
    var cb = args.pop();
    if (typeof cb === 'function') {
        args.push(function (err, data) {
            if (log) log(args[0], time);
            cb.call(this, err, data);
        });
    } else {
        args.push(cb);
        args.push(function (err, data) {
            log(args[0], time);
        });
    }
    this.client[method].apply(this.client, args);
};

SQLite3.prototype.save = function (model, data, callback) {
    var queryParams = [];
    var sql = 'UPDATE ' + this.tableEscaped(model) + ' SET ' +
    Object.keys(data).map(function (key) {
        queryParams.push(data[key]);
        return '`' + key + '` = ?';
    }).join(', ') + ' WHERE id = ' + data.id;

    this.command(sql, queryParams, function (err) {
        callback(err);
    });
};

/**
 * Must invoke callback(err, id)
 */
SQLite3.prototype.create = function (model, data, callback) {
    data = data || {};
    var questions = [];
    var props = this._models[model].properties;
    var values = Object.keys(data).map(function (key) {
        questions.push('?');
        return this.toDatabase(props[key], data[key]);
    }.bind(this));
    var sql = 'INSERT INTO ' + this.tableEscaped(model) + ' (`' + Object.keys(data).join('`, `') + '`) VALUES ('
    sql += questions.join(',');
    sql += ')';
    this.command(sql, values, function (err) {
        callback(err, this && this.lastID);
    });
};

SQLite3.prototype.updateOrCreate = function (model, data, callback) {
    data = data || {};
    var props = this._models[model].properties;
    var questions = [];
    var values = Object.keys(data).map(function (key) {
        questions.push('?');
        return this.toDatabase(props[key], data[key]);
    }.bind(this));
    var sql = 'INSERT OR REPLACE INTO ' + this.tableEscaped(model) + ' (`' + Object.keys(data).join('`, `') + '`) VALUES ('
    sql += questions.join(',');
    sql += ')';
    this.command(sql, values, function (err) {
        if (!err && this) {
            data.id = this.lastID;
        }
        callback(err, data);
    });
};

SQLite3.prototype.toFields = function (model, data) {
    var fields = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key]) {
            if (typeof data[key] === 'undefined') return;
            fields.push('`' + key.replace(/\./g, '`.`') + '` = ' + this.toDatabase(props[key], data[key]));
        }
    }.bind(this));
    return fields.join(',');
};

function dateToMysql(val) {
    return val.getUTCFullYear() + '-' +
        fillZeros(val.getUTCMonth() + 1) + '-' +
        fillZeros(val.getUTCDate()) + ' ' +
        fillZeros(val.getUTCHours()) + ':' +
        fillZeros(val.getUTCMinutes()) + ':' +
        fillZeros(val.getUTCSeconds());

    function fillZeros(v) {
        return v < 10 ? '0' + v : v;
    }
}

// Adapted from Mysql.escape
SQLite3.prototype.escape = function(val, stringifyObjects) {
    if (val === undefined || val === null) {
        return 'NULL';
    }

    switch (typeof val) {
        case 'boolean': return (val) ? 'true' : 'false';
        case 'number': return val+'';
    }

    if (val instanceof Date) {
        val = SqlString.dateToString(val);
    }

    if (Buffer.isBuffer(val)) {
        return SqlString.bufferToString(val);
    }

    if (Array.isArray(val)) {
        return SqlString.arrayToList(val);
    }

    if (typeof val === 'object') {
        if (stringifyObjects) {
            val = val.toString();
        } else {
            return SqlString.objectToValues(val);
        }
    }

    val = val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function(s) {
        switch(s) {
            case "\0": return "\\0";
            case "\n": return "\\n";
            case "\r": return "\\r";
            case "\b": return "\\b";
            case "\t": return "\\t";
            case "\x1a": return "\\Z";
            default: return "\\"+s;
        }
    });
    return "'"+val+"'";
};

SQLite3.prototype.toDatabase = function (prop, val) {
    if (prop && prop.type.name === 'JSON') {
        return JSON.stringify(val);
    }
    if (val && val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0]
        val = val[operator];
        if (operator === 'between') {
            return  this.toDatabase(prop, val[0]) +
                ' AND ' +
                this.toDatabase(prop, val[1]);
        } else if (operator == 'inq' || operator == 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                for (var i = 0; i < val.length; i++) {
                    val[i] = this.escape(val[i]);
                }
                return val.join(',');
            } else {
                return val;
            }
        }
    }
    if (!prop || "undefined" === typeof val) return val;
    if (prop.type.name === 'Number') return val;
    if (val === null) return 'NULL';
    if (prop.type.name === 'Date') {
        if (!val) return 'NULL';
        if (!val.toUTCString) {
            val = new Date(val);
        }
        return val;
    }
    if (prop.type.name == "Boolean") return val ? 1 : 0;
    return val.toString();
};

SQLite3.prototype.fromDatabase = function (model, data) {
    if (!data) return null;
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        var val = data[key];
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

SQLite3.prototype.escapeName = function (name) {
    return '`' + name + '`';
};

SQLite3.prototype.exists = function (model, id, callback) {
    var sql = 'SELECT 1 FROM ' + this.tableEscaped(model) + ' WHERE id = ' + id + ' LIMIT 1';
    this.queryOne(sql, function (err, data) {
        if (err) return callback(err);
        callback(null, !!(data && data['1'] === 1));
    });
};

SQLite3.prototype.find = function find(model, id, callback) {
    var sql = 'SELECT * FROM ' + this.tableEscaped(model) + ' WHERE id = ' + id + ' LIMIT 1';
    this.queryOne(sql, function (err, data) {
        if (data) {
            data.id = id;
        } else {
            data = null;
        }
        callback(err, this.fromDatabase(model, data));
    }.bind(this));
};

SQLite3.prototype.all = function all(model, filter, callback) {

    var sql = 'SELECT * FROM ' + this.tableEscaped(model);
    var self = this;
    var props = this._models[model].properties;
    var queryParams = [];

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

    this.queryAll(sql, queryParams, function (err, data) {
        if (err) {
            return callback(err, []);
        }
        var objs = data.map(function (obj) {
            return self.fromDatabase(model, obj);
        });
        if (filter && filter.include) {
            this._models[model].model.include(objs, filter.include, callback);
        } else {
            callback(null, objs);
        }
    }.bind(this));

    return sql;

function buildWhere(conds) {
        var cs = [];
        Object.keys(conds).forEach(function (key) {
            var keyEscaped = '`' + key.replace(/\./g, '`.`') + '`';
            var val = self.toDatabase(props[key], conds[key]);
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else if (key.toLowerCase() === 'or' && conds[key] && conds[key].constructor.name === 'Array') {
                var queries = [];
                conds[key].forEach(function (cond) {
                    queries.push(buildWhere(cond));
                });
                cs.push('(' + queries.join(' OR ') + ')');
            } else if (conds[key].constructor.name === 'Object') {
                var condType = Object.keys(conds[key])[0];
                var sqlCond = keyEscaped;
                if ((condType == 'inq' || condType == 'nin') && val.length == 0) {
                    cs.push(condType == 'inq' ? 0 : 1);
                    return true;
                }
                switch (condType) {
                    case 'gt':
                    sqlCond += ' > ';
                    break;
                    case 'gte':
                    sqlCond += ' >= ';
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
                    case 'between':
                    sqlCond += ' BETWEEN ? AND ?';
                    queryParams.push(conds[key][condType][0]);
                    queryParams.push(conds[key][condType][1]);
                    break;
                }
                if (condType == 'inq' || condType == 'nin') {
                	sqlCond += '(' + val + ')';
                } else if (condType == 'like') {
                	sqlCond += "'" + val + "'";
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
        } else {
            return ''
        }
    }

    function buildOrderBy(order) {
        if (typeof order === 'string') order = [order];
        return 'ORDER BY ' + order.map(function(o) {
            var t = o.split(/\s+/);
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

SQLite3.prototype.count = function count(model, callback, where) {
    var self = this;
    var props = this._models[model].properties;
    var queryParams = [];

    this.queryOne('SELECT count(*) as cnt FROM ' +
        this.tableEscaped(model) + ' ' + buildWhere(where), queryParams, function (err, res) {
        if (err) return callback(err);
        callback(err, err ? null : res.cnt);
    });

    function buildWhere(conds) {
        var cs = [];
        Object.keys(conds || {}).forEach(function (key) {
            var keyEscaped = '`' + key.replace(/\./g, '`.`') + '`'
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else {
                if (conds[key] === undefined) return
                cs.push(keyEscaped + ' = ?');
                queryParams.push(self.toDatabase(props[key], conds[key]));
            }
        });
        return cs.length ? ' WHERE ' + cs.join(' AND ') : '';
    }
};

SQLite3.prototype.disconnect = function disconnect() {
    this.client.close();
};

SQLite3.prototype.autoupdate = function (cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.queryAll('PRAGMA table_info(' + self.tableEscaped(model)+')', function (err, fields) {
            if (err || fields.length === 0) {
                self.createTable(model, done);
            } else {
                self.alterTable(model, fields, done);
            }
        });
    });

    function done(err) {
        if (err) {
            console.log(err);
        }
        if (--wait === 0 && cb) {
            cb();
        }
    }
};

SQLite3.prototype.alterTable = function (model, actualFields, done) {
    var self = this;
    var m = this._models[model];
    var propNames = Object.keys(m.properties);
    var sql = [];

    // sqlites ALTER TABLES support is rather limited, so we just
    // check if some has changed and recreate the table
    var needs_rebuild = false;

    propNames.forEach(function (propName) {
        if (propName === 'id') return;
        var found;
        actualFields.forEach(function (f) {
            if (f.name === propName) {
                found = f;
            }
        });

        if (found) {
            if (!needs_rebuild)
                needs_rebuild = changed(m.properties[propName], found);
        } else {
            needs_rebuild = true;
        }
    });

    // check if a column was removed, if so, set column_drop, so we
    // can later get the right columns for the datamigrations
    var column_droped = false;
    actualFields.forEach(function (f) {
        var notFound = !~propNames.indexOf(f.name);
        if (f.Field === 'id') return;
        if (notFound || !m.properties[f.name]) {
            needs_rebuild = true;
            column_droped  = true;
        }
    });

    if (needs_rebuild) {
        // first step, we need to run query in one transaction
        self.command('BEGIN TRANSACTION',function(){
	        // second step, rename the current table
	        self.command('ALTER TABLE ' + self.tableEscaped(model) + 'RENAME TO ' + self.escapeName('temp__'+self.table(model)),function(){
	            // third step create the new table
	            self.createTable(model,function(){
	                // fourth step: move the data from the old table to the
	                // new one
	                var fields = '';
	                // if a column was removed take the columns from the
	                // model, else from the old table, but dont expect
	                // some miracle to some complex datamigration, this
	                // you have to do yourself.
	                if (column_droped) {
	                    fields = propNames.join(',');
	                } else {
	                    var fields = actualFields.map(function(field){
	                        return field.name
	                    }).join(',');
	                }
	                self.command('INSERT INTO '+ self.tableEscaped(model) + '(' + fields + ') SELECT ' + fields + ' FROM ' + self.escapeName('temp__'+self.table(model)),function(){
	                    // fifth step: drop the renamed table
	                    self.command('DROP TABLE ' + self.escapeName('temp__'+self.table(model)),function(){
	                       //sixth and final step: commit transaction
	                       self.command('COMMIT',done);
	                    });
	                });
	            })
	        });
        });
    } else {
        done();
    }

    function changed(newSettings, oldSettings) {
        if (oldSettings.notnull === 0 && (newSettings.allowNull === false || newSettings.null === false)) return true;
        if (oldSettings.notnull === 1 && !(newSettings.allowNull === false || newSettings.null === false)) return true;
        if (oldSettings.type.toUpperCase() !== datatype(newSettings)) return true;
        return false;
    }
};

SQLite3.prototype.propertiesSQL = function (model) {
    var self = this;
    var sql = ['`id` INTEGER PRIMARY KEY'];
    Object.keys(this._models[model].properties).forEach(function (prop) {
        if (prop === 'id') return;
        sql.push('`' + prop + '` ' + self.propertySettingsSQL(model, prop));
    });
    return sql.join(',\n  ');

};

SQLite3.prototype.propertySettingsSQL = function (model, prop) {
    var p = this._models[model].properties[prop];
    return datatype(p) + 
    //// In case in the future support user defined PK, un-comment the following:
    // (p.primaryKey === true ? ' PRIMARY KEY' : '') +
    // (p.primaryKey === true && p.autoIncrement === true ? ' AUTOINCREMENT' : '') +
    (p.allowNull === false || p['null'] === false ? ' NOT NULL' : ' NULL') +
    (p.unique === true ? ' UNIQUE' : '') +
    (typeof p.default === "number" ? ' DEFAULT ' + p.default :'') +
    (typeof p.default === "string" ? ' DEFAULT \'' + p.default + '\'' :'');
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
