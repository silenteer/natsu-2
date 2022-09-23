import { NatsHandler } from "@silenteer/natsu";
import { NatsService } from "@silenteer/natsu-type";

type PingService = NatsService<'ping', undefined, {msg: string}>

export default {
	subject: 'ping',
	async authorize() { return {code: 'OK'}},
	async validate() { return {code: 'OK'}},
	async handle() {
		return {
			code: 'OK',
			body: {
				msg: 'pong'
			}
		}
	}
} as NatsHandler<PingService>