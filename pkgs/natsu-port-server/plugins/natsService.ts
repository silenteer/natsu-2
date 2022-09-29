import type { NatsConnection, RequestOptions, Subscription } from 'nats';
import { connect, JSONCodec } from 'nats';
import type {
  NatsPortWSResponse,
  NatsPortWSErrorResponse,
  NatsResponse,
} from '@silenteer/natsu-type';

class Queue<TParams> {
  private isProcessing: boolean = false;
  private queue: TParams[] = [];

  constructor(private onProcess: (params: TParams) => Promise<void>) { }

  add(params: TParams) {
    this.queue.unshift(params);
    if (!this.isProcessing) {
      this.process();
    }
  }

  private process() {
    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const params = this.queue.pop();

    params && this.onProcess(params).then(() => {
      this.isProcessing = false;
      this.process();
    });
  }
}

export type NatsConfig = {
  natsURI?: string
  natsUser?: string
  natsPass?: string
}

export function natsService(config: NatsConfig) {
  const subscriptions: {
    [subject: string]: {
      subscription: Subscription;
      connections: Array<{
        connectionId: string;
        onHandle: (
          response: NatsPortWSResponse | NatsPortWSErrorResponse
        ) => void;
      }>;
    };
  } = {};

  let natsConnection: NatsConnection;

  async function getConnection(): Promise<NatsConnection> {
    if (!natsConnection) {
      natsConnection = await connect({
        servers: config.natsURI,
        user: config?.natsUser,
        pass: config?.natsPass,
      });
    }

    return natsConnection;
  }

  const defaultRequestOptions: RequestOptions = {
    timeout: 60 * 1000,
  };

  async function request(params: {
    subject: string;
    data?: Uint8Array;
    options?: Partial<RequestOptions>;
  }) {
    const { subject, data, options } = params;
    const connection = await getConnection();
    return connection.request(subject, data, {
      ...defaultRequestOptions,
      ...options,
    });
  }

  const codec = JSONCodec<NatsResponse>();

  async function subscribe(params: {
    connectionId: string;
    subject: string;
    namespace?: string;
    onHandle: (response: NatsPortWSResponse | NatsPortWSErrorResponse) => void;
  }) {
    const { connectionId, subject, namespace, onHandle } = params;
    const _subject = namespace ? `${subject}.${namespace}` : subject;

    if (
      subscriptions[_subject]?.connections?.some(
        (item) => item.connectionId === connectionId
      )
    ) {
      return;
    }

    let shouldSubscribe: boolean | undefined;
    if (!subscriptions[_subject]?.subscription) {
      console.log('>>>>>>>>>>> subscribing', { _subject, namespace })
      const subscription = (await getConnection()).subscribe(_subject);
      subscriptions[_subject] = { subscription, connections: [] };
      shouldSubscribe = true;
    }

    subscriptions[_subject].connections = [
      ...subscriptions[_subject].connections,
      { connectionId, onHandle },
    ];

    if (!shouldSubscribe) {
      return;
    }

    (async () => {
      for await (const message of subscriptions[_subject].subscription) {
        try {
          const data = message.data ? codec.decode(message.data) : undefined;
          console.log("received new data", {
            subject: message.subject,
            data
          })

          if (data) {
            subscriptions[_subject].connections.forEach(({ onHandle }) => {
              onHandle({
                subject,
                code: data.code as
                  | NatsPortWSResponse['code']
                  | NatsPortWSErrorResponse['code'],
                body: data.body,
              });
            });
          }
        } catch (error) {
          console.error(error);
          subscriptions[_subject]?.connections?.forEach(({ onHandle }) => {
            onHandle({
              subject,
              code: 500,
            });
          });
        }
      }
    })();
  }

  async function unsubscribe(params: {
    connectionId: string;
    subject: string;
    namespace?: string;
  }) {
    const { connectionId, subject, namespace } = params;
    const _subject = namespace ? `${subject}.${namespace}` : subject;

    if (!subscriptions[_subject]) {
      return;
    }

    subscriptions[_subject].connections = subscriptions[
      _subject
    ].connections.filter((item) => item.connectionId !== connectionId);

    if (subscriptions[_subject].connections.length === 0) {
      await subscriptions[_subject].subscription.drain();
      delete subscriptions[_subject];
    }
  }

  const subscriptionQueue = new Queue(subscribe);
  const unsubscriptionQueue = new Queue(unsubscribe);

  return {
    request,
    subscribe: (params: Parameters<typeof subscribe>[0]) =>
      subscriptionQueue.add(params),
    unsubscribe: (params: Parameters<typeof unsubscribe>[0]) =>
      unsubscriptionQueue.add(params),
    unsubscribeAllSubjects: (connectionId: string) => {
      Object.entries(subscriptions).forEach(([subject, { connections }]) => {
        if (connections.some((item) => item.connectionId === connectionId)) {
          unsubscriptionQueue.add({ connectionId, subject });
        }
      });
    },
  };
}
