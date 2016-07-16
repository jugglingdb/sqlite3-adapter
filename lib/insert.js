'use strict';

module.exports = function(informationSchema, db) {

    const {
        tableName,
        castForDb,
        escapeKey,
    } = informationSchema;

    const command = db.command;

    return {
        updateOrCreate,
        create
    };

    function buildInsertSpec(model, data) {
        const table = tableName(model);
        const keys = Object.keys(data);
        const queryParams = keys.map(key => castForDb(model, key, data[key]));
        const fields = keys.map(key => escapeKey(key));
        const marks = new Array(keys.length).fill('?').join(', ');

        return {
            table,
            fields,
            marks,
            queryParams
        };
    }

    function create(model, data) {
        const {
            table,
            fields,
            marks,
            queryParams
        } = buildInsertSpec(model, data);

        const sql = `INSERT INTO ${ table } (${ fields }) VALUES (${ marks })`;

        return command(sql, queryParams)
            .then(r => r.meta.lastID);
    }

    function updateOrCreate(model, data) {
        const {
            table,
            fields,
            marks,
            queryParams
        } = buildInsertSpec(model, data);

        const sql = `INSERT OR REPLACE
            INTO ${ table } ( ${ fields } ) VALUES ( ${ marks } )`;

        return command(sql, queryParams)
            .then(r => {
                data.id = r.meta.lastID;
                return data;
            });
    }

};

