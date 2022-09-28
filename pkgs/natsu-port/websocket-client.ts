import type {
  NatsPortWSRequest,
  NatsPortWSResponse,
  NatsPortWSErrorResponse,
} from '@silenteer/natsu-type';

import WebSocket from "isomorphic-ws"

const MAX_RETRY_TIMES = 3;
const RETRY_INTERVAL = 5 * 1000;

const waitForOpenConnection = (socket: WebSocket) => {
  return new Promise((resolve, reject) => {
    const maxNumberOfAttempts = 10;

    let currentAttempt = 1;
    const interval = setInterval(() => {
      if (currentAttempt > maxNumberOfAttempts) {
        clearInterval(interval);
        reject(new Error('Maximum number of attempts exceeded'));
      } else if (socket.readyState === socket.OPEN) {
        clearInterval(interval);
        resolve(WebSocket.OPEN);
      }
      currentAttempt++;
    }, 1000);
  });
};

type EventHandler<E> = (event: E) => void

class WebsocketClient {
  private _url: string;
  private _webSocket: WebSocket;
  private _webSocketReconnecting = false;
  private _retriedTimes = 0;
  private _reconnectTimeout: NodeJS.Timeout | undefined;
  private _forceQuit = false;

  onopen?: EventHandler<WebSocket.Event>

  onmessage?: EventHandler<WebSocket.MessageEvent>
  
  onclose?: EventHandler<WebSocket.CloseEvent>
  
  onerror?: EventHandler<WebSocket.ErrorEvent>

  onreconnected?: EventHandler<WebSocket.Event>

  constructor(url: string) {
    this._url = url;
    this._webSocket = new WebSocket(this._url);
    this._open();
  }

  async getReadyState() {
    return new Promise((resolve, reject) => {
      let checker = setInterval(() => {
        if (this._webSocket.readyState === WebSocket.OPEN) {
          clearInterval(checker)
          resolve(this._webSocket.readyState)
        }
      }, 100)
    })
  }

  async send(data: NatsPortWSRequest<string>) {
    try {
      await waitForOpenConnection(this._webSocket);
      this._webSocket.send(JSON.stringify(data));
    } catch (error) {
      console.error(`[WebSocket] Error`, error);
      this.onerror?.(error as any);
    }
  }

  close() {
    this._forceQuit = true;
    this._webSocket.close();
  }

  private _open() {
    console.log("Try to open websocket")
    this._webSocket.onopen = (event: WebSocket.Event) => {
      this._retriedTimes = 0;

      if (this._webSocketReconnecting) {
        this._webSocketReconnecting = false;

        console.log(`[WebSocket] Reconnected ${this._url}`);
        this.onreconnected?.(event);
      } else {
        console.log(`[WebSocket] Opened ${this._url}`);
        this.onopen?.(event);
      }
    };

    this._webSocket.onmessage = (event: WebSocket.MessageEvent) => {
      this.onmessage?.(event);
    };

    this._webSocket.onclose = (event: WebSocket.CloseEvent) => {
      this._cleanUp();
      switch (event.code) {
        case 401:
        case 403:
          console.log(`[WebSocket] Closed ${this._url}`, event);
          this.onclose?.(event);
          break;
        default:
          if (this._forceQuit) {
            console.log(
              `[WebSocket] Closed ${this._url}. Reconnect option is false`,
              event
            );
            this.onclose?.(event);
            break;
          }

          this._retriedTimes++;
          if (this._retriedTimes > MAX_RETRY_TIMES) {
            console.log(
              `[WebSocket] Closed ${this._url}. Cannot reconnect after ${MAX_RETRY_TIMES} retries`,
              event
            );
            this.onclose?.(event);
            break;
          }

          console.log(
            `[WebSocket] Will try to reconnect to ${this._url} after ${
              RETRY_INTERVAL / 1000
            } seconds. Attempts ${this._retriedTimes} / ${MAX_RETRY_TIMES}`,
            event
          );
          this._reconnectTimeout = setTimeout(() => {
            console.log(`[WebSocket] Trying to reconnect to ${this._url}`);
            this._webSocketReconnecting = true;
            this._open();
          }, RETRY_INTERVAL);
          break;
      }
    };

    this._webSocket.onerror = (event: WebSocket.ErrorEvent) => {
      console.error(`[WebSocket] Error`, event);
      this.onerror?.(event);
    };
  }

  private _cleanUp() {
    this._reconnectTimeout && clearTimeout(this._reconnectTimeout);
    this._reconnectTimeout = undefined;
  }
}

export type { NatsPortWSResponse, NatsPortWSErrorResponse };
export { WebsocketClient };
