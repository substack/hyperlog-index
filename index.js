var through = require('through2');
var sub = require('subleveldown');
var transaction = require('level-transactions');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Proxy = require('level-proxy');

inherits(Dex, EventEmitter);
module.exports = Dex;

function Dex (log, db, fn) {
    if (!(this instanceof Dex)) return new Dex(log, db, fn);
    EventEmitter.call(this);
    var self = this;
    
    this._db = db;
    this._xdb = sub(db, 'x', db.options);
    this._log = log;
    this._fn = fn;
    this._change = null;
    this._state = 'stale';
    process.nextTick(function () { self.resume() });
}

Dex.prototype.transaction = function (opts) {
    var self = this;
    var prox = Proxy();
    this.ready(function () {
        prox.swap(transaction(self._xdb, opts));
    });
    return prox;
};

Dex.prototype.ready = function (fn) {
    if (this._state === 'live') {
        process.nextTick(fn);
    }
    else this.once('ready', fn)
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
        var tx = transaction(self._db);
        self._fn(row, self._xdb, function (err) {
            if (err) return self.emit('error', err);
            self._change = row.change;
            tx.put('change', row.change, { valueEncoding: 'json' }, onput);
        });
        function onput (err) {
            if (err) return self.emit('error', err)
            tx.commit(function (err) {
                if (err) self.emit('error', err)
                else next()
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
