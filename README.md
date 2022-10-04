### Concept

The whole package is built around fastify-as-a-router, instead of rolling your own router as in version 1. API of the package is heavily inspired by tRPC implementation. Type safety can be used through both client and server. 

### Features

- Simplify unit implementation, you can kind skip detail of REST etc. The model is very similar to normal RPC, you have function on server and you should be able to call it from client side in the similar way
- Nats as a sidecar, so you can call RPC via Nats
- Server call is implemented using a bridge model to give near direct all (see the bench to see the result of the attempt)
- Can fully reuse all of fastify plugins
- Backward compatible with version 1 natsu definition
- maybe embeding nextjs into the package so the full-stack application can be done much easier
- Fluent API to register routes. Type check toward compatability between route and server (aka server cannot provide what the route need)

### TODO
- [x] namespace concept implementation
- [x] client implemenation
- [x] legacy shape so natsu unit in v1 should still work without any migration
- [x] example with client-side included
- [x] better logging
- [ ] integrate with opentelemetry for tracing
- [ ] pub/sub SPI, API
- [ ] test-tools so the implementation can be tested easily
- [ ] conclude configuration for app
- [ ] dedicated protocol testing (port, rpc, nats, via websocket)
- [ ] add more providers (prisma, redis, etc)
- [ ] dev mode and production mode
- [ ] auto test in github actions
- [ ] release