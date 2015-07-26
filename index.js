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
  this._pending = 1;
  log.on('preadd', function () {
    self._pending ++
  });
  var r = log.createReadStream();
  r.pipe(through.obj(write, end));
  
  function write (row, enc, next) {
    self._pending ++;
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
          next();
          self._finish(2);
        })
      });
    }
  }
  function end () {
    log.createReadStream({
      live: true,
      since: self._change
    }).pipe(through.obj(write));
    self._finish(1);
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
  if (this._pending === 0) fn()
  else this.once('ready', fn)
};

Ix.prototype._finish = function (n) {
  var self = this;
  process.nextTick(function () {
    self._pending -= n;
    if (self._pending === 0) {
      self.emit('ready');
    }
  });
};
