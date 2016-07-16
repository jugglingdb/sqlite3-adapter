'use strict';

module.exports = function(client) {

    return {
        command,
        queryAll,
        queryOne
    };

    const slice = [].slice;

    function command() {
        return query('run', slice.call(arguments));
    };

    function queryAll() {
        return query('all', slice.call(arguments));
    };

    function queryOne() {
        return query('get', slice.call(arguments));
    };

    function query(method, args) {
        return new Promise((resolve, reject) => {
            client[method].apply(this.client, args.concat(function(err, result) {
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
            });
        });
    }

};
