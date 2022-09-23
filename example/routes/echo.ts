import { createRoute } from '@silenteer/natsu-2'
import z from 'zod'

type RedisProvider = {
  redis: string
}

type NatsProvider = {
  nats: string
}

type Context = RedisProvider & NatsProvider

export default createRoute({
  subject: 'echo',
  input: z.object({
		input: z.string()
	}),
  output: z.object({
		output: z.string()
	}),
  async handle (data, ctx) {
    if (data.body == null) throw new Error('invalid state')
    return {
      code: 'OK',
      body: {
				output: data.body.input
			}
    }
  }
})
