'use strict';

module.exports = function(informationSchema, db) {

    const {
        tableName,
        castForDb,
        escapeKey
    } = informationSchema;

    return {
        save,
        updateAttributes
    };

    function save(model, data) {
        const {
            table,
            assignments,
            queryParams
        } = buildUpdateSpec(model, data);

        const sql = `UPDATE ${ table } SET ${ assignments } WHERE id = ?`;

        return db.command(sql, queryParams).then(r => r.result);
    }

    function updateAttributes(model, id, data) {
        return save(model, Object.assign({}, data, { id }));
    }

    function buildUpdateSpec(model, data) {
        const table = tableName(model);
        const keys = Object.keys(data);

        const queryParams = keys.map(key => castForDb(
            model,
            key,
            data[key]
        ))
            .concat(data.id);

        const assignments = keys.map(key => `${ escapeKey(key) } = ?`).join(', ');

        return {
            table,
            assignments,
            queryParams
        };
    }

};

