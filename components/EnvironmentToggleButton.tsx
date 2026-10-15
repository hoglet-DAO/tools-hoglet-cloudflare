import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
// Asegúrate que esta importación es la correcta para tu configuración i18n
import { useTranslations } from 'next-intl';

import { useRouter, usePathname } from '@/i18n/navigation';
import { useNetwork } from '@/context/NetworkContext';

interface NetworkSwitchButtonProps {
  fullWidth?: boolean;
}

const NetworkSwitchButton: React.FC<NetworkSwitchButtonProps> = ({ fullWidth = false }) => {
  const [isPressing, setIsPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdTime = 1000; // 1 segundo para cambiar de red
  const clickThreshold = 200; // Tiempo máximo para considerar un click (en ms)
  const pressStartTime = useRef<number | null>(null);
  const animationFrameId = useRef<number | null>(null); // Usar ref para el ID de animación
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('Dashboard');
  const { network, setNetwork } = useNetwork();

  const holdCompletedRef = useRef(false);

  useEffect(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    if (isPressing) {
      let startTime: number | null = null;
      holdCompletedRef.current = false;

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const newProgress = Math.min((elapsed / holdTime) * 100, 100);
        setProgress(newProgress);

        if (elapsed < holdTime) {
          animationFrameId.current = requestAnimationFrame(animate);
        } else {
          // Hold completado con éxito
          holdCompletedRef.current = true;
          setIsPressing(false);
          setProgress(0);

          const newNetwork = network === 'supra-testnet' ? 'supra-mainnet' : 'supra-testnet';
          console.log("Hold completed! Switching network to:", newNetwork);
          setNetwork(newNetwork);
        }
      };

      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      setProgress(0);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isPressing, network, setNetwork, holdTime]);

  const startPress = () => {
    holdCompletedRef.current = false;
    pressStartTime.current = Date.now();
    setIsPressing(true);
  };

  const endPress = () => {
    if (!isPressing && !holdCompletedRef.current) return;

    const pressDuration = pressStartTime.current ? Date.now() - pressStartTime.current : 0;
    const wasHoldCompleted = holdCompletedRef.current;

    setIsPressing(false);
    setProgress(0);

    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    // Si fue un click corto ordinario (sin haber hecho hold) y no estamos ya en la home, navegar a home
    if (!wasHoldCompleted && pressDuration < clickThreshold && pathname !== '/') {
      const targetPath = network === 'supra-testnet' ? '/?network=supra-testnet' : '/';
      router.push(targetPath);
    }
  };

  const targetNetworkName = network === 'supra-testnet' ? 'supra-mainnet' : 'supra-testnet';
  const tooltipText = t('holdToSwitch', {
    seconds: holdTime / 1000,
    networkName: targetNetworkName
  });

  const containerSize = fullWidth ? 'w-full h-16' : 'w-16 h-16';
  const buttonSize = 'w-12 h-12';
  const svgSize = 'w-16 h-16'; // El SVG debe ser más grande que el botón para que el círculo se vea alrededor

  return (
    <div 
      className={`relative ${containerSize} flex items-center justify-center group cursor-pointer select-none touch-none`}
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={isPressing ? endPress : undefined} 
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
      onContextMenu={(e) => e.preventDefault()} // Evita el menú contextual en móviles al hacer "hold"
    >
      <motion.button
        className={`relative bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-medium rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.25)] flex items-center justify-center z-10 ${buttonSize} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 pointer-events-none`}
        animate={{
          scale: isPressing ? 0.95 : 1,
          boxShadow: isPressing ? '0 2px 10px rgba(0,0,0,0.3)' : '0 4px 14px rgba(0,0,0,0.25)',
        }}
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        <Image
          src="/hoglet.webp" // Asegúrate que la ruta sea correcta desde /public
          alt="Hoglet Logo"
          width={40}
          height={40}
          className="rounded-full pointer-events-none" // Evita que la imagen interfiera con los eventos del botón
        />
        <span className="absolute bottom-[-18px] left-1/2 transform -translate-x-1/2 text-xs text-gray-300 bg-gray-900 bg-opacity-70 px-2 py-0.5 rounded whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-500 z-20">
            {tooltipText}
        </span>
         <span className="absolute -top-1 -left-1 text-[9px] text-white bg-black bg-opacity-60 px-1 rounded-full font-mono">
           {t(network === 'supra-testnet' ? 'testnetShort' : 'mainnetShort')}
         </span>
      </motion.button>
      {/* Círculo de progreso */}
      {isPressing && progress > 0 && (
        <svg className={`absolute ${svgSize} pointer-events-none`} viewBox="0 0 64 64">
          <motion.circle
            cx="32"
            cy="32"
            r="28" // Radio del círculo de progreso
            fill="none"
            stroke="rgba(0, 191, 255, 0.8)" // Color cian semi-transparente
            strokeWidth="4"
            strokeDasharray="175.93" // Circunferencia (2 * pi * r = 2 * 3.14159 * 28)
            strokeDashoffset={175.93 - (progress / 100) * 175.93}
            transform="rotate(-90 32 32)" // Inicia el progreso desde arriba
          />
        </svg>
      )}
    </div>
  );
};

export default NetworkSwitchButton;
