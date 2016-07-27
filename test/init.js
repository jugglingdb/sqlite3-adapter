module.exports = require('should');

const Schema = require('jugglingdb').Schema;

global.getSchema = function() {
    const db = new Schema(require('../'), { database: ':memory:' });
    // db.log = function (a) { console.log(a); };
    return db;
};
