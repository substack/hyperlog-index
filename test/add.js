var memdb = require('memdb');
var indexer = require('../');
var hyperlog = require('hyperlog');
var test = require('tape');

test('add', function (t) {
  t.plan(5);
  var hdb = memdb();
  var idb = memdb({ valueEncoding: 'json' });
  var log = hyperlog(hdb, { valueEncoding: 'json' });
  
  var dex = indexer(log, idb, function (row, tx, next) {
    tx.get('state', function (err, value) {
      tx.put('state', (value || 0) + row.value.n, next);
    });
  });
  log.add(null, { n:3 }, function (err, node0) {
    t.ifError(err);
    log.add([node0.key], { n: 4 }, function (err, node1) {
      t.ifError(err);
      log.add([node1.key], { n: 100 }, function (err, node2) {
        t.ifError(err);
        ready();
      });
    });
  });
    
    function ready () {
      log.heads(function (err, heads) {
        heads.forEach(onhead);
      });
    }
    
    function onhead (head) {
      var tx = dex.transaction(head.key);
      tx.get('state', function (err, value) {
        t.ifError(err);
        t.equal(value, 107);
        tx.close();
      });
    }
});
