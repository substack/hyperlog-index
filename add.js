var level = require('level')
var hyperlog = require('hyperlog')
var sub = require('subleveldown')
var through = require('through2')
var EventEmitter = require('events').EventEmitter

var db = level('/tmp/log.db', { valueEncoding: 'json' })
var log = hyperlog(sub(db, 'l'), { valueEncoding: 'json' })

var pending = 1
var ev = new EventEmitter

db.get('seq', function (err, seq) {
  log.createReadStream({ since: seq })
    .pipe(through.obj(write, end))

  function write (row, enc, next) {
    pending++
    db.get('sum', function (err, sum) {
      db.batch([
        { type: 'put', key: 'seq', value: row.seq },
        { type: 'put', key: 'sum', value: (sum || 0) + row.value }
      ], function (err) {
        if (--pending === 0) ev.emit('ready')
        next(err)
      })
    })
  }

  function end () {
    if (--pending === 0) ev.emit('ready')
  }
})

function get (f) {
  if (pending !== 0) return ev.once('ready', function () { get(f) })
  db.get('sum', f)
}

if (process.argv[2] === 'add') {
  log.append(Number(process.argv[3]))
} else if (process.argv[2] === 'show') {
  get(function (err, sum) {
    console.log(sum || 0)
  })
}
