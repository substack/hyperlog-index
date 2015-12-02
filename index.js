var through = require('through2')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var defaults = require('levelup-defaults')

module.exports = Ix
inherits(Ix, EventEmitter)

var SEQ = 'seq'

function Ix (log, db, fn) {
  if (!(this instanceof Ix)) return new Ix(log, db, fn)
  EventEmitter.call(this)
  db = defaults(db, { valueEncoding: 'json' })
  var self = this
  this._change = -1
  this._db = db
  this._latest = 0
  this._live = false
  this._pending = 0
  
  log.on('preadd', function (node) {
    self._pending++
  })
  log.on('add', function (node) {
    self._latest = Math.max(node.change, self._latest)
    self._pending--
  })
  db.get(SEQ, function (err, value) {
    log.ready(function () {
      self._change = value
      var r = log.createReadStream({ since: value })
      r.on('error', function (err) { self.emit('error', err) })
      r.pipe(through.obj(write, end))
    })
  })

  function write (row, enc, next) {
    self._latest = Math.max(row.change, self._latest)
    self.emit('row', row)

    fn(row, function (err) {
      if (err) return next(err)
      db.put(SEQ, row.change, function (err) {
        if (err) return next(err)
        self._change = row.change
        self.emit('change', self._change)
        next()
      })
    })
  }
  function end () {
    self._live = true
    self.emit('live')

    log.ready(function () {
      var r = log.createReadStream({
        live: true,
        since: self._change
      })
      r.pipe(through.obj(write))
      r.on('error', function (err) { self.emit('error', err) })
    })
  }
}

Ix.prototype.ready = function (fn) {
  var self = this
  if (!self._live) {
    self.once('live', function () { self.ready(fn) })
  } else if (self._pending > 0 || self._latest !== self._change) {
    self.on('change', function f (ch) {
      if (self._latest === ch) {
        self.removeListener('change', f)
        fn()
      }
    })
  } else fn()
}
