var level = require('level');
var hdb = level('/tmp/log.db');
var idb = level('/tmp/index.db', { valueEncoding: 'json' });

var hyperlog = require('hyperlog');
var log = hyperlog(hdb, { valueEncoding: 'json' });

var indexer = require('../');
var dex = indexer(log, idb, function (row, tx, next) {
    tx.get('state', function (err, value) {
        tx.put('state', (value || 0) + row.value.n, next);
    });
});

if (process.argv[2] === 'add') {
    var n = Number(process.argv[3]);
    log.append({ n: n });
}
else if (process.argv[2] === 'show') {
    var tx = dex.transaction();
    tx.get('state', function (err, value) {
        console.log(value || 0);
    });
}
