import { randomUUID } from 'crypto';
import fp from "fastify-plugin";

import type {
  NatsPortWSErrorResponse, NatsPortWSRequest, NatsResponse
} from '@silenteer/natsu-type';

import { NatsConfig, natsService } from "./natsService";
import { HelperConfig, natsHelper } from "./natsHelper";

export type PortWSConfig = HelperConfig & NatsConfig & {
  wsPath?: string
}

export default fp(async function (server, config: PortWSConfig) {
  const nats = natsService(config)
  const helper = natsHelper(config)

  server.get(config.wsPath || "/port", { websocket: true }, (connection, request) => {
    const connectionId = randomUUID();
    const logger = request.log.child({
      id: `ws-${connectionId}`
    })

    logger.debug('incoming websocket request')

    connection.socket.on('close', () => {
      logger.info('connection closed, unsubscribing ...')
      nats.unsubscribeAllSubjects(connectionId);
    });

    connection.socket.on('message', async (message) => {
      let wsRequest: NatsPortWSRequest | undefined;

      try {
        logger.debug({ message: message.toString() }, 'incoming message')
        wsRequest = JSON.parse(message.toString()) as NatsPortWSRequest;
        request.headers = {
          ...wsRequest.headers,
          ...request.headers,
          ['nats-subject']: wsRequest.subject,
        };

        const validationResult = helper.validateWSRequest(wsRequest);
        if (validationResult.code === 400) {
          const response: NatsPortWSErrorResponse = {
            subject: wsRequest.subject,
            code: validationResult.code,
          };
          helper.sendWSResponse({ connection, response });
          return;
        }

        const authenticationResult = await helper.authenticate(request);
        if (authenticationResult.code !== 'OK') {
          connection.destroy(
            new Error(JSON.stringify({ code: authenticationResult.code }))
          );
          return;
        }

        const getNamespaceResult = await helper.getNamespace({
          httpRequest: request,
          natsAuthResponse: authenticationResult.authResponse as NatsResponse,
        });
        if (getNamespaceResult.code !== 'OK') {
          connection.destroy(
            new Error(JSON.stringify({ code: authenticationResult.code }))
          );
          return;
        }

        if (wsRequest.action === 'subscribe') {
          nats.subscribe({
            connectionId,
            subject: wsRequest.subject,
            namespace: getNamespaceResult.namespace,
            onHandle: (response) => {
              console.log("sending response", { response })
              helper.sendWSResponse({ connection, response });
            },
          });
        } else if (wsRequest.action === 'unsubscribe') {
          nats.unsubscribe({
            connectionId,
            subject: wsRequest.subject,
            namespace: getNamespaceResult.namespace,
          });
        } else {
          connection.destroy(new Error('Unsupported operation'));
        }
      } catch (error) {
        const response: NatsPortWSErrorResponse = {
          subject: wsRequest?.subject as string,
          code: 500,
          body: JSON.stringify(error),
        };
        helper.sendWSResponse({ connection, response });
      }
    });
  })
}, {
  name: 'nats-port-ws',
  dependencies: ['@fastify/websocket']
})