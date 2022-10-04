import fp from "fastify-plugin"

import port from './plugins/port'
import portWS from './plugins/port.ws'
import load, { Config } from './configuration';

type PortServerOpts = Config

const portServer = fp(async function(server, opts?: PortServerOpts) {
  const config = opts || load()

  server.log.info(config, 'starting server with')

  await server.register(require('@fastify/websocket'))
  await server.register(require('@fastify/cors'), {
    origin: config.origin || [`http://localhost:3000`],
    credentials: config.credentials,
    methods: ['POST'],
  })

  await server.register(port, config as any)
  await server.register(portWS, config as any)

  if (config?.autoStart) {
    await server.listen({
      host: '0.0.0.0',
      port: config.port || 0
    })
  }
}, {
  name: 'fastify-port-server'
})

export {
  portServer,
  type PortServerOpts
}
