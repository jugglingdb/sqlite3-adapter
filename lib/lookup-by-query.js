'use strict';

const queryBuilder = require('./query-builder');

module.exports = function(informationSchema, db) {

    const {
        tableName,
        getModel,
        castObjectFromDb
    } = informationSchema;

    const {
        queryAll,
        queryOne
    } = db;

    const {
        buildWhere
    } = queryBuilder(informationSchema);

    return {
        count,
        all
    };

    function all(model, filter) {
        const table = tableName(model);
        const queryParams = [];

        let sql = `SELECT * FROM ${table}`;

        if (filter) {

            if (filter.where) {
                sql += ' WHERE ' + buildWhere(model, filter.where, queryParams);
            }

            if (filter.order) {
                sql += ' ' + buildOrderBy(filter.order);
            }

            if (filter.limit) {
                sql += ' ' + buildLimit(filter.limit, filter.offset || 0);
            }

        }

        return queryAll(sql, queryParams)
            .then(records => {
                const objs = records.map(record => castObjectFromDb(model, record));
                if (filter && filter.include) {
                    return new Promise((resolve, reject) => {
                        getModel(model).model.include(objs, filter.include, (err, result) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(result);
                            }
                        });
                    });
                }

                return objs;
            });

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

    }

    function count(model, where) {
        const table = tableName(model);
        const queryParams = [];
        where = buildWhere(model, where, queryParams);

        if (where) {
            where = 'WHERE ' + where;
        }

        const sql = `SELECT count(*) as cnt FROM ${table} ${where}`;

        return queryOne(sql, queryParams)
            .then(result => result.cnt);

    }

};
