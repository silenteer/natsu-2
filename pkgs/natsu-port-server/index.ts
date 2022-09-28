import * as yup from 'yup';
import fastify from 'fastify';
import 'colors';

import config from './configuration';

import port from './plugins/port'
import portWS from './plugins/port.ws'

async function start() {
  const server = fastify({
    logger: true
  })

  server.log.info(config, 'starting server with')

  await server.register(require('@fastify/websocket'))
  await server.register(require('@fastify/cors'), {
    origin: config.origin,
    credentials: config.credentials,
    methods: ['POST'],
  })

  await server.register(port, { portPath: config.httpPath })
  await server.register(portWS, { wsPath: config.wsPath })

  await server.listen({
    host: '0.0.0.0',
    port: config.port
  })

  return server
}

export default {
  start,
};
