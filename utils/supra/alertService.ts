// src/app/utils/alertService.ts
import Swal, { SweetAlertOptions } from 'sweetalert2'; // Importar SweetAlertOptions
import withReactContent from 'sweetalert2-react-content';
import { getExplorerUrl } from './explorerUtils';

const MySwal = withReactContent(Swal);

// --- CONFIGURACIÓN BASE PARA MODALES OSCUROS NEÓN ---
const neonModalBaseConfig: SweetAlertOptions = {
  background: 'rgba(17, 24, 39, 0.9)', // Fondo oscuro semitransparente (bg-gray-900 con opacidad)
  color: '#e5e7eb', // Color de texto general (gris claro)
  backdrop: `
    rgba(0,0,0,0.6)
    url("/img/space-backdrop-blur.png") // Opcional: una imagen de fondo sutil para el overlay
    left top
    no-repeat
  `, // Fondo oscuro para el overlay
  customClass: {
    popup: 'neon-popup shadow-lg border-2 border-cyan-500/50', // Clase para el contenedor principal del modal
    title: 'neon-title text-2xl mb-4',            // Clase para el título
    htmlContainer: 'neon-html-container text-gray-300', // Para el contenido HTML/texto
    confirmButton: 'neon-button neon-button-confirm',
    cancelButton: 'neon-button neon-button-cancel ml-2', // ml-2 para separar botones
    icon: 'neon-icon',
    // Puedes añadir más: closeButton, actions, footer, etc.
  },
  buttonsStyling: false, // IMPORTANTE: Deshabilitar estilos por defecto de botones para usar los tuyos
};

const neonToastBaseConfig: SweetAlertOptions = {
  ...neonModalBaseConfig, // Heredar algo de la base
  toast: true,
  position: 'bottom-end', // <-- ¡CAMBIO AQUÍ! De 'top-end' a 'bottom-end'
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { // Clases específicas para toasts
    popup: 'neon-toast shadow-md border border-purple-500/50',
    title: 'neon-toast-title text-sm',
    htmlContainer: 'neon-toast-html text-xs',
    timerProgressBar: 'bg-purple-500', // Color de la barra de progreso del timer
  },
  didOpen: (toast: HTMLElement) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  },
};


// --- FUNCIONES DE ALERTA ACTUALIZADAS ---

export const showSuccessToast = (title: string, html?: string) => {
  MySwal.fire({
    ...neonToastBaseConfig,
    icon: 'success', // SweetAlert aplicará su propio estilo al icono, pero podemos sobreescribir colores
    title: title,
    html: html,
    timer: 5000,
    customClass: {
        ...neonToastBaseConfig.customClass,
        icon: 'neon-icon-success', // Clase específica para el icono de éxito
        timerProgressBar: 'bg-green-500',
    }
  });
};

export const showErrorToast = (title: string, html?: string) => {
  MySwal.fire({
    ...neonToastBaseConfig,
    icon: 'error',
    title: title,
    html: html,
    timer: 5000,
    customClass: {
        ...neonToastBaseConfig.customClass,
        icon: 'neon-icon-error',
        timerProgressBar: 'bg-red-500',
    }
  });
};

export const showWarningToast = (title: string, html?: string) => {
  MySwal.fire({
    ...neonToastBaseConfig,
    icon: 'warning',
    title: title,
    html: html,
    timer: 4000,
    customClass: {
        ...neonToastBaseConfig.customClass,
        icon: 'neon-icon-warning',
        timerProgressBar: 'bg-yellow-500',
    }
  });
};

export const showSuccessAlert = (title: string, html?: string) => {
  return MySwal.fire({
    ...neonModalBaseConfig,
    icon: 'success',
    title: title,
    html: html,
    confirmButtonText: 'Awesome!',
    customClass: {
        ...neonModalBaseConfig.customClass,
        confirmButton: 'neon-button neon-button-success', // Estilo específico para botón de éxito
        icon: 'neon-icon-success',
    }
  });
};

export const showErrorAlert = (title: string, html?: string) => {
  return MySwal.fire({
    ...neonModalBaseConfig,
    icon: 'error',
    title: title,
    html: html,
    confirmButtonText: 'Understood',
    customClass: {
        ...neonModalBaseConfig.customClass,
        confirmButton: 'neon-button neon-button-error',
        icon: 'neon-icon-error',
    }
  });
};

export const showConfirmAlert = async (
  title: string,
  text: string,
  confirmButtonText: string = 'Confirm',
  cancelButtonText: string = 'Cancel',
  options: SweetAlertOptions = {} // Para opciones específicas de esta confirmación
): Promise<boolean> => {
  const result = await MySwal.fire({
    ...neonModalBaseConfig, // Aplicar base neón
    title: title,
    text: text,
    icon: 'warning', // Icono por defecto para confirmación
    showCancelButton: true,
    confirmButtonText: confirmButtonText,
    cancelButtonText: cancelButtonText,
    customClass: { // Sobrescribir clases de botones si es necesario
        ...neonModalBaseConfig.customClass, // Heredar clases base
        confirmButton: options.confirmButtonColor || 'neon-button neon-button-confirm-warning', // Clase específica o la de warning
        cancelButton: options.cancelButtonColor || 'neon-button neon-button-cancel',
        icon: 'neon-icon-warning',
    },
    // Los colores directos se pueden pasar en options o definir en CSS
    // confirmButtonColor: '#3085d6', (esto se anulará por `buttonsStyling: false` y CSS)
    // cancelButtonColor: '#d33',
    ...options, // Aplicar opciones personalizadas pasadas
  });
  return result.isConfirmed;
};

// --- NUEVAS FUNCIONES PARA STAKE/UNSTAKE ---

const createExplorerLink = (txHash: string, network: string, text: string = "View on Explorer") => {
    const explorerUrl = getExplorerUrl(network, "transaction", txHash);
    if (!explorerUrl) return '';
    return `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" style="color: #06b6d4; font-weight: bold; text-decoration: underline;">${text}</a>`;
};

export const showTransactionSuccessAlert = (txHash: string, network: string, title = "Transaction Successful!") => {
    const htmlContent = `Your transaction was completed successfully.<br/><br/>${createExplorerLink(txHash, network)}`;
    return showSuccessAlert(title, htmlContent);
};

// Removed DAO-specific alerts
