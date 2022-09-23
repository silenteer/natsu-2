import type { FastifyPluginAsync, FastifyRequest, RouteOptions } from 'fastify'
import { connect, headers, ConnectionOptions, NatsConnection, StringCodec, JSONCodec, MsgHdrs } from 'nats'
import { request } from 'urllib'
import fp from 'fastify-plugin'

// Geting type def
import './plugins/client'

interface NatsOptions {
  connectionOptions?: ConnectionOptions
  codec: 'string' | 'json'
}

export function headersToObject (headers?: MsgHdrs) {
  if (headers == undefined) return {}

  const result: Record<any, any> = {}
  for (const [key, value] of headers) {
    result[key] = value
  }
  return result
}

export function objectToHeaders (source: Record<string, any>) {
  const hdrs = headers()
  Object.keys(source).forEach(key => {
    hdrs.append(key, source[key])
  })
  return hdrs
}

export const natsPlugin: FastifyPluginAsync<NatsOptions> = fp(async (instance, opts) => {
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
    routes.push(routeOpts)
  })

  instance.all('/_echo', (req, rep) => {
    rep.headers(req.headers)
    rep.header('x-echo', 'true')
    rep.send(req.body)
  })

  instance.all('/port', async (req, rep) => {
    const log = req.log.child({
      name: `port-${req.id}`
    })
    const subject = req.headers.subject

    if (typeof subject !== 'string') {
      return await rep.status(400)
        .send({ errorMsg: 'Invalid request' })
    }

    const body = Object.assign({}, req.query, req.params, req.body)
    const headers = objectToHeaders(req.headers)

    log.debug({ subject, body, headers, oHeaders: req.headers }, 'fwd to nats')

    const response = await nc.request(subject, codec.encode(body), {
      headers,
      timeout: 5000
    })

    log.debug({ body: codec.decode(response.data) }, 'received')

    const responseData = response.data.length > 0
      ? codec.decode(response.data)
      : undefined

    log.debug({
      headers: headersToObject(response.headers),
      responseData
    })
    rep.headers(headersToObject(response.headers)).send(responseData)
  })

  instance.addHook('onReady', async () => {
    for (const route of routes) {
      const subject = route.url.substring(1)

      const sub = nc.subscribe(subject)
      const logger = log.child({ route: route.url })

      ;(async () => {
        for await (const m of sub) {
          logger.debug({
            subject: m.subject,
            headers: m.headers,
            body: codec.decode(m.data)
          }, 'Received a new message')

          const result = await instance.call(
            subject, 
            m.data.length > 0 && codec.decode(m.data), {
            ...headersToObject(m.headers),
          })

          // data is a buffer, nats will handle that automatically
          m.reply && result.data && m.respond(result.data)
        }
      })().then()
    }
  })
}, {
  name: 'fastify-nats',
  dependencies: ['fastify-client']
})
