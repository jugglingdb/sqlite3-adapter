'use strict';

const debug = require('debug')('sqlite3:query');

module.exports = function(client) {

    return {
        command,
        queryAll,
        queryOne
    };

    function command() {
        return query('run', arguments);
    }

    function queryAll() {
        return query('all', arguments);
    }

    function queryOne() {
        return query('get', arguments);
    }

    function query(method, args) {
        debug(args[0]);
        return new Promise((resolve, reject) => {
            client[method].apply(client, [].slice.call(args).concat(function(err, result) {
                if (err) {
                    return reject(err);
                }

                if (method !== 'run') {
                    return resolve(result);
                } 

                const { lastID, changes } = this;
                resolve({
                    result,
                    meta: {
                        lastID,
                        changes
                    }
                });
            }));
        });
    }

};
