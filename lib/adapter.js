'use strict';

const createInformationSchema = require('./information-schema');
const clientWrapper = require('./client-wrapper');

const update = require('./update');
const insert = require('./insert');
const remove = require('./delete');
const lookup = require('./lookup-by-id');
const search = require('./lookup-by-query');
const schema = require('./schema-operations');

module.exports = function createSQLite3Adapter(client) {
    const db = clientWrapper(client);
    const informationSchema = createInformationSchema();

    const adapter = Object.assign({
        name: 'sqlite3',
        disconnect: cb => client.close(cb),
        isActual: cb => cb(null, false),
        define: spec => informationSchema.registerModel(spec.model.modelName, spec)
    },
        update(informationSchema, db),
        insert(informationSchema, db),
        remove(informationSchema, db),
        lookup(informationSchema, db),
        search(informationSchema, db),
        schema(informationSchema, db)
    );

    return adapter;
};

