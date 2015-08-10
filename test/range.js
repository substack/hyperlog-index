var memdb = require('memdb');
var indexer = require('../');
var hyperlog = require('hyperlog');
var test = require('tape');
var collect = require('collect-stream');

test('range', function (t) {
  t.plan(4);
  var hdb = memdb();
  var idb = memdb({ valueEncoding: 'json' });
  var log = hyperlog(hdb, { valueEncoding: 'json' });
  
  var dex = indexer(log, idb, function (row, tx, next) {
    tx.put('n!' + row.value.n, 0, next);
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
      collect(tx.createReadStream({
        gt: 'n!',
        lt: 'n!~'
      }), onrows)
      function onrows (err, rows) {
        t.deepEqual(rows.map(function (row) {
          return Number(row.key.split('!')[1]);
        }).sort(), [ 3, 4, 100 ])
      }
    }
});
