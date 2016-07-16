'use strict';

const sqlite3 = require('sqlite3');

module.exports = function(settings) {

    let Database = null;

    switch (settings.type) {
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

    return new Database(settings.database);

};

