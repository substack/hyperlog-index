var memdb = require('memdb')
var indexer = require('../')
var hyperlog = require('hyperlog')
var concestor = require('hyperlog-concestor')
var sub = require('subleveldown')
var once = require('once')
var test = require('tape')

test('adder', function (t) {
  t.plan(10)
  var db = memdb({ valueEncoding: 'json' })
  var log = hyperlog(sub(db, 'l'), { valueEncoding: 'json' })

  var dex = indexer(log, sub(db, 'i'), function (row, next) {
    if (row.links.length === 0) {
      db.put('sum!' + row.key, row.value.n, next)
    } else if (row.links.length === 1) {
      db.get('sum!' + row.links[0], function (err, value) {
        db.put('sum!' + row.key, value + row.value.n, next)
      })
    } else {
      concestor(log, row.links, function f (err, cons) {
        if (err) next(err)
        else if (cons.length > 1) {
          concestor(log, cons, f) // could be wrong
        } else if (cons.length === 0) { // disjoint
          getSums(row.links, function (err, sums) {
            if (err) return next(err)
            db.put('sum!' + row.key, sums.reduce(add, 0), next)
          })
        } else {
          getSums(cons.concat(row.links), function (err, sums) {
            if (err) return next(err)
            var sum = sums[1] + row.value.n
            for (var i = 2; i < sums.length; i++) {
              sum += sums[i] - sums[0]
            }
            db.put('sum!' + row.key, sum, next)
          })
        }
      })
    }
  })
  dex.on('error', t.fail.bind(t))

  log.add(null, { n: 3 }, function (err, node0) {
    t.ifError(err)
    log.add([node0.key], { n: 4 }, function (err, node1) {
      t.ifError(err)
      log.add([node1.key], { n: 100 }, function (err, node2) {
        t.ifError(err)
        log.add([node0.key], { n: 101 }, function (err, node3) {
          t.ifError(err)
          test1(function () {
            log.add([ node2.key, node3.key ], { n: 500 }, function (err) {
              t.ifError(err)
              test2()
            })
          })
        })
      })
    })
  })

  function test1 (cb) {
    var pending = 2
    var values = []
    dex.ready(function () {
      log.heads().on('data', onhead)
    })
    function onhead (head) {
      db.get('sum!' + head.key, function (err, value) {
        t.ifError(err)
        values.push(value)
        if (--pending === 0) done()
      })
    }
    function done () {
      t.deepEqual(values.sort(), [104,107], 'forked values')
      if (cb) cb()
    }
  }
  function test2 (cb) {
    dex.ready(function () {
      log.heads().on('data', onhead)
    })
    function onhead (head) {
      db.get('sum!' + head.key, function (err, value) {
        t.ifError(err)
        t.equal(value, 708, 'merged value')
        if (cb) cb()
      })
    }
  }

  function getSums (keys, cb) {
    cb = once(cb)
    var pending = keys.length, sums = []
    keys.forEach(function (key) {
      db.get('sum!' + key, function (err, sum) {
        if (err) return cb(err)
        sums.push(sum)
        if (--pending === 0) cb(null, sums)
      })
    })
  }
})

function add (a, b) { return a + b }
