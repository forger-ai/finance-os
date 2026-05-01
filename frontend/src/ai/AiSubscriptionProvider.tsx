/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useI18n } from "@/i18n";

type AiSubscriptionContextValue = {
  connected: boolean;
  loading: boolean;
  refresh: () => Promise<boolean>;
  requireAi: () => Promise<boolean>;
  showRequiredModal: () => void;
};

const AiSubscriptionContext = createContext<AiSubscriptionContextValue | null>(
  null,
);

export function AiSubscriptionProvider({ children }: { children: ReactNode }) {
  const es = useI18n();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await window.forgerApp?.getAiSubscriptionStatus?.();
      const nextConnected = Boolean(status?.connected);
      setConnected(nextConnected);
      return nextConnected;
    } catch {
      setConnected(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showRequiredModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  const requireAi = useCallback(async () => {
    const nextConnected = await refresh();
    if (!nextConnected) {
      setModalOpen(true);
    }
    return nextConnected;
  }, [refresh]);

  const value = useMemo(
    () => ({
      connected,
      loading,
      refresh,
      requireAi,
      showRequiredModal,
    }),
    [connected, loading, refresh, requireAi, showRequiredModal],
  );

  return (
    <AiSubscriptionContext.Provider value={value}>
      {children}
      <Dialog
        fullWidth
        maxWidth="xs"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <DialogTitle>{es.aiGate.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography color="text.secondary">{es.aiGate.body}</Typography>
            <Typography color="text.secondary">{es.aiGate.privacy}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setModalOpen(false)}>
            {es.aiGate.confirmButton}
          </Button>
        </DialogActions>
      </Dialog>
    </AiSubscriptionContext.Provider>
  );
}

export function useAiSubscription(): AiSubscriptionContextValue {
  const value = useContext(AiSubscriptionContext);
  if (!value) {
    throw new Error("useAiSubscription must be used within AiSubscriptionProvider");
  }
  return value;
}
