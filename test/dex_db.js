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
  log.append({ n: 3 });
  log.append({ n: 4 });
  log.append({ n: 100 });
  
  var n = 0;
  log.on('add', function () {
    if (++n !== 3) return;
    log.heads(function (err, heads) {
      t.ifError(err);
      var tx = dex.transaction(heads[0].key);
      tx.get('state', function (err, value) {
        t.ifError(err);
        t.equal(value, 107);
        tx.close();
      });
    });
  });
});
