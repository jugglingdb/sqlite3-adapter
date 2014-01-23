var should = require('./init.js');
var Schema = require('jugglingdb').Schema;
var db, UserData;

describe('basic-query-sqlite', function () {
  before(setup);
  before(function (done) {
    db = getSchema();
    UserData = db.define('UserData', {
      name : String,
      email : String,
      role : String,
      order : Number
    });

    db.automigrate(done);
  });
  
  before(seed);
  
  it('should query collection using or operator', function (done) {
    UserData.all({
      where : {
        or : [{
          name : 'Paul McCartney'
        }, {
          name : 'John Lennon'
        }]
      }
    }, function (err, users) {
      should.exists(users);
      should.not.exists(err);
      users.should.have.lengthOf(2);
      users.forEach(function (u) {
        u.role.should.eql('lead');
      });
      done();
    });
  });
  
   it('should query collection using or operator on different fields', function (done) {
    UserData.all({
      where : {
        or : [{
          name : 'Not a User'
        }, {
          order : '5'
        }]
      }
    }, function (err, users) {
      should.exists(users);
      should.not.exists(err);
      users.should.have.lengthOf(1);
      users[0].order.should.eql(5);
      done();
    });
  });

  it('should query collection using or operator combined with and operator', function (done) {
    UserData.all({
      where : {
        name : 'Ringo Starr',
        or : [{
          role : 'lead'
        }, {
          order : '6'
        }]
      }
    }, function (err, users) {
      should.exists(users);
      should.not.exists(err);
      users.should.have.lengthOf(1);
      users[0].name.should.equal('Ringo Starr');
      done();
    });
  });
}); 
 
function seed(done) {
  var count = 0;
  var beatles = [{
    name : 'John Lennon',
    mail : 'john@b3atl3s.co.uk',
    role : 'lead',
    order : 2
  }, {
    name : 'Paul McCartney',
    mail : 'paul@b3atl3s.co.uk',
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
  UserData.destroyAll(function () {
    beatles.forEach(function (beatle) {
      UserData.create(beatle, ok);
    });
  });

  function ok(err) {
    if (++count === beatles.length) {
      done();
    }
  }
}

function setup(done) {
  require('./init.js');
  db = getSchema();
  done();
}