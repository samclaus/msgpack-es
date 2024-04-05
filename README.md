`msgpack-es` is a modern ECMAScript (ES) implementation of the [MessagePack](https://msgpack.org) format, which is a binary format with similar functionality to JSON. MessagePack data is often much more _compact_ than equivalent JSON data, but you should note that modern `JSON.stringify()` and `JSON.parse()` implementations will likely be _faster_ than `msgpack-es` for typical data&mdash;**choose your trade-offs**! If, for example, you are sending a lot of JSON objects with large byte arrays as Base64-encoded strings, MessagePack will be substantially more compact than JSON, and `msgpack-es` might actually encode/decode faster than the built-in JSON functions.

- [Strengths](#strengths)
- [Weaknesses](#weaknesses)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Optimization](#optimization)

## Strengths

- **Tiny bundle size:** Less than **8KB** minified, less than **3KB** with GZIP! This library is also distributed as an ES6 module, so it can be even smaller if you use a bundler setup with tree-shaking and don't use all the functionality.
- **Memory-efficient:** `msgpack-es` avoids wasteful memory allocations at all costs. It exposes 
- **Bandwidth-efficient:** `msgpack-es` attempts to encode ES values using the smallest MessagePack equivalents. For example, if you try to encode the integer `5`, it will get encoded as a MessagePack `fixint`.
- **Easy-to-use and understand:** `msgpack-es` exposes a tiny API (5 functions, 1 small class, and 1 global options object). The source code is just a few TypeScript files, the longest of which is about 400 lines. It doesn't use mixins, function-currying, or any other "neat" tricks which can hurt runtime performance and readability.
- **Public-domain and honest:** `msgpack-es` is completely licensed to the public domain (read the license file) and does not make any hype-y marketing claims. It is a great 85% solution, and you can easily copy and modify the code if you have a niche use-case for MessagePack and want to optimize for your needs.

## Weaknesses

- **Depends on** `TextEncoder`, `TextDecoder`, `Uint8Array`, and `DataView` APIs. These APIs allow the library to be small _and_ more performant, but you are out of luck if your ES runtime does not provide them and you cannot or will not polyfill them for some reason. However, all remotely-modern browsers (and Deno) provide these features.
- Encoding speed was not _the_ top priority. `msgpack-es` **uses branching** (if-statements, etc.) and runtime type-checking (`typeof`, etc.) to inspect values and choose the smallest MessagePack representation for them. If you know that all of the numbers you will be encoding are decimals, and speed is a big concern, you may want to copy the code and modify it to get rid of some of the if-statements and just always encode ES `number` values as MessagePack `float` values.
- MessagePack, as a binary format, is **not as easy to inspect as JSON is**. You need a specialized way to view it when you are debugging issues with your application data.
- **No streaming support**, i.e., if you need to encode/decode a large quantity of data
that can't fit in memory all at once, `msgpack-es` will not work for you. I am open
to exploring streaming support in the future, provided it does not affect any of
the library's current strengths for people who do not care about streaming (most of them, presumably).

## Quick Start

### In Your Terminal
```Bash
npm install --save-dev msgpack-es
# or, if you use PNPM:
pnpm install --save-dev msgpack-es
# or, if you use Yarn:
yarn add --dev msgpack-es
```

### Basic Encoding/Decoding
```TypeScript
import { encode, decode } from 'msgpack-es';

const request = {
    type: 'create-thread',
    data: {
        name: 'Buy/Sell Services',
        description: 'Buy and/or advertise any kind of service.',
        nsfw: false,
        msg_limit_per_user_per_hour: 1,

    },
};

const encoded = encode(request); // Uint8Array

// This is where you would normally send the encoded/serialized
// data to the server or something...

const decoded = decode(encoded); // identical to 'request'
```

### Encoding/Decoding MessagePack Extensions
```TypeScript
import { encode, decode, registerExtension } from 'msgpack-es';

// Standard ES6 class
class Color {
    // NOTE: 'msgpack-es' is TypeScript-compatible and this
    // example is TypeScript code; I am using the TypeScript
    // property/parameter shorthand here
    constructor(
        readonly r: number, // integer [0, 255]
        readonly g: number, // integer [0, 255]
        readonly b: number, // integer [0, 255]
    ) {}
}

registerExtension(
    15, // Unique ID for extension, used by encode() and decode()
    Color, // Class value, so encode() can recognize instances
    color => new Uint8Array([color.r, color.g, color.b]), // Encode
    buffer => new Color(buffer[0], buffer[1], buffer[2]), // Decode
);

// NOTE: msgpack-es provides the standard -1 MessagePack
// extension for built-in Date class automatically because
// it is so ubiquitous. You could override it if, say, you
// use the 'moment' library exclusively and want to always
// encode/decode using 'moment' date objects

const appearance = {
    light: true,
    primary: new Color(8, 55, 247),
    accent: new Color(132, 0, 247),
    rootFontSizePx: 16,
    timestamp: new Date(),
};

const encoded = encode(appearance); // Uint8Array

// This is where you would normally send the encoded/serialized
// data to the server or store it or whatever...

const decoded = decode(encoded); // identical to 'appearance'
```

## Configuration

`encode()` is not configurable. The only caveat here is that `undefined`
values in objects or ES6 `Map` instances are skipped. If you want an
"empty" value in a `Map` or object to get encoded as a MessagePack `nil`
value, set it to `null`.

`decode()` can be configured via the `DECODE_OPTIONS` object, which has
the following fields:

- `nilValue`: What to decode MessagePack `nil` values as: `null` or
`undefined`? `undefined` by default because I (Sam Claus) think that [`null`
is a horrible stain on the language](https://medium.com/@oleg008/what-if-we-stop-using-null-d705302b545e), but sometimes other people want/need
to use `null`.
- `badUTF8Handler`: Callback to handle MessagePack `string` values that are
not valid UTF-8. Receives a `Uint8Array` _view_ (not copy) of the relevant
string data, and should either return a decoded value or throw an error if
you want the entire `decode()` call to fail. By default, a `Uint8Array` copy of
the string data is returned (whereas correct UTF-8 would be decoded as an ES
`string`) so that the rest of the `decode()` operation can still complete.
- `unknownExtHandler`: Callback to handle MessagePack `ext` values for which
no decoder has been provided. Receives the integer extension ID and a
`Uint8Array` _view_ of the data, and should either return a decoded value or
throw an error if you want the entire `decode()` call to fail. By default, an
`UnknownExt` instance is returned so the rest of the `decode()` operation can
complete but you can still detect bad/unexpected MessagePack `ext` values.
- `forceES6Map`: By default, MessagePack `map` values will be decoded as
vanilla objects, but `msgpack-es` will fall back to using an ES6 `Map` instance
if it encounters a decoded key of type `object`. Set `forceES6Map` to `true`
if you want to _always_ decode using ES6 `Map`s.

## Optimization

By "optimization", I mean making encode/decode operations take less time and/or
use less memory (RAM).

1. Use `resizeEncodingBuffer()` to tailor memory usage. Let's say you are encoding
a massive object to MessagePack. `msgpack-es` will start the encoding buffer at a
reasonable size, and _grow_ it by re-allocating a new/larger buffer and copying
over the existing content each time it runs out of space. If you know roughly how
much space will be needed before you encode, you should call
`resizeEncodingBuffer()` to allocate enough memory up-front so no extra allocating
and copying needs to happen throughout the process. Another use-case is when you
need to _free_ memory. Let's say you encode one massive object to MessagePack,
send the result somewhere, and from then on you only need to encode small bits of
data. It doesn't make sense to keep around the giant buffer that was used for
encoding the first value because it will just hog memory for no reason. Use
`resizeEncodingBuffer()` to switch to a smaller buffer, which will allow the
browser (or other runtime) to garbage-collect the old/large buffer.
1. Use `encodeView()` instead of `encode()`. When you call `encode()`, the data
you provide is encoded into a global buffer (`Uint8Array`) and then a _copy_ of
it is returned. This is done for safety and ease-of-use. You can, however, use
`encodeView()`, which is identical to `encode()` except that it returns a _view_
of the underlying buffer used by the library. That means time/memory isn't spent
copying the result, but it also means that if you keep the returned `Uint8Array`
around as a variable and make more calls to `encode()`, your variable will
end up pointing to garbage and you will lose the old encoding result. That said,
if you are just, for example, encoding something to then immediately send it to
the server using `fetch()`, the browser (or other runtime) will _already_ make a
copy of the `Uint8Array` you give it, so `encodeView()` can save you an
extra/wasted copy.
1. If you know what you are doing and have a niche use-case where this library
does a lot of unnecessary extra work, you might want to copy the code and modify
it. It is licensed to the public domain so you can do whatever you want with it
and do not even need to give attribution. That said, please be nice and give
some sort of attribution even if it's just a comment in the code to tell
coworkers where the MessagePack implementation originally came from. 🙂
