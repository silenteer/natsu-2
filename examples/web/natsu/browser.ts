
import { connect, connectWS } from '@silenteer/natsu-port-2';
import { createNatsuProvider } from '@silenteer/natsu-react-2';

import type { Routes } from 'basic/server';

const {
  useQuery,
  useMutation,
  NatsuProvider,
  useNatsuClient,
  useSubscribe,
} = createNatsuProvider<Routes, any>({
  natsuClient: connect({
    serverURL: new URL('http://localhost:8000/port'),
  }),
  makeNatsuSocketClient() {
    return connectWS({
      serverURL: new URL('ws://localhost:8000/port')
    })
  },
  queryClientConfig: {
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false
      }
    }
  }
});

export {
  useQuery,
  useMutation,
  NatsuProvider,
  useNatsuClient,
  useSubscribe
};