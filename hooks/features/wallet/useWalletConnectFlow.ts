// src/app/hooks/useWalletConnectFlow.ts
import { useState, useEffect, useCallback } from 'react';
import { useSupraWallet } from '@/context/SupraWalletContext';
import { WalletType, UserProfile } from '@/utils/types';
import { RECENT_WALLET_KEY, WALLET_INFO, TIMINGS } from '@/components/wallet/wallet-constants';

// --- Types ---
type ConnectionStage = 'idle' | 'connecting' | 'signing' | 'success' | 'error' | 'connected-not-signed';

export interface UseWalletConnectFlowProps {
  onConnect?: (account: string) => void;
  onDisconnect?: () => void;
  onClose?: () => void;
}

export const useWalletConnectFlow = ({ onConnect, onDisconnect, onClose }: UseWalletConnectFlowProps) => {
    const wallet = useSupraWallet();
    const [stage, setStage] = useState<ConnectionStage>('idle');
    const [recentWallet, setRecentWallet] = useState<WalletType | null>(null);
    const [targetWallet, setTargetWallet] = useState<WalletType | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

    // Init recent wallet
    useEffect(() => {
        const recent = localStorage.getItem(RECENT_WALLET_KEY) as WalletType;
        if (recent && WALLET_INFO[recent]) setRecentWallet(recent);
    }, []);

    const handleConnect = useCallback(async (walletType: WalletType) => {
        setTargetWallet(walletType);
        setStage('connecting');
        
        try {
            // 1. Connect
            await wallet.connect(walletType);
            
            // 2. Authenticate
            setStage('signing');
            try {
                await wallet.login();
                setStage('success');
                localStorage.setItem(RECENT_WALLET_KEY, walletType);
                setRecentWallet(walletType);
                
                if (wallet.accounts[0]) {
                    onConnect?.(wallet.accounts[0]);
                }
                
                setTimeout(() => {
                    onClose?.();
                    setStage('idle');
                }, TIMINGS.SUCCESS_DISPLAY);

            } catch (authError) {
                console.warn("Auth skipped or failed:", authError);
                setStage('connected-not-signed');
                setTimeout(() => {
                    onClose?.();
                    setStage('idle');
                }, TIMINGS.SUCCESS_DISPLAY);
            }

        } catch (error: any) {
            console.error('Connection failed:', error);
            setStage('error');
            setTimeout(() => {
                setStage('idle');
                onClose?.();
            }, TIMINGS.ERROR_DISPLAY);
        }
    }, [wallet, onConnect, onClose]);

    const handleDisconnect = useCallback(async () => {
        await wallet.disconnect();
        setUserProfile(null);
        onDisconnect?.();
    }, [wallet, onDisconnect]);

    // Profile Update Listener (Legacy)
    useEffect(() => {
        const handleProfile = (e: CustomEvent<UserProfile>) => {
            if (wallet.accounts[0] === e.detail.address) setUserProfile(e.detail);
        };
        window.addEventListener('profile-updated', handleProfile as EventListener);
        return () => window.removeEventListener('profile-updated', handleProfile as EventListener);
    }, [wallet.accounts]);

    const availableWallets = wallet.getAvailableWallets();
    const isLoadingFlow = stage === 'connecting' || stage === 'signing';

    return {
        stage,
        recentWallet,
        targetWallet,
        userProfile,
        handleConnect,
        handleDisconnect,
        availableWallets,
        isLoadingFlow,
        walletError: undefined, // Replace with a valid property or remove if unnecessary
        isConnected: wallet.accounts.length > 0,
        accounts: wallet.accounts,
        walletLoading: wallet.loading,
        balance: wallet.balance,
    };
};
