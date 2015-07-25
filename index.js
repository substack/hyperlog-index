var Forks = require('level-forks');
var through = require('through2');
var transaction = require('level-transactions');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Deferred = require('deferred-leveldown');
var levelup = require('levelup');
var xtend = require('xtend');

module.exports = Ix;
inherits(Ix, EventEmitter);

function Ix (log, db, fn) {
  if (!(this instanceof Ix)) return new Ix(log, db, fn);
  EventEmitter.call(this);
  var self = this;
  this.forks = Forks(db, db.options);
  this._options = db.options;
  this._state = 'stale';
  this._pending = 0;
  log.on('add', function () { self._pending ++ });
  var r = log.createReadStream();
  r.pipe(through.obj(write, end));
  
  function write (row, enc, next) {
    var prevstate = self._state;
    self._state = 'processing';
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
        else tx.commit(function (err) {
          if (err) return next(err)
          self._change = row.change;
          self._state = prevstate;
          if (--self._pending === 0 && prevstate === 'live') {
            self.emit('ready')
          }
          next();
        })
      });
    }
  }
  function end () {
    log.createReadStream({
      live: true,
      since: self._change
    }).pipe(through.obj(write));
    self._state = 'live';
    self.emit('ready');
  }
}

Ix.prototype.transaction = function (seq, opts) {
  var self = this;
  if (seq && typeof seq === 'object' && seq.key) seq = seq.key;
  
  var def = new Deferred;
  var up = levelup('fake', xtend(
    xtend(self._options, opts),
    { db: function () { return def } }
  ));
  var tx = transaction(up);
  tx.close = function () { tx.rollback() };
  
  self.ready(function () {
    def.setDb(self.forks.open(seq));
  });
  return tx;
};

Ix.prototype.ready = function (fn) {
  var self = this;
  if (self._state === 'live' && self._pending === 0) {
    process.nextTick(function () {
      if (self._state === 'live') fn()
      else self.once('ready', fn)
    });
  }
  else self.once('ready', fn)
};
