# hyperlog-index

transactional indexes for [hyperlog](https://npmjs.com/package/hyperlog)

# example

``` js
var level = require('level');
var hdb = level('/tmp/log.db');
var idb = level('/tmp/index.db', { valueEncoding: 'json' });

var hyperlog = require('hyperlog');
var log = hyperlog(hdb, { valueEncoding: 'json' });

var indexer = require('hyperlog-index');
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
        tx.close();
    });
}
```

First we can write some data into the log and inspect the indexes:

```
$ node adder.js add 2
$ node adder.js add 3
$ node adder.js show
5
$ node adder.js add 100
$ node adder.js show
105
```

But if the indexes are destroyed or cleared to for new indexing logic, the
indexer picks up where it left off:

```
$ rm -rf /tmp/index.db
$ node adder.js show
105
$ node adder.js add 300
$ node adder.js show
405
```

We can also modify the indexing function with new logic and then clear the
existing indexes to see the new result:

``` js
var dex = indexer(log, idb, function (row, tx, next) {
    tx.get('state', function (err, value) {
        tx.put('state', (value || 1) * row.value.n, next);
    });
});
```

Now our adder is actually a multiplier. And now:

```
$ rm -rf /tmp/index.db
$ node adder.js show
180000
$ node adder.js add 2
$ node adder.js show
360000
```

We did all of this without modifying the underlying log. Hooray!

# license

MIT
