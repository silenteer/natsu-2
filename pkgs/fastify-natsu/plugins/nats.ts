import type { FastifyPluginAsync, RouteOptions } from 'fastify'
import { connect, ConnectionOptions, NatsConnection, StringCodec, JSONCodec, MsgHdrs, MsgHdrsImpl } from 'nats'
import fp from 'fastify-plugin'

interface NatsOptions {
  connectionOptions?: ConnectionOptions
  codec: 'string' | 'json'
}

export function objectToHeaders(source: Record<string, any>) {
  return MsgHdrsImpl.fromRecord(source)
}

export const nats: FastifyPluginAsync<NatsOptions> = fp(async (instance, opts) => {
  let nc: NatsConnection

  const log = instance.log.child({ name: 'natsu' })
  // add routes dependencies

  log.info({ connectionOpts: opts.connectionOptions }, 'Connecting to nats')
  nc = await connect(opts?.connectionOptions)
  log.info('Connected to nats successfully')

  const stringCodec = StringCodec()
  const jsonCodec = JSONCodec()

  const codec = opts?.codec === 'string'
    ? stringCodec
    : jsonCodec

  instance.addHook('onClose', async () => await nc.close())

  const routes: RouteOptions[] = []

  instance.addHook('onRoute', (routeOpts) => {
    instance.log.info({route: routeOpts.path}, 'Registering')
    routes.push(routeOpts)
  })

  instance.addHook('onReady', async () => {
    for (const route of routes) {
      const subject = route.url.substring(1)

      const sub = nc.subscribe(subject)

        ; (async () => {
          for await (const m of sub) {
            const response = await instance.bridge(subject, {
              data: m.data.length > 0 && codec.decode(m.data),
            })

            m.reply && response && m.respond(codec.encode(response))
          }
        })().then()
    }
  })
}, {
  name: 'fastify-nats',
  dependencies: ['fastify-bridge']
})