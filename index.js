var Forks = require('level-forks');
var through = require('through2');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Deferred = require('deferred-leveldown');
var levelup = require('levelup');
var xtend = require('xtend');
var sub = require('subleveldown');
var isarray = require('isarray');
var once = require('once');

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
  this._db = db;
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
        { type: 'put', key: 'xc', value: row.change },
        { type: 'put', key: 'xe!' + row.key, value: 0 }
      ));
    }
    
    function oncreate (err, c) {
      if (err) return next(err);
      fn(row, c, function (err) {
        if (err) next(err)
        self._change = row.change;
        self.emit('change', self._change)
        self.emit('row', row);
        next();
        self._finish(1 + (self._added[row.key] || 0));
        delete self._added[row.key];
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

Ix.prototype.open = function (seq, opts) {
  var self = this;
  if (seq && typeof seq === 'object' && seq.key) seq = seq.key;
  
  var def = new Deferred;
  var up = levelup('fake', xtend(
    xtend(self._options, opts),
    { db: function () { return def } }
  ));
  
  self.ready(seq, function () {
    var db = self.forks.open(seq);
    def.setDb(db.db || db);
  });
  return up;
};

Ix.prototype.ready = function (seq, fn) {
  var self = this;
  if (typeof seq !== 'function' && !isarray(seq)) seq = [seq];
  if (seq && (seq.length === 0 || typeof seq === 'function')) {
    if (typeof seq === 'function') fn = seq;
    if (self._pending === 0) fn()
    else self.once('ready', fn)
    return;
  }
  
  var pending = seq.length + 1;
  fn = once(fn || function () {});
  
  seq.forEach(function (hash) {
    self._exists(hash, function (err, ex) {
      if (err) return fn(err);
      if (ex) return done();
      
      self.on('row', function f (row) {
        if (row.key !== hash) return;
        self.removeListener('row', f);
        done();
      });
    })
  })
  done()
  
  function done () {
    if (-- pending === 0) fn(null);
  }
};

Ix.prototype._exists = function (seq, cb) {
  this._db.get('xe!' + seq, function (err) {
    if (notFound(err)) cb(null, false)
    else if (err) cb(err)
    else cb(null, true)
  });
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

function notFound (err) {
  return err && (err.notFound || /notfound/i.test(err.message));
}
