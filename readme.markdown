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
  log.heads(function (err, heads) {
    heads.forEach(onhead);
  });
  function onhead (head) {
    var tx = dex.transaction(head.key);
    tx.get('state', function (err, value) {
      console.log(value || 0);
      tx.close();
    });
  }
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

## forking example

If there are forks in the data set, the indexes are forked along with the data.

For example, if we create a forked data set:

``` js
var memdb = require('memdb');
var indexer = require('hyperlog-index');
var hyperlog = require('hyperlog');

var hdb = memdb();
var idb = memdb({ valueEncoding: 'json' });
var log = hyperlog(hdb, { valueEncoding: 'json' });

var dex = indexer(log, idb, function (row, tx, next) {
  tx.get('sum', function (err, value) {
    tx.put('sum', (value || 0) + row.value.n, next);
  });
});

log.add(null, { n: 3 }, function (err, node0) {
  log.add([node0.key], { n: 4 }, function (err, node1) {
    log.add([node1.key], { n: 100 }, function (err, node2) {
      log.add([node0.key], { n: 101 }, ready);
    });
  });
});

function ready () {
  log.heads().on('data', function (head) {
    var tx = dex.transaction(head.key);
    tx.get('sum', function (err, value) {
      console.log(head.key, 'VALUE=', value);
      tx.close();
    });
  });
}
```

There will be 2 separate index results for each head:

```
$ node fork.js 
76bf45fa113a16580478e530542a356324841cb8bd230956bf1fd420d0f35e00 VALUE= 107
e562c405b73e3c027487d9121df2f50478db5f9565f805e7bce75f9996b6c9ea VALUE= 104
```

If we merge this data later:

``` js
log.add([ node2.key, node3.key ], { n: 500 }, ready);
```

Because our data is commutative the indexes will automatically converge without
handling merging explicitly in the indexes:

```
$ node merge.js 
313f00da58ba48535f1a284a1e7735692c2f107479af2eda93670b5316efec54 VALUE= 607
```

For more complicated scenarios, you might want to include extra information in
the update for the index function to resolve the merge.

# api

``` js
var indexer = require('hyperlog-index')
```

## var dex = indexer(log, db, fn)

Create a new hyperlog index instance `dex` from a hyperlog `log`, a levelup or
sublevel database `db`, and an indexing function `fn`.

You can have as many indexes as you like on the same log, just create more `dex`
instances on sublevels.

## var tx = dex.transaction(head)

Create a transaction `tx` for the indexes at the string `head` once they've
fully "caught up".

`tx` behaves like a levelup handle except it has `.commit()` and `.rollback()`
methods.

At this time `tx.createReadStream()` will not output values in the current
transaction, only values that have been previously committed. This may change
in the future if level-transaction adds support for range locking.

## dex.ready(fn)

`fn()` fires when the indexes are "caught up" or on the next tick if the indexes
have processed all of the log.

## dex.resume()

Resume the indexes after an error.

## dex.on('error', function (err) {})

If the underlying system generates an error, you can catch it here.

# install

With [npm](https://npmjs.org) do:

```
npm install hyperlog-index
```

# license

MIT
