var level = require('level');
var through = require('through2');

var hdb = level('/tmp/log.db');
var idb = level('/tmp/index.db', { valueEncoding: 'json' });

var hyperlog = require('hyperlog');
var log = hyperlog(hdb);

var sub = require('subleveldown');
var indexer = require('../');

indexer(log, sub(idb, 'sub'), function (row, db, next) {
    db.get('state', function (err, value) {
        if (process.argv[2] === 'put') {
            var n = Number(process.argv[3]);
            db.put('state', (value || 0) + n, next);
        }
        else {
            console.log(value || 0);
            next();
        }
    });
});
