describe('sqlite3 imported features', () => {

    before(() => {
        require('./init.js');
    });

    require('jugglingdb/test/common.batch.js');
    require('jugglingdb/test/include.test.js');

});
