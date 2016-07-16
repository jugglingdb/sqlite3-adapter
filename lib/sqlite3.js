'use strict';

const createSQLite3Adapter = require('./adapter');
const connection = require('./connection');

exports.initialize = function initializeSchema(schema, callback) {
    schema.client = connection(schema.settings);
    schema.adapter = createSQLite3Adapter(schema.client);
    schema.adapter.schema = schema;

    if (schema.settings.database === ':memory:') {
        schema.adapter.automigrate()
            .then(() => {
                callback(null);
            }, err => {
                console.errror(err);
                callback(err);
            });
    } else {
        process.nextTick(callback);
    }
};

