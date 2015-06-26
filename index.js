var through = require('through2');
var sub = require('subleveldown');
var transaction = require('level-transactions');

module.exports = function (log, db, fn) {
    db.get('change', { valueEncoding: 'json' }, function (err, ch) {
        if (err && err.type === 'NotFoundError') {
            ch = 0; // initial value
        }
        else if (err) {} // ???
        
        var s = log.createReadStream({ since: ch, live: true });
        s.pipe(through.obj(write, end));
        //s.on('error', ???);
    });
    var xdb = sub(db, 'x');
    return xdb;
    
    function write (row, enc, next) {
        var tx = transaction(db);
        fn(row, xdb, function (err) {
            if (err) return //???
            
            tx.put('change', row.change, { valueEncoding: 'json' },
            function (err) {
                if (err) return //???
                tx.commit(function (err) {
                    if (err) return //???
                });
            });
        });
    }
    
    function end () {
        sum.get('state', function (err, value) {
            console.log('value=', value);
        });
    }
};
