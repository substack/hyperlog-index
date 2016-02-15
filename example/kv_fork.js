var memdb = require('memdb')
var indexer = require('../')
var hyperlog = require('hyperlog')

var db = memdb({ valueEncoding: 'json' })
var log = hyperlog(memdb(), { valueEncoding: 'json' })

var dex = indexer({
  log: log,
  db: db,
  map: function (row, next) {
    db.get(row.value.k, function (err, doc) {
      if (!doc) doc = {}
      row.links.forEach(function (link) {
        delete doc[link]
      })
      doc[row.key] = row.value.v
      db.put(row.value.k, doc, next)
    })
  }
})

log.add(null, { k: 'a', v: 3 }, function (err, node0) {
  log.add([node0.key], { k: 'a', v: 4 }, function (err, node1) {
    log.add([node1.key], { k: 'a', v: 8 }, function (err, node2) {
      log.add([node0.key], { k: 'a', v: 15 })
    })
  })
})

dex.ready(function () {
  db.get('a', function (err, values) {
    console.log('VALUES=', values)
  })
})
