const should = require('./init.js');
const Schema = require('jugglingdb').Schema;
let db, UserData;

/* global getSchema */

describe('basic-query-sqlite', function() {
    before(setup);

    before(done => {
        db = getSchema();
        UserData = db.define('UserData', {
            name : String,
            email : String,
            role : String,
            order : Number,
            bio: Schema.Text,
            doc: Schema.JSON
        });

        db.automigrate(done);
    });

    before(seed);

    it('should query collection using or operator', () => {
        return UserData.all({
            where : {
                or : [{
                    name : 'Paul McCartney'
                }, {
                    name : 'John Lennon'
                }]
            }
        })
            .then(users => {
                should.exist(users);
                users.should.have.lengthOf(2);
                users.forEach(function(u) {
                    u.role.should.eql('lead');
                });
            });
    });
  
    it('should query collection using or operator on different fields', function() {
        return UserData.all({
            where : {
                or : [{
                    name : 'Not a User'
                }, {
                    order : '5'
                }]
            }
        })
            .then(users => {
                should.exists(users);
                users.should.have.lengthOf(1);
                users[0].order.should.eql(5);
            });
    });

    it('should query collection using or operator combined with and operator', () => {
        return UserData.all({
            where : {
                name : 'Ringo Starr',
                or : [{
                    role : 'lead'
                }, {
                    order : '6'
                }]
            }
        })
            .then(users => {
                should.exists(users);
                users.should.have.lengthOf(1);
                users[0].name.should.equal('Ringo Starr');
            });
    });

    it('should query by null', () => {
        return UserData.findOne({ where: { email: null }})
            .then(user => {
                should.not.exist(user.email);
            });
    });

    it('should support exclusion from empty set', () => {
        return UserData.count({ email: { nin: [] }})
            .then(count => {
                count.should.equal(6); // full set
            });
    });

    it('should support exclusion from non empty set', () => {
        return UserData.count({ order: { nin: [ 1 ] }})
            .then(count => {
                count.should.equal(5);
            });
    });

    it('should support inclusion in empty set', () => {
        return UserData.count({ email: { inq: [] }})
            .then(count => {
                count.should.equal(0); // empty set
            });
    });

    it('should query by "gt"', () => {
        return UserData.count({ order: { gt: 2 }})
            .then(count => {
                count.should.equal(4);
            });
    });

    it('should query by "gte"', () => {
        return UserData.count({ order: { gte: 2 }})
            .then(count => {
                count.should.equal(5);
            });
    });

    it('should query by "lt"', () => {
        return UserData.count({ order: { lt: 2 }})
            .then(count => {
                count.should.equal(1);
            });
    });

    it('should query by "lte"', () => {
        return UserData.count({ order: { lte: 2 }})
            .then(count => {
                count.should.equal(2);
            });
    });

    it('should query by "ne"', () => {
        return UserData.count({ order: { ne: 2 }})
            .then(count => {
                count.should.equal(5);
            });
    });

    it('should query by using "LIKE"', () => {
        return UserData.count({ email: { like: '%b3atl3s%' }})
            .then(count => {
                count.should.equal(2);
            });
    });

    it('should query by using "NLIKE"', () => {
        return UserData.count({ email: { nlike: '%paul%' }})
            .then(count => {
                count.should.equal(1);
            });
    });

    it('should query by using "BETWEEN"', () => {
        return UserData.count({ order: { between: [ 3, 5 ] }})
            .then(count => {
                count.should.equal(3);
            });
    });

    it('should support "NOT" condition in Model.count', () => {
        return UserData.count({
            not: {
                or: [
                    { email: { like: '%paul%' }},
                    { email: null }
                ]
            }
        })
            .then(count => {
                count.should.equal(1);
            });
    });

    it('should support "NOT" condition in Model.all', () => {
        return UserData.all({ where: {
            not: {
                or: [
                    { email: { like: '%paul%' }},
                    { email: null }
                ]
            }
        }})
            .then(x => {
                x.should.have.lengthOf(1);
                x[0].email.should.equal('john@b3atl3s.co.uk');
            });
    });

}); 

function seed() {
    const beatles = [{
        name : 'John Lennon',
        email : 'john@b3atl3s.co.uk',
        role : 'lead',
        order : 2,
        bio: 'Foo bar',
        doc: { foo: 'bar' }
    }, {
        name : 'Paul McCartney',
        email : 'paul@b3atl3s.co.uk',
        role : 'lead',
        order : 1
    }, {
        name : 'George Harrison', order : 5
    }, {
        name : 'Ringo Starr', order : 6
    }, {
        name : 'Pete Best', order : 4
    }, {
        name : 'Stuart Sutcliffe', order : 3
    }];

    return UserData.destroyAll()
        .then(() => Promise.all(beatles.map(beatle => UserData.create(beatle))));
}

function setup(done) {
    require('./init.js');
    db = getSchema();
    done();
}

