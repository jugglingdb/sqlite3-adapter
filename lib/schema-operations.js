'use strict';

module.exports = function(informationSchema, db) {

    const {
        tableName,
        tableNameUnescaped,
        getModelNames,
        propertiesSQL,
        dataType,
        escapeKey,
    } = informationSchema;

    const command = db.command;

    return {
        autoupdate,
        automigrate,
        alterTable,
        dropTable,
        createTable
    };

    function autoupdate() {
        return Promise.all(getModelNames().map(model => {
            return db.queryAll('PRAGMA table_info(' + tableName(model) + ')')
                .then(fields => {
                    if (fields.length === 0) {
                        return createTable(model);
                    }
                    return alterTable(model, fields);
                });
        }));
    }

    function alterTable(model, actualFields) {

        const m = informationSchema.getModel(model);
        const properties = m.properties;
        const propNames = Object.keys(properties);

        // sqlites ALTER TABLES support is rather limited, so we just
        // check if some has changed and recreate the table
        let needsRebuild = false;

        propNames.forEach(propName => {
            if (propName === 'id') {
                return;
            }

            let found;
            actualFields.forEach(f => {
                if (f.name === propName) {
                    found = f;
                }
            });

            if (found) {
                if (!needsRebuild) {
                    needsRebuild = changed(m.properties[propName], found);
                }
            } else {
                needsRebuild = true;
            }
        });

        // check if a column was removed, if so, set column_drop, so we
        // can later get the right columns for the datamigrations
        let columnDropped = false;
        actualFields.forEach(f => {
            const notFound = !~propNames.indexOf(f.name);
            if (f.Field === 'id') {
                return;
            }

            if (notFound || !m.properties[f.name]) {
                needsRebuild = true;
                columnDropped  = true;
            }
        });

        if (!needsRebuild) {
            return;
        }

        // first step, we need to run query in one transaction
        return command('BEGIN TRANSACTION')
            .then(() => {
                // second step, rename the current table
                return command('ALTER TABLE ' + tableName(model) + 'RENAME TO ' + escapeKey('temp__' + tableNameUnescaped(model)));
            })
            .then(() => {
                // third step create the new table
                return createTable(model);
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
                return command('INSERT INTO ' +
                    tableName(model) + '(' + fields +
                    ') SELECT ' + fields + ' FROM ' +
                    escapeKey('temp__' + tableNameUnescaped(model)));
            })
            .then(() => {
                // fifth step: drop the renamed table
                return command('DROP TABLE ' + escapeKey('temp__' + tableNameUnescaped(model)));
            })
            .then(() => command('COMMIT'));

        function changed(newSettings, oldSettings) {
            if (oldSettings.notnull === 0 && (newSettings.allowNull === false || newSettings.null === false)) {
                return true;
            }

            if (oldSettings.notnull === 1 && !(newSettings.allowNull === false || newSettings.null === false)) {
                return true;
            }

            if (oldSettings.type.toUpperCase() !== dataType(newSettings)) {
                return true;
            }

            return false;
        }
    }

    function automigrate() {
        return Promise.all(getModelNames().map(model =>
            dropTable(model).then(() => createTable(model))));
    }

    function dropTable(model) {
        const table = tableName(model);
        return db.command(`DROP TABLE IF EXISTS ${ table }`);
    }

    function createTable(model) {
        const table = tableName(model);
        const props = propertiesSQL(model);
        return db.command(`CREATE TABLE ${ table }
            ( ${ props } )`);
    }

};

