describe('sqlite3 imported features', () => {

    before(() => {
        require('./init.js');
    });

    require('@pulse/jugglingdb/test/common.batch.js');
    require('@pulse/jugglingdb/test/include.test.js');

});
