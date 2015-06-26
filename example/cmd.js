var level = require('level');
var through = require('through2');

var hdb = level('/tmp/log.db');
var idb = level('/tmp/index.db');

var hyperlog = require('hyperlog');
var log = hyperlog(hdb, { valueEncoding: 'json' });

var sub = require('subleveldown');
var indexer = require('../');

var sdb = sub(idb, 'sum', { valueEncoding: 'json' });
var xdb = indexer(log, sdb, function (row, db, next) {
    db.get('state', function (err, value) {
        db.put('state', (value || 0) + row.value.n, next);
    });
});

if (process.argv[2] === 'add') {
    var n = Number(process.argv[3]);
    log.append({ n: n });
}
else if (process.argv[2] === 'show') {
    xdb.get('state', function (err, value) {
        console.log(value || 0);
    });
}
