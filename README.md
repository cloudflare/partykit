## 🎈 PartyServer

_Much like life, this is a Work in Progress._

Libraries / Examples / Documentation for building real-time apps (and more!) with [Cloudflare Workers](https://workers.cloudflare.com/). Powered by Durable Objects, Inspired by [PartyKit](https://www.partykit.io/).

This is the main repository for PartyServer. It contains the following packages:

[PartyServer](/packages/partyserver/README.md) - The core library for building real-time applications with Durable Objects. This library enhances a standard Durable Object to make it easier to work with WebSockets, as well as adding some additional features like lifecycle hooks and broadcasting.

[PartySocket](/packages/partysocket/README.md) - A library for working with WebSockets. It features reconnections, buffering, resilience, and more.

[Y-PartyServer](/packages/y-partyserver/README.md) - A library that adds Yjs support to PartyServer. Yjs is a CRDT library that allows for real-time collaborative editing. This library exposes a base class extending PartyServer that adds Yjs support, with utility hooks for loading/saving Yjs documents from any external storage.

[🥖 partysub](/packages/partysub/README.md) - A library for doing pubsub at scale with PartyServer. It lets you configure a "room" to be backed by N separate Durable Object instances, and a strategy for spreading the load across the world concentrated in configurable locations.

[partysync](/packages/partysync/README.md) - An experimental library to synchronise state from a Durable Object to a client.

[⏱️ partywhen](/packages/partywhen/README.md) - A library for scheduling tasks at scale.

[hono-party](/packages/hono-party/README.md) - A middleware for Hono to handle PartyServer requests.

### Fixtures

We have a set of small examples for PartyServer in the [`fixtures`](/fixtures/) directory. These are small, self-contained examples that demonstrate how to use PartyServer in different ways. We will expand this repository with broader (and deeper!) examples in the future.

Reach out to [@threepointone on twitter](https://twitter.com/threepointone) or the [Cloudflare Workers Discord](https://discord.com/invite/cloudflaredev) to follow progress, and if you have any questions or feedback.


## Installation

```bash
# Installation instructions
```


## Usage

```python
# Usage examples
```


## Contributing

Contributions are welcome!
