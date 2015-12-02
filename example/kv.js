var level = require('level')
var indexer = require('../')
var hyperlog = require('hyperlog')
var sub = require('subleveldown')

var minimist = require('minimist')
var argv = minimist(process.argv.slice(2), {
  default: { hdb: '/tmp/hdb', idb: '/tmp/idb' }
})

var hdb = level(argv.hdb)
var idb = level(argv.idb)
var log = hyperlog(hdb, { valueEncoding: 'json' })
var db = sub(idb, 'x', { valueEncoding: 'json' })

var dex = indexer(log, sub(idb, 'i'), function (row, next) {
  db.get(row.value.k, function (err, doc) {
    if (!doc) doc = {}
    row.links.forEach(function (link) {
      delete doc[link]
    })
    doc[row.key] = row.value.v
    db.put(row.value.k, doc, next)
  })
})

if (argv._[0] === 'get') {
  dex.ready(function () {
    db.get(argv._[1], function (err, values) {
      if (err) console.error(err)
      else console.log(values)
    })
  })
} else if (argv._[0] === 'put') {
  var doc = { k: argv._[1], v: argv._[2] }
  dex.ready(function () {
    db.get(doc.k, function (err, values) {
      log.add(Object.keys(values || {}), doc, function (err, node) {
        if (err) console.error(err)
        else console.log(node.key)
      })
    })
  })
} else if (argv._[0] === 'sync') {
  process.stdin.pipe(log.replicate()).pipe(process.stdout)
}
