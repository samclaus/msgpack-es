# msgpack-ts

Fast MessagePack implementation in TypeScript. Designed as a faster, smaller
alternative to `msgpack-lite`. Both the `Encoder` and `Decoder` are quite
configurable, but performance was prioritized with as little branching as
possible.

**TODO**

- Add thorough tests
- Add benchmarks

**You can optimize further**

If your MessagePack traffic contains many or large binary buffers, you may
want to fork this repo and alter the `takeBinary(length)` method of the
`Decoder` to use `this.buffer.subarray` in place of `this.buffer.slice`,
because `Uint8Array.slice()` creates a copy of the bytes. This library
assumes that your messages will not consist primarily of binary objects
and thus it is undesirable to return subviews of the same buffer being
decoded because they will hold references to the entire buffer that was
decoded, likely keeping it in memory when it is not needed.

## Quick Start

For more information, read the [docs](#documentation).

```TypeScript
import { Encoder, Decoder } from "msgpack-ts";

/**
 * Both x and y will be in range [0, 255].
 */
class Coordinate
{
    static encode(coord: Coordinate): Uint8Array
    {
        return new Uint8Array([coord.x, coord.y]);
    }

    static decode(data: Uint8Array): Coordinate
    {
        return new Coordinate(data[0], data[1]);
    }

    static backwardsDecode(data: Uint8Array): Coordinate
    {
        return new Coordinate(data[1], data[0]);
    }

    constructor(
        readonly x: number,
        readonly y: number
    ){}
}

function main()
{
    const message: SomeInterface = {
        type: "add-user",
        data: {
            firstName: "Jane",
            lastName: "Doe",
            age: 27,
            female: true,
            location: new Coordinate(10, 192),
            username: "janedoe92",
            passwordHash: new Uint8Array(32)
        }
    };

    Encoder.global.registerExt(Coordinate, 0, Coordinate.encode);
    Decoder.global.registerExt(0, Coordinate.decode);

    // Static encode() uses the Encoder.global instance
    const encoded = Encoder.encode(message);

    // Static decode() uses the Decoder.global instance
    const decoded = Decoder.decode<SomeInterface>(encoded);

    // Create separate instances if you need multiple configurations
    const myDecoder = new Decoder();
    myDecoder.nilValue = undefined;
    myDecoder.allowInvalidUTF8 = true;
    myDecoder.allowUnknownExts = true;
    myDecoder.registerExt(0, Coordinate.backwardsDecode);

    // Both Encoder and Decoder support cloning instances
    const slightlyDifferent = myDecoder.clone();
    slighlyDifferent.nilValue = null;
}
```

## Documentation

### `class Encoder`

**static**

- `Encoder.global: Encoder`

    A global `Encoder` instance, purely for convenience.

- `Encoder.encode(data: any, initBuffSize?: number): Uint8Array`

    Convenience function to call `Encoder.global.encode()`.

**instance**

- `Encoder.initialBufferSize = 128`

    The initial number of bytes to allocate when encoding; buffer
    will be grown by factors of 2 as necessary.

- `Encoder.encode(data: any, initBuffSize = this.initialBufferSize): Uint8Array`

    Encode a JavaScript object or primitive to MessagePack format.
    You may provide a second argument to override the initial buffer
    size for the single encoding operation.

- `Encoder.registerExt<T>(ctor: new (...args: any[]) => T, type: number, encoderFn: (data: T) => Uint8Array)`

    Register an encoder for an object class. `type` MUST be in the range `[-128, 127]` or a `RangeError`
    will be thrown. Negative types are reserved by the MessagePack spec and SHOULD not be used, unless
    this library does not provide an extension added to the spec or the implementation is found to be
    inadequate.

    **Standard Extensions Registered By Default**

    - `-1 (Timestamp)`

        JavaScript `Date` objects will be encoded using the standard `Timestamp` extension type, unless
        overriden.

- `Encoder.clone(): Encoder`

    Creates an independent clone of the `Encoder` with the same
    configuration values and registered extensions.


### `class Decoder`

**static**

- `Decoder.global: Decoder`

    A global `Decoder` instance, purely for convenience.

- `Decoder.decode<T = any>(data: ArrayBuffer | Uint8Array): T`

    Convenience function to call `Decoder.global.decode()`.

**instance**

- `Decoder.nilValue: null | undefined = null`

    Value the MessagePack `nil` constant should be interpreted as.

- `Decoder.allowInvalidUTF8 = false`

    If false, an error will be thrown if a MessagePack `str` type is
    encountered and the data is not valid UTF-8. If true, the `str`
    data will be passed through opaquely as a `Uint8Array`.

- `Decoder.allowUnknownExts = false`

    If false, a `RangeError` will be thrown whenever an unrecognized extension type is encountered. If
    true, the extension data will be passed through opaquely as an
    [`Decoder.UnknownExt`](#interface-decoderunknownextseq).

- `Decoder.mapBehavior = Decoder.MapBehavior.PreferJSON`

    Determines how MessagePack `map` values are decoded. See
    [`Decoder.MapBehavior`](#enum-decodermapbehavior) for options.

- `Decoder.decode<T = any>(data: ArrayBuffer | Uint8Array): T`

    Decode MessagePack data into a JS object or primitive.

- `Decoder.clone(): Decoder`

    Creates an independent clone of the `Decoder` with the same
    configuration values and registered extensions.

### `interface Decoder.UnknownExtSeq`

Opaque tuple of an extension type identifier and the raw data associated with it.

- `type: number`

    The extension type which did not have a registered decoder.

- `data: Uint8Array`

    The opaque data.

### `enum Decoder.MapBehavior`

Determines `Decoder` behavior when a MessagePack `map` is encountered.

- `PreferJSON = 0`

    Maps will be decoded as native JS objects, unless a key is decoded
    whose JS type evaluates to `object`, in which case all decoded keys
    will be abandoned and the map will be decoded from scratch into an
    ES6 Map which supports arbitrary key types.

- `AlwaysJSON = 1`

    Maps will be always be decoded as native JS objects. This means all
    decoded keys will be coerced to strings, which is almost certainly
    undesirable if decoding maps with objects or arrays as keys.

- `AlwaysES6Map = 2`

    Maps will always be decoded as ES6 Map objects.