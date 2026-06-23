// src/types/index.ts (o src/types/Project.ts)

const SPIKE_FUN_ADDRESS=process.env.NEXT_PUBLIC_SPIKE_FUN_ADDRESS;

export interface ProjectData {
  id?: string | number;
  tokenAddress?: string;
  dev?: string;
  name?: string;
  symbol?: string;
  tokenDecimals?: number; // Renombrado para coincidir con la DB
  uri: string; 
  network: string; 
  createdAt: string | null; 
  description: string;
  stream?: string | null;
  telegram?: string | null;
  twitter?: string | null;
  website?: string | null;
  github?: string | null;
  unstakePeriodSeconds?: string | null;
  project_type?: string;
}



// Interfaz para los datos del autor de un comentario
export interface UserData {
  walletAddress: string;
  username?: string | null;
  avatarUrl?: string | null;
}

// Interfaz para las imágenes de un comentario
export interface CommentImage {
  id: number;
  url: string;
  altText?: string | null;
}

// La interfaz principal y única para un comentario
export interface Comment {
  id: number;
  text: string;
  createdAt: string; // ISO String
  user: UserData;  
  images: CommentImage[];
  likeCount: number;
  isLikedByCurrentUser?: boolean; 
}


// Tipo para la fecha/hora que aparece en varias partes
type TimestampData = {
  microseconds_since_unix_epoch: number;
  utc_date_time: string;
};

// Tipo para el evento genérico, ya que todos tienen una estructura similar
type EventBase<T = Record<string, any>> = {
  guid: {
    creation_number: string;
    account_address: string;
  };
  sequence_number: string;
  type: string;
  data: T;
};

// Tipos específicos para los datos de cada evento que te interesa
type PumpEventData = {
  description: string;
  dev: string;
  github: string;
  initial_virtual_supra_reserves: string;
  initial_virtual_token_reserves: string;
  name: string;
  platform_fee: string;
  pool: string;
  stream: string;
  symbol: string;
  telegram: string;
  token_address: string; // <-- La propiedad clave que necesitas
  token_decimals: number;
  twitter: string;
  uri: string;
  website: string;
};

// Tipo específico para el evento de registro de pool
type PoolRegisteredEventData = {
    boost_enabled: boolean;
    start_timestamp: string;
    pool_key: {
        creator_addr: string;
        reward_addr: string;
        stake_addr: string;
    };
};

// Unimos los eventos en un tipo de unión discriminada para más seguridad
export type SpecificEvent = 
  | EventBase<PumpEventData> & { type: `${typeof SPIKE_FUN_ADDRESS}::spike_fun::PumpEvent` }
  | EventBase<PoolRegisteredEventData> & { type: `${typeof SPIKE_FUN_ADDRESS}::trust_fa::PoolRegisteredEvent` }
  | EventBase; // Fallback para cualquier otro evento no tipado explícitamente

export type HashDataType = {
  authenticator: {
    Move: {
      Ed25519: {
        public_key: string;
        signature: string;
      };
    };
  };
  block_header: {
    hash: string;
    height: number;
    timestamp: TimestampData;
  };
  hash: string;
  header: {
    chain_id: number;
    expiration_timestamp: TimestampData;
    sender: { Move: string };
    sequence_number: number;
    gas_unit_price: number;
    max_gas_amount: number;
  };
  payload: {
    Move: {
      type: "entry_function_payload";
      function: string;
      type_arguments: string[];
      arguments: string[];
    };
  };
  output: {
    Move: {
      gas_used: number;
      events: SpecificEvent[]; // Usamos nuestro tipo de unión de eventos
      vm_status: string;
    };
  };
  status: "Success" | "Failure"; // Puede ser uno de estos dos valores
};