import { createContext, useContext } from 'react';

interface WebPortalContextValue {
  container: HTMLElement | null;
}

export const WebPortalContext = createContext<WebPortalContextValue>({
  container: null,
});

export const useWebPortal = () => {
  return useContext(WebPortalContext);
};
