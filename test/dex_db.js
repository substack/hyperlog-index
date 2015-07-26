var level = require('level-test')();
var indexer = require('../');
var hyperlog = require('hyperlog');
var test = require('tape');

test('from scratch indexes', function (t) {
  t.plan(3);
  var hdb = level('h-' + Math.random());
  var idb = level('i-' + Math.random(), { valueEncoding: 'json' });
  var log = hyperlog(hdb, { valueEncoding: 'json' });
  
  var dex = indexer(log, idb, function (row, tx, next) {
    tx.get('state', function (err, value) {
      tx.put('state', (value || 0) + row.value.n, next);
    });
  });
  log.add(null, { n: 3 }, function (err, node0) {
    log.add(node0, { n: 4 }, function (err, node1) {
      log.add(node1, { n: 100 }, function (err, node2) {
        ready();
      });
    });
  });
  
  function ready () {
    log.heads(function (err, heads) {
      t.ifError(err);
      var tx = dex.transaction(heads[0].key);
      tx.get('state', function (err, value) {
        t.ifError(err);
        t.equal(value, 107);
        tx.close();
      });
    });
  }
});
