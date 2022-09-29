import type { NatsService } from '@silenteer/natsu-type'
import type { NatsHandler } from '@silenteer/natsu'
import fp from 'fastify-plugin'

import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import type Zod from 'zod'

type MakeOptional<T, key extends keyof T> = Partial<Pick<T, key>> & Omit<T, key>

type ContextShape = Record<string, any>
export type RouteDef<path extends string, req, res, ctx extends ContextShape> = MakeOptional<NatsHandler<NatsService<path, req, res>, ctx>, 'authorize' | 'validate'>
  & {
    input?: Zod.Schema<req>
    output?: Zod.Schema<res>
  }

type AnyRouteDef = RouteDef<any, any, any, any>

function logger(req: FastifyRequest, ak?: Record<string, any>) {
  return req.server.log.child({ name: req.id, ...ak })
}

function validateZodInput(def: AnyRouteDef): preHandlerAsyncHookHandler {
  return async (req, rep) => {
    if (def.input != null) {
      const log = logger(req)

      const parseResult = def.input.safeParse(req.body)
      if (!parseResult.success) {
        log.error(parseResult, 'Invalid request found')
        rep
          .code(400)
          .send({ errorMsg: 'Invalid input', ...parseResult })
        return rep
      }
    }
  }
}

function validatePreHandler(def: AnyRouteDef): preHandlerAsyncHookHandler {
  return async (req, rep) => {
    if (def.validate != null) {
      const validationResult = await def.validate({ headers: req.headers, body: req.body }, req._provider as any)

      if (validationResult.code !== 'OK') {
        !rep.sent && rep
          .code(validationResult.code)
          .send(validationResult.errors)
        
          return rep
      }
    }
  }
}

function authorizePreHandler(def: AnyRouteDef): preHandlerAsyncHookHandler {
  return async (req, rep) => {
    if (def.authorize != null) {
      const authorizationResult = await def.authorize({ headers: req.headers, body: req.body }, req._provider as any)
      if (authorizationResult.code !== 'OK') {
        !rep.sent && rep
          .code(authorizationResult.code)
          .send(authorizationResult.errors)
        
        return rep
      }
    }
  }
}

async function combineData(req: FastifyRequest, rep: FastifyReply) {
  const combinedData = Object.assign({}, req.params, req.body, req.query);
  req.body = combinedData;
}

async function combineProviders(req: FastifyRequest, rep: FastifyReply) {
  Object.assign(req._provider, req.server._provider)
}

export type Route<
  path extends string,
  req,
  res,
  ctx extends Record<string, any>
> = FastifyPluginAsync<{
  _route: {
    subject: path
    input: req
    output: res
  },
  _ctx: ctx
}>

export function createRoute<
  ctx extends ContextShape,
  path extends string,
  req,
  res
>(def: RouteDef<path, req, res, ctx>): Route<path, req, res, ctx> {
  return fp(async (fastify) => {
    const address = def.subject.startsWith('/')
      ? def.subject
      : `/${def.subject}`

    fastify.all(address, {
      preValidation: [combineData],
      preHandler: [
        combineProviders,
        validateZodInput(def),
        validatePreHandler(def),
        authorizePreHandler(def)
      ]
    }, async (req, rep) => {
      const headers = req.headers
      const data = req.body

      // fastify will catch the 500
      const result = await def.handle({
        headers: headers, 
        body: data as any
      }, req._provider as any)

      if (result.code === 'OK') {
        rep.code(200)
      } else if (result.code) {
        rep.code(result.code)
      }
      
      return result
    })
  }, {
    name: `route-${def.subject}`,
    dependencies: [
      'fastify-provider'
    ]
  })
}