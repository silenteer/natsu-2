import { Router } from '@silenteer/natsu-2'

import plus from './routes/math.plus'
import minus from './routes/math.minus'
import echo from './routes/echo'

import ping from './legacy/ping';
import natsProvider from './providers/nats.provider'

import port from "@silenteer/natsu-port-server-2"

const base = new Router({
  serverOpts: {
    logger: {
      name: 'root',
      level: 'debug'
    }
  },
  listenOpts: {
    port: 8000
  },
  portEnabled: true
})
  .use(natsProvider)

port.portServer({ 
  fastify: base.fastify,
  autoStart: false
})

export type Context = typeof base.Context

const server = base
  .route(plus)
  .route(minus)
  .route(echo)
  .route(ping)

export type Routes = typeof server.Routes

server.start()
  .then(() => {
    // server.call('echo', {})
  })