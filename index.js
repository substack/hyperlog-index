var through = require('through2');
var sub = require('subleveldown');
var transaction = require('level-transactions');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Proxy = require('level-proxy');
var cow = require('level-cowdown');
var once = require('once');
var xtend = require('xtend');
var levelup = require('levelup');

inherits(Dex, EventEmitter);
module.exports = Dex;

function Dex (log, db, fn) {
    if (!(this instanceof Dex)) return new Dex(log, db, fn);
    EventEmitter.call(this);
    var self = this;
    this._db = db;
    this._xdb = sub(db, 'x', db.options);
    this._vdb = sub(db, 'v', db.options);
    this._log = log;
    this._fn = fn;
    this._change = null;
    this._state = 'stale';
    process.nextTick(function () { self.resume() });
}

Dex.prototype.transaction = function (head, opts) {
    var self = this;
    var prox = Proxy();
    var tx;
    prox.commit = function () { prox._proxyMethod('commit', arguments) };
    prox.rollback = function () { prox._proxyMethod('rollback', arguments) };
    prox.close = function () { prox._proxyMethod('rollback', arguments) };
    
    self.ready(function () {
        var tx = transaction(self._xdb, opts);
        prox.swap(tx);
    });
    return prox;
};

Dex.prototype.ready = function (fn) {
    var self = this;
    if (self._state === 'live') {
        process.nextTick(function () {
            if (self._state === 'live') fn()
            else self.once('ready', fn)
        });
    }
    else self.once('ready', fn)
};

Dex.prototype.resume = function () {
    var self = this;
    self._db.get('change', { valueEncoding: 'json' }, function (err, ch) {
        if (err && err.type === 'NotFoundError') {
            ch = 0; // initial value
        }
        else if (err) return self.emit('error', err);
        
        self._change = ch;
        var s = self._log.createReadStream({ since: ch });
        s.pipe(through.obj(write, end));
        s.on('error', function (err) { self.emit('error', err) });
    });
    
    function write (row, enc, next) {
        next = once(next);
        var prevstate = self._state;
        self._state = 'processing';
        
        var pending = 1;
        var from = [];
        row.links.forEach(function (link) {
            pending ++;
            self._vdb.get(link, function (err, value) {
                if (err && err.type === 'NotFoundError') {
                    value = 0;
                }
                else if (err) return next(err);
                if (value) from.push(link);
                self._vdb.put(link, value + 1, function (err) {
                    if (-- pending === 0) run();
                });
            });
        });
        if (-- pending === 0) run();
        
        function run () {
            /*
console.log('from:', from); 
            var tx;
            if (from.length === 0) {
                tx = transaction(self._db);
            }
            else if (from.length === 1) {
                tx = transaction(levelup('fake', xtend(self._db.options, {
                    db: function () {
                        return cow(sub(self._db, from[0]), sub(self._db, row.key));
                    }
                })));
            }
            else {
                self.emit('error', new Error(
                    'from length > 1 not yet supported'));
            }
            */
            var tx = transaction(levelup('fake', xtend(self._db.options, {
                db: function () {
                    return cow(
                        row.links.length
                            ? sub(self._db, row.links[0])
                            : self._xdb
                        ,
                        sub(self._db, row.key)
                    );
                }
            })));
            
            self._fn(row, tx, function (err) {
                if (err) return self.emit('error', err);
                self._change = row.change;
                tx.put('change', row.change, { valueEncoding: 'json' },
                function (err) {
                    if (err) return self.emit('error', err);
                    onput(tx);
                });
            });
        }
        function onput (tx) {
            tx.commit(function (err) {
                if (err) return self.emit('error', err)
                self._state = prevstate;
                if (prevstate === 'live') {
                    self.emit('ready');
                }
                next();
            });
        }
    }
    
    function end () {
        var s = self._log.createReadStream({
            since: self._change,
            live: true
        });
        s.pipe(through.obj(write));
        self._state = 'live';
        self.emit('ready');
    }
};
