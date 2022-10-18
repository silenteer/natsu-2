import { createRoute } from '@silenteer/natsu-2'
import z from 'zod'

export default createRoute({
  subject: 'math.minus',
  input: z.object({
    left: z.string(),
    right: z.string()
  }),
  output: z.number(),
  async handle (data, {}) {
    if (data.body == null) throw new Error('invalid state')
    return {
      code: 'OK',
      body: Number(data.body.left) - Number(data.body.right)
    }
  }
})
