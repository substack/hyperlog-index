var memdb = require('memdb');
var indexer = require('../');
var test = require('tape');

test('from scratch indexes', function (t) {
    var hdb = memdb();
    var idb = memdb({ valueEncoding: 'json' });
    
    var hyperlog = require('hyperlog');
    var log = hyperlog(hdb, { valueEncoding: 'json' });
    
    var dex = indexer(log, idb, function (row, tx, next) {
        tx.get('state', function (err, value) {
            tx.put('state', (value || 0) + row.value.n, next);
        });
    });
    log.append({ n: 3 });
    log.append({ n: 4 });
    log.append({ n: 100 });
    
    var tx = dex.transaction();
    tx.get('state', function (err, value) {
        t.ifError(err);
        t.equal(value, 107);
        tx.close();
    });
});
