var memdb = require('memdb');
var indexer = require('../');
  var hyperlog = require('hyperlog');
var test = require('tape');

test('resume from prior state', function (t) {
  t.plan(4);
  var hdb = memdb();
  var idb = memdb({ valueEncoding: 'json' });
  
  var log = hyperlog(hdb, { valueEncoding: 'json' });
  log.append({ n: 3 });
  log.append({ n: 4 });
  log.append({ n: 100 });
  
  var n = 0;
  log.on('add', function () {
    if (++n !== 3) return;
    var dex = indexer(log, idb, function (row, tx, next) {
      tx.get('state', function (err, value) {
        tx.put('state', (value || 0) + row.value.n, next);
      });
    });
    log.heads(function (err, heads) {
      t.ifError(err);
      t.equal(heads.length, 1);
      var tx = dex.open(heads[0].key);
      tx.get('state', function (err, value) {
        t.ifError(err);
        t.equal(value, 107);
        tx.close();
      });
    });
  });
});
