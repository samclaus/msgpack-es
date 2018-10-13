# Important

This repository is a work in progress; please do not submit issues. I am building it in
tandem with other projects so I will add what I need first and make the library more
configurable and general-purpose in the future.

## Todo

The following are on my list, in order of priority.

- [ ] Working encoder
- [ ] Working decoder
- [ ] ~~Write my own IEEE-754 encode/decode because the library I use has a sketchy license~~
- [X] Use DataView to write float64s and other number types
- [ ] Add configuration options and refine API
  - Behavior for undefined values in maps (currently omitted when encoding)
  - Decode maps to objects or ES6 Maps (currently decoded to objects)
  - etc.
- [ ] Add documentation to README
- [ ] Add thorough tests
- [ ] Add prebuilt JavaScript distribution + TypeScript definition files