var level = require('level');
var through = require('through2');

var hdb = level('/tmp/log.db');
var idb = level('/tmp/index.db', { valueEncoding: 'json' });

var hyperlog = require('hyperlog');
var log = hyperlog(hdb);

var sub = require('subleveldown');
var indexer = require('../');

var sdb = indexer(log, sub(idb, 'sum'), function (row, db, next) {
    db.get('state', function (err, value) {
        db.put('state', (value || 0) + row.value.n, next);
    });
});

if (process.argv[2] === 'put') {
    var n = Number(process.argv[3]);
    log.append(JSON.stringify({ n: n }));
}
else {
    sdb.get('state', function (err, value) {
        console.log(value || 0);
    });
}
