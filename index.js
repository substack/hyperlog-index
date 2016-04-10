var through = require('through2')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter

module.exports = Ix
inherits(Ix, EventEmitter)

var SEQ = 'seq'

function Ix (opts) {
  if (!(this instanceof Ix)) return new Ix(opts)
  var self = this
  EventEmitter.call(self)

  self._change = -1
  self._latest = 0
  self._live = false
  self._pending = 0
  self.map = opts.map
  self.log = opts.log
  self.db = opts.db
  
  self.log.on('preadd', function (node) {
    self._pending++
  })
  self.log.on('add', function (node) {
    self._latest = Math.max(node.change, self._latest)
    if (--self._pending === 0) self.emit('_ready')
  })
  self.log.on('reject', function (node) {
    if (--self._pending === 0) self.emit('_ready')
  })
  self.db.get(SEQ, function (err, value) {
    self.log.ready(function () {
      self._change = Number(value || 0)
      var r = self.log.createReadStream({ since: value })
      r.on('error', function (err) { self.emit('error', err) })
      r.pipe(through.obj(write, end))
    })
  })

  function write (row, enc, next) {
    self._latest = Math.max(row.change, self._latest)
    self.emit('row', row)

    self.map(row, function (err) {
      if (err) return next(err)
      self.db.put(SEQ, String(row.change), function (err) {
        if (err) return next(err)
        self._change = row.change
        self.emit('change', self._change)
        next()
      })
    })
  }
  function end () {
    self._live = true
    self._latest = self._change
    self.emit('live')

    self.log.ready(function () {
      var r = self.log.createReadStream({
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
  } else if (self._pending > 0) {
    self.once('_ready', function () { self.ready(fn) })
  } else if (self._latest !== self._change) {
    self.once('change', function () { self.ready(fn) })
  } else fn()
}
