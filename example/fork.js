var memdb = require('memdb');
var indexer = require('../');
var hyperlog = require('hyperlog');

var hdb = memdb();
var idb = memdb({ valueEncoding: 'json' });
var log = hyperlog(hdb, { valueEncoding: 'json' });

var dex = indexer(log, idb, function (row, tx, next) {
  tx.get('sum', function (err, value) {
    tx.put('sum', (value || 0) + row.value.n, next);
  });
});

log.add(null, { n: 3 }, function (err, node0) {
  log.add([node0.key], { n: 4 }, function (err, node1) {
    log.add([node1.key], { n: 100 }, function (err, node2) {
      log.add([node0.key], { n: 101 }, ready);
    });
  });
});

function ready () {
  log.heads().on('data', function (head) {
    var tx = dex.transaction(head.key);
    tx.get('sum', function (err, value) {
      console.log(head.key, 'VALUE=', value);
      tx.close();
    });
  });
}
