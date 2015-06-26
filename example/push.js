var level = require('level');
var through = require('through2');

var db = level('/tmp/log.db');
var idb = level('/tmp/index.db');

var hyperlog = require('hyperlog');
var log = hyperlog(db);

//var indexer = require('../');
//var ix = indexer(log, idb);

var sub = require('subleveldown');
var sum = sub(idb, 'sum');

sum.get('change', function (err, ch) {
    if (err && err.type === 'NotFoundError') {
        ch = 0; // initial value
    }
    else if (err) return console.error(err.stack);
    else ch = Number(ch);
console.log('ch=', ch, typeof ch); 
    
    var s = log.createReadStream({ since: ch });
    s.pipe(through.obj(write, end));
    s.on('error', function (err) {
        console.log('err=', err);
    });
    
    function write (row, enc, next) {
console.log('ROW=', row); 
        var doc = JSON.parse(row.value);
console.log('DOC=', doc); 
        sum.get('state', function (err, value) {
console.log('VALUE=', value); 
            var value = JSON.parse(value || '0');
            var nvalue = JSON.stringify(value + doc.n);
            sum.batch([
                {
                    type: 'put',
                    key: 'state',
                    value: nvalue
                },
                {
                    type: 'put',
                    key: 'change',
                    value: String(row.change)
                }
            ], next);
        });
    }
    
    function end () {
        sum.get('state', function (err, value) {
            console.log('value=', value);
        });
    }
});

var doc = JSON.stringify({ n: Number(process.argv[2]) });
log.append(doc, function (err) {
    //if (err) return console.error(err.stack);
});
