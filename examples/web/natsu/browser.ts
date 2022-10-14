import { createClient } from '@silenteer/natsu-react-2';
import type { Routes } from 'basic/server';

const {
  useQuery,
  useMutation,
  Provider,
  useNatsuClient,
  useSubscribe,
} = createClient<Routes, any>({
  host: new URL('http://localhost:8000/port'),
  wsHost: new URL('ws://localhost:8000/port'),
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
  Provider,
  useNatsuClient,
  useSubscribe
};