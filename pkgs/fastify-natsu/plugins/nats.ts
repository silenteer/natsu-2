import type { FastifyPluginAsync, RouteOptions } from 'fastify'
import { connect, ConnectionOptions, NatsConnection, StringCodec, JSONCodec, MsgHdrs, MsgHdrsImpl } from 'nats'
import fp from 'fastify-plugin'
import './bridge'

export type NatsOptions = {
  connectionOptions?: ConnectionOptions
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

  const codec = JSONCodec()
  log.debug("use JSON codec only")

  instance.addHook('onClose', async () => await nc.close())

  const routes: RouteOptions[] = []

  instance.addHook('onRoute', (routeOpts) => {
    if (routeOpts['websocket']) return

    if (
      routeOpts.method.includes('POST')
    ) {
      instance.log.info({
        method: routeOpts.method,
        url: routeOpts.url
      }, 'Registering')

      routes.push(routeOpts)
    }
  })

  instance.addHook('onReady', async () => {
    for (const route of routes) {
      const subject = route.url.substring(1)
      const sub = nc.subscribe(subject)

        ; (async () => {
          for await (const m of sub) {
            try {
              const data = m.data.length > 0 && codec.decode(m.data)
              log.debug({
                data,
                route
              }, 'incoming message')

              const result = await instance.bridge(subject, { data })
                .catch(error => ({
                  code: 500,
                  errors: error
                }))

              if (!result.code) {
                throw new Error("invalid bridge result")
              }

              if (result && m.reply) {
                // Really need to define the protocol here. We actually copied the header from request to response
                const response = {
                  headers: { ...data?.['headers'], ...result?.headers },
                  body: result?.body,
                  code: result.code
                }

                log.debug({
                  response, 
                  route
                }, "responding with")

                m.respond(codec.encode(response))
              }
            } catch (e) {
              log.error(e, "natsu uncaught exception")
            }
          }
        })()
          .then()
    }
  })
}, {
  name: 'fastify-nats',
  dependencies: ['fastify-bridge']
})