import { createRoute } from '@silenteer/natsu-2'
import z from 'zod'

import type { Context } from '../server'

export default createRoute({
  subject: 'math.plus',
  input: z.object({
    left: z.string(),
    right: z.string()
  }),
  output: z.object({
    result: z.number()
  }),
  async handle (data, ctx) {
    if (data.body == null) throw new Error('invalid state')
    return {
      code: 'OK',
      body: {
        result: Number(data.body.left) + Number(data.body.right)
      }
    }
  }
})
