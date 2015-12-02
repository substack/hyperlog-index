var memdb = require('memdb')
var indexer = require('../')
var hyperlog = require('hyperlog')
var concestor = require('hyperlog-concestor')
var sub = require('subleveldown')

var db = memdb()
var idb = memdb({ valueEncoding: 'json' })
var log = hyperlog(db, { valueEncoding: 'json' })

var dex = indexer(log, idb, function (row, next) {
  if (row.links.length === 0) {
    db.put('sum!' + row.key, row.n, next)
  } else if (row.links.length === 1) {
    db.get('sum!' + row.links[0], function (err, value) {
      db.put('sum!' + row.key, value + row.n, next)
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
          var sum = sums[0] + sums[1]
          for (var i = 2; i < sums.length; i++) {
            sum += sums[i] - sums[0]
          }
          db.put('sum!' + row.key, sum, next)
        })
      }
    })
  }
})

log.add(null, { n: 3 }, function (err, node0) {
  log.add([node0.key], { n: 4 }, function (err, node1) {
    log.add([node1.key], { n: 100 }, function (err, node2) {
      log.add([node0.key], { n: 101 }, function (err, node3) {
        log.add([ node2.key, node3.key ], { n: 500 }, ready)
      })
    })
  })
})

function ready () {
  dex.ready(function () {
    log.heads().on('data', onhead)
  })
  function onhead (head) {
    db.get('sum!' + head.key, function (err, value) {
      console.log(head.key, 'VALUE=', value)
    })
  }
}

function getSums (keys, cb) {
  var pending = keys.length
}

function add (a, b) { return a + b }
