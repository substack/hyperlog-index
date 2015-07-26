# hyperlog-index

transactional indexes for [hyperlog](https://npmjs.com/package/hyperlog)

# example

``` js
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
