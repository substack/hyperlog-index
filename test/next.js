var memdb = require('memdb');
var indexer = require('../');
var test = require('tape');

var hdb = memdb();
var idb = memdb({ valueEncoding: 'json' });

var hyperlog = require('hyperlog');
var log = hyperlog(hdb, { valueEncoding: 'json' });
var dex;

test('populate next', function (t) {
    t.plan(2);
    dex = indexer(log, idb, function (row, tx, next) {
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
        var tx = dex.transaction();
        tx.get('state', function (err, value) {
            t.ifError(err);
            t.equal(value, 107);
            tx.close();
        });
    });
});

test('next', function (t) {
    t.plan(2);
    log.append({ n: 300 });
    
    var n = 0;
    log.on('add', function () {
        if (++n !== 1) return;
        setTimeout(check, 500);
    });
    
    function check () {
        var tx = dex.transaction();
        tx.get('state', function (err, value) {
            t.ifError(err);
            t.equal(value, 407);
            tx.close();
        });
    }
});
