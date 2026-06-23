// src/app/hooks/useWalletModalState.ts
import { useState, useEffect, useCallback } from 'react';

export interface UseWalletModalStateProps {
  isOpen: boolean;
  onClose?: () => void;
  stage: string; // The connection stage, used to prevent closing during critical moments
}

export const useWalletModalState = ({ isOpen, onClose, stage }: UseWalletModalStateProps) => {
  const [showModal, setShowModal] = useState(false); // Internal state for Dialog

  // Sync internal showModal with external isOpen prop
  useEffect(() => {
    setShowModal(isOpen);
  }, [isOpen]);

  const handleModalClose = useCallback((open: boolean) => {
    if (!open) {
      if (stage === 'connecting' || stage === 'signing') {
        // Prevent closing during critical stages
        return; 
      }
      onClose?.(); // Notify parent about the closure. Parent should then set isOpen=false.
    }
  }, [stage, onClose]);

  return {
    showModal,
    setShowModal,
    handleModalClose,
  };
};
