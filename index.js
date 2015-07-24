var Forks = require('level-forks');
var through = require('through2');
var transaction = require('level-transactions');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Deferred = require('deferred-leveldown');
var levelup = require('levelup');

module.exports = Ix;
inherits(Ix, EventEmitter);

function Ix (log, db, fn) {
  if (!(this instanceof Ix)) return new Ix(log, db, fn);
  EventEmitter.call(this);
  var self = this;
  this.forks = Forks(db);
  this._ready = false;
  var r = log.createReadStream();
  r.pipe(through.obj(write, end));
  
  function write (row, enc, next) {
    self.forks.create(
      row.key,
      row.links,
      { valueEncoding: 'json' },
      oncreate
    );
    function oncreate (err, c) {
      if (err) return next(err);
      var tx = transaction(c, db.options);
      fn(row, tx, function (err) {
        if (err) next(err)
        else tx.commit(next)
      });
    }
  }
  function end () {
    log.createReadStream({ live: true }).pipe(through.obj(write));
    self._ready = true;
    self.emit('ready');
  }
}

Ix.prototype.transaction = function (seq) {
  var self = this;
  if (!self._ready) {
    self.once('ready', function () {
      def.setDb(self.transaction(seq));
    });
    var def = new Deferred;
    return levelup('fake', { db: function () { return def } });
  }
  var tx = transaction(self.forks.open(seq));
  tx.close = function () { tx.rollback() };
  return tx;
};
