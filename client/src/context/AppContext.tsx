import React, { createContext, useContext, useState } from 'react';

interface AppContextValue {
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
}

const AppContext = createContext<AppContextValue>(null!);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppContext.Provider value={{ loading, setLoading, error, setError }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);