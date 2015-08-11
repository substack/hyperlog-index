var Forks = require('level-forks');
var through = require('through2');
var transaction = require('level-transactions');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Deferred = require('deferred-leveldown');
var levelup = require('levelup');
var xtend = require('xtend');
var sub = require('subleveldown');

module.exports = Ix;
inherits(Ix, EventEmitter);

function Ix (log, db, fn) {
  if (!(this instanceof Ix)) return new Ix(log, db, fn);
  EventEmitter.call(this);
  var self = this;
  this.forks = Forks(db, db.options);
  this._options = db.options;
  this._pending = 1;
  this._expected = 0;
  this._change = -1;
  this._log = log;
  this._added = {};
  
  log.on('add', function (node) {
    if (node) {
      self._pending ++;
      self._added[node.key] = (self._added[node.key] || 0) + 1;
    }
  });
  log.on('preadd', function (node) {
    if (node) {
      self._pending ++
      self._added[node.key] = (self._added[node.key] || 0) + 1;
    }
  });
  db.get('xc', function (err, value) {
    log.ready(function () {
      self._change = value;
      var r = log.createReadStream({ since: value });
      r.on('error', function (err) { self.emit('error', err) });
      r.pipe(through.obj(write, end));
    });
  });
  
  function write (row, enc, next) {
    self._pending ++;
    self.forks.create(
      row.key,
      row.links,
      { valueEncoding: 'json', prebatch: prebatch },
      oncreate
    );
    function prebatch (ops, cb) {
      cb(null, ops.concat(
        { type: 'put', key: 'xc', value: row.change }
      ));
    }
    
    function oncreate (err, c) {
      if (err) return next(err);
      
      var tx = transaction(c, db.options);
      tx.createReadStream = c.createReadStream.bind(c);
      fn(row, tx, function (err) {
        if (err) next(err)
        else tx.commit(function (err) {
          if (err) return next(err)
          self._change = row.change;
          self.emit('change', self._change);
          
          next();
          self._finish(1 + (self._added[row.key] || 0));
          delete self._added[row.key];
        })
      });
    }
  }
  function end () {
    log.ready(function () {
      var r = log.createReadStream({
        live: true,
        since: self._change
      });
      r.pipe(through.obj(write));
      r.on('error', function (err) { self.emit('error', err) });
      self._finish(1);
    });
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
  tx.createReadStream = up.createReadStream.bind(up);
  tx.close = function () { tx.rollback() };
  
  self.ready(function () {
    var db = self.forks.open(seq);
    def.setDb(db.db || db);
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
