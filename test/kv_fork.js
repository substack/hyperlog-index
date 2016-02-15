var memdb = require('memdb')
var indexer = require('../')
var hyperlog = require('hyperlog')
var test = require('tape')

var db = memdb({ valueEncoding: 'json' })
var log = hyperlog(memdb(), { valueEncoding: 'json' })

test('kv fork', function (t) {
  t.plan(8)
  var dex = indexer({
    log: log,
    db: db,
    map: map
  })
  function map (row, next) {
    db.get(row.value.k, function (err, doc) {
      if (!doc) doc = {}
      row.links.forEach(function (link) {
        delete doc[link]
      })
      doc[row.key] = row.value.v
      db.put(row.value.k, doc, next)
    })
  }

  var nodes = []
  log.add(null, { k: 'a', v: 3 }, function (err, node0) {
    t.ifError(err)
    nodes.push(node0)
    log.add([node0.key], { k: 'a', v: 4 }, function (err, node1) {
      t.ifError(err)
      nodes.push(node1)
      log.add([node1.key], { k: 'a', v: 8 }, function (err, node2) {
        t.ifError(err)
        nodes.push(node2)
        log.add([node0.key], { k: 'a', v: 15 }, function (err, node3) {
          t.ifError(err)
          nodes.push(node3)
        })
      })
    })
  })

  dex.ready(function () {
    db.get('a', function (err, values) {
      var expected = {}
      expected[nodes[3].key] = 15
      expected[nodes[2].key] = 8
      t.deepEqual(values, expected, 'expected fork values')
      merge()
    })
  })

  function merge () {
    log.add([nodes[2].key,nodes[3].key], { k: 'a', v: 100 },
    function (err, node4) {
      t.ifError(err)
      nodes.push(node4)
    })
    dex.ready(function () {
      db.get('a', function (err, values) {
        t.ifError(err)
        var expected = {}
        expected[nodes[4].key] = 100
        t.deepEqual(values, expected, 'expected merge values')
      })
    })
  }
})
