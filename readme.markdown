# hyperlog-index

forking indexes for [hyperlog](https://npmjs.com/package/hyperlog)

# example

## forking key/value store

Using hyperlog-index, we can easily build a key/value store backed to a hyperlog
that implements a [multi-value register conflict strategy](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#Others):

``` js
var level = require('level')
var indexer = require('hyperlog-index')
var hyperlog = require('hyperlog')
var sub = require('subleveldown')
var mkdirp = require('mkdirp')

var minimist = require('minimist')
var argv = minimist(process.argv.slice(2), {
  default: { d: '/tmp/kv.db' }
})
mkdirp.sync(argv.d)

var hdb = level(argv.d + '/h')
var idb = level(argv.d + '/i')
var log = hyperlog(hdb, { valueEncoding: 'json' })
var db = sub(idb, 'x', { valueEncoding: 'json' })

var dex = indexer(log, sub(idb, 'i'), function (row, next) {
  db.get(row.value.k, function (err, doc) {
    if (!doc) doc = {}
    row.links.forEach(function (link) {
      delete doc[link]
    })
    doc[row.key] = row.value.v
    db.put(row.value.k, doc, next)
  })
})

if (argv._[0] === 'get') {
  dex.ready(function () {
    db.get(argv._[1], function (err, values) {
      if (err) console.error(err)
      else console.log(values)
    })
  })
} else if (argv._[0] === 'put') {
  var doc = { k: argv._[1], v: argv._[2] }
  dex.ready(function () {
    db.get(doc.k, function (err, values) {
      log.add(Object.keys(values || {}), doc, function (err, node) {
        if (err) console.error(err)
      })
    })
  })
} else if (argv._[0] === 'sync') {
  var r = log.replicate()
  process.stdin.pipe(r).pipe(process.stdout)
  r.on('end', function () { process.stdin.pause() })
}
```

Each key maps to an object of hashes to values:

```
$ node kv.js -d /tmp/db1 put A beep
$ node kv.js -d /tmp/db1 put A boop
$ node kv.js -d /tmp/db1 get A
{ '06e4130fc5f2392cb8bdb065d18eaa523d716f2c61b4877853340a5cc727fb42': 'boop' }
```

Meanwhile, a second database may have additional edits:

```
$ node kv.js -d /tmp/db2 put A whatever
$ node kv.js -d /tmp/db2 put B hey
```

When these two databases are merged together, the key at `A` has two values:

```
$ dupsh 'node kv.js -d /tmp/db1 sync' 'node kv.js -d /tmp/db2 sync'
$ node kv.js -d /tmp/db1 get A
{ '06e4130fc5f2392cb8bdb065d18eaa523d716f2c61b4877853340a5cc727fb42': 'boop',
  cba756b45e279ae5c3f3ebc8cfe0d50e1f2205e37a4443ce9e0e5a41491c234c: 'whatever' }
```

The `B` key has only a single element:

```
$ node kv.js -d /tmp/db1 get B
{ '53a374617fb8839b6f19646d6658188a4fc08d19f35c084dab835847532a3468': 'hey' }
```

New updates that link at both existing keys will merge into a single key:

```
$ node kv.js -d /tmp/db1 put A whatboop
$ node kv.js -d /tmp/db1 get A
{ '85915730b3e7a4f715057e74af79b564a5be2ec14d334d344cb84d1544ec6107': 'whatboop' }
```

and these merges can be communicated over replication:

```
$ dupsh 'node kv.js -d /tmp/db1 sync' 'node kv.js -d /tmp/db2 sync'
$ node kv.js -d /tmp/db2 get A
{ '85915730b3e7a4f715057e74af79b564a5be2ec14d334d344cb84d1544ec6107': 'whatboop' }
```

# api

``` js
var indexer = require('hyperlog-index')
```

## var dex = indexer(log, db, fn)

Create a new hyperlog index instance `dex` from a hyperlog `log`, a level
instance `db`, and an indexing function `fn`.

You can have as many indexes as you like on the same log, just create more `dex`
instances on sublevels.

## fn(row, next)

The indexing function `fn` runs for each `row`. The indexing function should
write its computed indexes to durable storage and call `next(err)` when it is
finished.

## dex.ready(fn)

`fn()` fires when the indexes have "caught up" to the latest known change in the
hyperlog.

## dex.on('error', function (err) {})

If the underlying system generates an error, you can catch it here.

# install

With [npm](https://npmjs.org) do:

```
npm install hyperlog-index
```

# license

MIT
