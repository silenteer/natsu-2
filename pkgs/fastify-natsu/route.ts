import type { NatsService } from '@silenteer/natsu-type'
import type { NatsHandler } from '@silenteer/natsu'
import fp from 'fastify-plugin'
import './plugins/provider'

import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import * as Zod from 'zod'
import { inferValue, Provider } from './plugins/provider'

type MakeOptional<T, key extends keyof T> = Partial<Pick<T, key>> & Omit<T, key>

type ContextShape = Record<string, any>
export type RouteDef<path extends string, req, res, ctx extends ContextShape> = MakeOptional<NatsHandler<NatsService<path, req, res>, ctx>, 'authorize' | 'validate'>
  & {
    input?: Zod.Schema<req> | ((zod: typeof Zod) => Zod.Schema<req>)
    output?: Zod.Schema<res> | ((zod: typeof Zod) => Zod.Schema<res>)
  }

type AnyRouteDef = RouteDef<any, any, any, any>

function logger(req: FastifyRequest, ak?: Record<string, any>) {
  return req.server.log.child({ name: req.id, ...ak })
}

async function combineData(req: FastifyRequest, rep: FastifyReply) {
  const combinedData = Object.assign({}, req.params, req.body, req.query);
  req.log.debug({
    params: req.params,
    body: req.body,
    query: req.query,
    combineData
  }, 'combining')
  req.body = combinedData;
  req['data'] = { headers: req.headers, body: req.body }
}

function validateZodInput(def: AnyRouteDef): preHandlerAsyncHookHandler {
  return async function validateZod(req, rep) {
    if (def.input != null) {
      const log = logger(req)
      req.log.debug({ def }, "Calling zod input")

      
      const parseResult = typeof def.input === 'function' 
        ? def.input(Zod).safeParse(req.body)  
        : def.input.safeParse(req.body)
        
      if (!parseResult.success) {
        req.log.info(parseResult, 'Invalid request found, responding 400')
        rep
          .code(400)
          .send({
            code: 400,
            errors: parseResult
          })
        return rep
      }
    }
  }
}

function validatePreHandler(def: AnyRouteDef): preHandlerAsyncHookHandler {
  return async function validate(req, rep) {
    if (def.validate != null) {
      req.log.debug({ def }, "Calling validation")
      const validationResult = await def
        .validate(req['data'], req._provider as any)
        .catch(e => {
          req.log.error(e, "caught an uncaught exception")
          return {
            code: 500,
            errors: e
          }
        })

      if (validationResult.code !== 'OK') {
        req.log.info({ validationResult }, "invalid validation, respnding 400")
        !rep.sent && rep
          .code(validationResult.code || 400)
          .send({
            code: 400,
            errors: validationResult.errors
          })

        return rep
      }
    }
  }
}

function authorizePreHandler(def: AnyRouteDef): preHandlerAsyncHookHandler {
  return async function authorize(req, rep) {
    if (def.authorize != null) {
      req.log.debug({ def }, "Calling authorization")
      const authorizationResult = await def
        .authorize(req['data'], req._provider as any)
        .catch(e => ({ code: 500, errors: e }))

      if (authorizationResult.code !== 'OK') {
        req.log.info({ authorizationResult }, "invalid authorization found, responding 403")
        !rep.sent && rep
          .code(authorizationResult.code || 403)
          .send({
            code: authorizationResult.code || 403,
            errors: authorizationResult.errors
          })

        return rep
      }
    }
  }
}

async function combineProviders(req: FastifyRequest, rep: FastifyReply) {
  Object.assign(req._provider, req.server._provider)
}

export type Route<
  path extends string,
  input,
  output,
  ctx extends Record<string, any>
> = FastifyPluginAsync<{
  _route: {
    subject: path
    input: input
    output: output
  },
  _ctx: ctx
}>

const METHODS = ['get', 'post'] as const;

type inferMeta<T> = T extends Provider<any, any, any, any, infer M> ? M : never;

export type Dependency<D extends Provider<any, any, any, any, any>> = [D, inferMeta<D>]

export type RouteOptions = {
  dependencies: GenericFastifyRequestHook[]
}

type GenericFastifyRequestHook = (req: FastifyRequest, rep: FastifyReply) => Promise<void>

export function createRoute<
  ctx extends ContextShape,
  path extends string,
  req,
  res
>(def: RouteDef<path, req, res, ctx>, opts?: RouteOptions): Route<path, req, res, ctx> {
  return fp(async (fastify) => {
    const address = def.subject.startsWith('/')
      ? def.subject
      : `/${def.subject}`

    METHODS.forEach(m => {
      fastify[m](address, {
        preValidation: [combineData, ...opts?.dependencies || []],
        preHandler: [
          combineProviders,
          validateZodInput(def),
          validatePreHandler(def),
          authorizePreHandler(def)
        ],
        onError: async function onRouteUnexpectedError(req, rep, error) {
          rep.log.error({ error, def }, "caught an unexpected error, responding 500");
          rep.status(500)

          return {
            code: 500,
            errors: error
          }
        }
      }, async (req, rep) => {
        const headers = req.headers
        const data = req.body

        req.log.debug({ headers, data, def }, "calling handle")

        // fastify will catch the 500
        const result = await def.handle(req['data'], req._provider as any)
          .catch(error => {
            req.log.error({ error, headers, data }, "unexpected error occured");
            return {
              code: 500,
              errors: error
            }
          })

        if (result.code === 'OK') {
          result.code = 200
          rep.code(200)
        } else if (result.code) {
          rep.code(result.code)
        }

        req.log.debug({ result, def }, "Finished route processing")

        return result
      })
    })

  }, {
    name: `route-${def.subject}`,
    dependencies: [
      'fastify-provider'
    ]
  })
}


export class RouteBuilder<
  path extends string,
  input,
  output,
  ctx extends ContextShape
> {

  static new<T extends string>(name: T) {
    return new RouteBuilder<any, T, any, {}>(name)
  }

  private partialDef: Partial<AnyRouteDef>

  constructor(name: string) {
    this.partialDef = {}
    this.partialDef.subject = name
  }

  private deps: GenericFastifyRequestHook[]

  input<T>(input: Required<RouteDef<any, T, any, any>>['input']) {
    this.partialDef.input = input
    return this as unknown as RouteBuilder<path, T, output, ctx>
  }

  output<T>(output: Required<RouteDef<any, any, T, any>>['output']) {
    this.partialDef.output = output
    return this as unknown as RouteBuilder<path, input, T, ctx>
  }

  validate(validate: Required<RouteDef<path, input, output, ctx>>['validate']) {
    this.partialDef.validate = validate
    return this as unknown as RouteBuilder<path, input, output, ctx>
  }

  authorize(authorize: Required<RouteDef<path, input, output, ctx>>['authorize']) {
    this.partialDef.authorize = authorize
    return this as unknown as RouteBuilder<path, input, output, ctx>
  }

  handle(handle: Required<RouteDef<path, input, output, ctx>>['handle']) {
    this.partialDef.handle = handle
    return this as unknown as RouteBuilder<path, input, output, ctx>
  }

  depends<
    T extends Provider<any, any, any, any, any>,
    Ctx extends inferValue<T>
  >(provider: T, meta?: inferMeta<T>) {
    this.deps.push(provider[1](meta))
    return this as unknown as RouteBuilder<path, input, output, Ctx & ctx>
  }

  build(): Route<path, input, output, ctx> {
    return createRoute<ctx, path, input, output>(this.partialDef as any, { dependencies: this.deps })
  }
}

